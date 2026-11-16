from __future__ import annotations

import hashlib
import secrets
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.redis import redis_client
from app.core.security import hash_password
from app.models.user import User
from app.models.widget import WidgetConfig, WidgetSession

# Redis-backed distributed rate limiter with in-memory fallback
# Uses sliding window via Redis sorted sets for cross-instance consistency
_IN_MEMORY_BUCKETS: dict[str, deque[float]] = {}

_ENABLE_REDIS = False


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _rate_limit_redis(key: str, limit: int, window_seconds: int) -> bool:
    """Redis sliding window rate limiter. Returns True if request is allowed."""
    now = time.time()
    pipeline = redis_client.pipeline()
    pipeline.zadd(key, {str(now): now})
    pipeline.zremrangebyscore(key, 0, now - window_seconds)
    pipeline.zcard(key)
    pipeline.expire(key, window_seconds)
    results = pipeline.execute()
    count = results[2]
    return count <= limit


def _rate_limit_memory(key: str, limit: int, window_seconds: int) -> bool:
    """In-memory sliding window fallback."""
    now = time.time()
    bucket = _IN_MEMORY_BUCKETS.setdefault(key, deque())
    cutoff = now - window_seconds
    while bucket and bucket[0] < cutoff:
        bucket.popleft()
    if len(bucket) >= limit:
        return False
    bucket.append(now)
    return True


def rate_limit(key: str, limit: int, window_seconds: int) -> None:
    allowed = False
    if _ENABLE_REDIS:
        try:
            allowed = _rate_limit_redis(key, limit, window_seconds)
        except Exception:
            allowed = _rate_limit_memory(key, limit, window_seconds)
    else:
        allowed = _rate_limit_memory(key, limit, window_seconds)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )


def get_or_create_widget_config(db: Session) -> WidgetConfig:
    cfg = db.query(WidgetConfig).order_by(WidgetConfig.id.asc()).first()
    if cfg:
        return cfg
    cfg = WidgetConfig(allowed_domains=[])
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return cfg


def update_widget_config(db: Session, data: dict) -> WidgetConfig:
    cfg = get_or_create_widget_config(db)
    for k, v in data.items():
        if v is not None and hasattr(cfg, k):
            setattr(cfg, k, v)
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return cfg


def normalize_origin(origin: str | None) -> str | None:
    if not origin:
        return None
    origin = origin.strip()
    if not origin:
        return None
    try:
        p = urlparse(origin)
        if p.scheme and p.netloc:
            return f"{p.scheme}://{p.netloc}"
    except Exception:
        return None
    return origin


def extract_origin(request: Request, page_url: str | None = None) -> str | None:
    origin = normalize_origin(request.headers.get("origin"))
    if origin:
        return origin
    referer = normalize_origin(request.headers.get("referer"))
    if referer:
        return referer
    return normalize_origin(page_url)


