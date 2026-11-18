import json
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.redis import redis_client
from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.agent_profile import AgentProfile
from app.models.audit_log import AuditLog
from app.models.invitation import UserInvitation
from app.models.user import User
from app.schemas.auth import UserCreate, UserResponse, Token, AgentProfileSummary
from app.schemas.user_management import InvitationAcceptRequest, InvitationInspectResponse


router = APIRouter(prefix="/auth", tags=["Authentication"])

# Brute-force protection settings
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_WINDOW_SECONDS = 900  # 15 minutes


@router.post("/register", response_model=UserResponse, status_code=201)
def register(
    user_data: UserCreate,
    db: Session = Depends(get_db),
):
    existing_user = db.query(User).filter(
        User.email == user_data.email
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="Email is already registered",
        )

    user = User(
        email=user_data.email,
        full_name=user_data.full_name,
        password_hash=hash_password(user_data.password),
        role="customer",
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


@router.post("/login", response_model=Token)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else "unknown"
    lock_key = f"login_lock:{client_ip}:{form_data.username.lower()}"
    attempt_key = f"login_attempts:{client_ip}:{form_data.username.lower()}"

    # Check if locked out
    try:
        locked = redis_client.get(lock_key)
        if locked:
            ttl = redis_client.ttl(lock_key)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Account locked due to multiple failed login attempts. Try again in {ttl} seconds.",
                headers={"Retry-After": str(ttl)},
            )
    except Exception:
        pass  # Redis unavailable: fail open

    from app.core.config import settings

    # Strictly block all demo accounts and demo passwords across release/support environments
    is_demo_user = form_data.username.lower().endswith("@demo.com") or form_data.username.lower() in (
        "customer@demo.com",
        "agent@demo.com",
        "admin@demo.com",
    )
    is_demo_pass = form_data.password in ("demo1234", "password123")
    if is_demo_user or (is_demo_pass and settings.environment.lower() != "development"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo accounts and default credentials are permanently disabled.",
        )

    user = db.query(User).filter(
        User.email == form_data.username
    ).first()

    if not user or not verify_password(
        form_data.password,
        user.password_hash,
    ):
        # Increment failed attempts
        try:
            pipe = redis_client.pipeline()
            pipe.incr(attempt_key)
            pipe.expire(attempt_key, LOCKOUT_WINDOW_SECONDS)
            results = pipe.execute()
            attempts = results[0]
            if attempts >= MAX_FAILED_ATTEMPTS:
                redis_client.setex(lock_key, LOCKOUT_WINDOW_SECONDS, "1")
        except Exception:
            pass

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    # Reset failed attempts on successful login
    try:
        redis_client.delete(attempt_key, lock_key)
    except Exception:
        pass

    access_token = create_access_token(str(user.id), role=user.role)

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


@router.get("/me", response_model=UserResponse)
def get_me(
    current_user: User = Depends(get_current_user),
):
    payload = UserResponse.model_validate(current_user)
    if current_user.agent_profile is not None:
        payload.agent_profile = AgentProfileSummary.model_validate(current_user.agent_profile)
    else:
        payload.agent_profile = None
    return payload


@router.get("/invitations/{token}", response_model=InvitationInspectResponse)
def inspect_invitation(
    token: str,
    db: Session = Depends(get_db),
):
    """Inspect an invitation token to display recipient email and role on setup screen."""
    inv = db.query(UserInvitation).filter(UserInvitation.token == token).first()
    if not inv or inv.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation is invalid, revoked, or has already been accepted.",
        )

    now = datetime.now(timezone.utc)
    is_expired = inv.expires_at < now
    if is_expired:
        inv.status = "expired"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation link has expired. Please contact an administrator to resend it.",
        )

    return {
        "email": inv.email,
        "role": inv.role,
        "expires_at": inv.expires_at,
        "is_expired": False,
    }


@router.post("/invitations/accept", response_model=Token, status_code=status.HTTP_201_CREATED)
def accept_invitation(
    payload: InvitationAcceptRequest,
    db: Session = Depends(get_db),
):
    """
    Accept an invitation, verify ownership, create the account with secure password, and return an access token.
    """
    inv = db.query(UserInvitation).filter(UserInvitation.token == payload.token).first()
    if not inv or inv.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid, revoked, or already accepted invitation.",
        )

    now = datetime.now(timezone.utc)
    if inv.expires_at < now:
        inv.status = "expired"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation link has expired. Please ask an administrator to resend it.",
        )

    # Check if user already exists
    existing = db.query(User).filter(User.email.ilike(inv.email)).first()
    if existing:
        # Upgrade existing user role if invited
        existing.role = inv.role
        existing.full_name = payload.full_name
        existing.password_hash = hash_password(payload.password)
        existing.is_active = True
        existing.role_changed_at = func.now()
        existing.last_role_changed_by_id = inv.invited_by_id
        user = existing
    else:
        user = User(
            email=inv.email,
            full_name=payload.full_name,
            password_hash=hash_password(payload.password),
            role=inv.role,
            is_active=True,
            created_by_id=inv.invited_by_id,
        )
        db.add(user)
        db.flush()

    if inv.role == "agent" and not user.agent_profile:
        profile = AgentProfile(
            user_id=user.id,
            is_available=True,
            max_conversations=5,
            active_conversations=0,
        )
        db.add(profile)

    inv.status = "accepted"
    inv.is_verified = True
    inv.accepted_at = func.now()

    audit = AuditLog(
        user_id=user.id,
        action="user.invitation_accepted",
        resource_type="user",
        resource_id=user.id,
        details=json.dumps({"email": user.email, "role": user.role}),
    )
    db.add(audit)
    db.commit()
    db.refresh(user)

    access_token = create_access_token(str(user.id), role=user.role)
    return {
        "access_token": access_token,
        "token_type": "bearer",
    }