def validate_widget_origin(cfg: WidgetConfig, request: Request, page_url: str | None = None, require_when_configured: bool = True) -> str | None:
    allowed = [normalize_origin(d) for d in (cfg.allowed_domains or []) if isinstance(d, str) and d.strip()]
    allowed = [d for d in allowed if d]
    origin = extract_origin(request, page_url)
    if not allowed:
        return origin
    if not origin:
        if require_when_configured:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Origin is required for this widget")
        return None
    if origin not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Origin not allowed")
    return origin


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_host_identity_token(token: str, origin: str, cfg: WidgetConfig | None = None) -> dict | None:
    """
    Verify a host-signed identity token.
    The host backend signs a JWT with customer identity and metadata.
    We validate signature, expiry, audience, issuer, and allowed origin.
    Uses the database widget config (cfg) if provided; falls back to settings.
    """
    if not token:
        return None

    # Resolve verification parameters from config or settings
    public_key = None
    jwks_url = None
    issuer = None
    audience = None
    if cfg:
        public_key = cfg.host_identity_public_key
        jwks_url = cfg.host_identity_jwks_url
        issuer = cfg.host_identity_issuer
        audience = cfg.host_identity_audience
    if not public_key:
        public_key = settings.host_identity_public_key
    if not jwks_url:
        jwks_url = settings.host_identity_jwks_url
    if not issuer:
        issuer = settings.host_identity_issuer
    if not audience:
        audience = settings.host_identity_audience

    # Try to verify with configured public key first
    if public_key:
        try:
            import jwt
            payload = jwt.decode(
                token,
                public_key,
                algorithms=["RS256", "ES256"],
                audience=audience,
                issuer=issuer,
            )
            # Verify the token's origin matches the request origin
            token_origin = payload.get("origin")
            if token_origin and token_origin != origin:
                return None
            return payload
        except Exception:
            pass

    # Try JWKS endpoint if configured
    if jwks_url:
        try:
            import jwt
            from jwt import PyJWKClient
            jwks_client = PyJWKClient(jwks_url)
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256", "ES256"],
                audience=audience,
                issuer=issuer,
            )
            token_origin = payload.get("origin")
            if token_origin and token_origin != origin:
                return None
            return payload
        except Exception:
            pass

    return None


def create_widget_session(db: Session, *, is_guest: bool, user: User, origin: str | None, guest_name: str | None = None, guest_email: str | None = None, expires_in_hours: int = 24 * 7) -> tuple[str, WidgetSession]:
    raw = secrets.token_urlsafe(48)
    token_hash = hash_session_token(raw)
    now = _utcnow()
    sess = WidgetSession(
        session_token_hash=token_hash,
        user_id=user.id,
        is_guest=is_guest,
        origin=origin,
        guest_name=guest_name,
        guest_email=guest_email,
        expires_at=now + timedelta(hours=expires_in_hours),
        last_seen_at=now,
    )
    db.add(sess)
    db.commit()
    db.refresh(sess)
    return raw, sess


def get_session_by_token(db: Session, token: str) -> WidgetSession | None:
    token_hash = hash_session_token(token)
    sess = db.query(WidgetSession).filter(WidgetSession.session_token_hash == token_hash).first()
    if not sess:
        return None
    now = _utcnow()
    if sess.revoked_at is not None:
        return None
    if sess.expires_at <= now:
        return None
    return sess


def require_widget_session(db: Session, request: Request, token: str | None) -> tuple[WidgetSession, User]:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing widget session token")
    sess = get_session_by_token(db, token)
    if not sess:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired widget session")
    user = db.query(User).filter(User.id == sess.user_id, User.is_active == True).first()  # noqa: E712
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid widget session user")
    sess.last_seen_at = _utcnow()
    db.add(sess)
    db.commit()
    db.refresh(sess)
    return sess, user


def get_or_create_guest_user(db: Session, guest_name: str | None, guest_email: str | None) -> User:
    # create an isolated guest user record (no privileged access outside widget session)
    email = (guest_email or "").strip().lower()
    if email:
        existing = db.query(User).filter(User.email == email, User.role == "customer").first()
        if existing:
            return existing
    stamp = secrets.token_hex(8)
    gen_email = f"guest_{stamp}@widget.openchat.local"
    user = User(
        email=gen_email,
        full_name=(guest_name or "Guest Visitor").strip() or "Guest Visitor",
        role="customer",
        is_active=True,
        password_hash=hash_password(secrets.token_urlsafe(24)),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def rate_limit_for_request(request: Request, scope: str, limit: int, window_seconds: int) -> None:
    ip = request.client.host if request.client else "unknown"
    origin = normalize_origin(request.headers.get("origin")) or "no-origin"
    rate_limit(f"{scope}:{ip}:{origin}", limit, window_seconds)


def build_embed_snippet(widget_base_url: str) -> str:
    base = widget_base_url.rstrip('/')
    return f'<script src="{base}/api/v1/widget/embed.js" async></script>'
