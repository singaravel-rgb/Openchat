import hashlib
import json
import re
import secrets
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
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
from app.models.password_reset import PasswordResetToken
from app.models.user import User
from app.schemas.auth import (
    UserCreate,
    UserResponse,
    Token,
    AgentProfileSummary,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    ChangePasswordRequest,
    PasswordResetValidateResponse,
    GenericMessageResponse,
)
from app.schemas.user_management import InvitationAcceptRequest, InvitationInspectResponse


router = APIRouter(prefix="/auth", tags=["Authentication"])

# Brute-force protection settings
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_WINDOW_SECONDS = 900  # 15 minutes


def validate_password_strength(password: str) -> None:
    if len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long.",
        )
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one letter and one number.",
        )


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
    if is_demo_user or (is_demo_pass and settings.environment.lower() not in ("development", "testing")):
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
            is_approved=True,
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


# ==============================================================================
# Agent Account & Password Management Endpoints
# ==============================================================================

@router.post("/forgot-password", response_model=GenericMessageResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Request a secure password reset link.
    Never exposes whether an email address exists (anti-enumeration).
    Rate-limits requests per client IP and email.
    """
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"forgot_pwd_rate:{client_ip}:{payload.email.lower()}"
    try:
        attempts = redis_client.incr(rate_key)
        if attempts == 1:
            redis_client.expire(rate_key, 900)
        if attempts > 5:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many password reset requests. Please try again in 15 minutes.",
            )
    except HTTPException:
        raise
    except Exception:
        pass

    user = db.query(User).filter(User.email.ilike(payload.email), User.is_active == True).first()  # noqa: E712
    if user:
        # Invalidate existing pending tokens
        now = datetime.now(timezone.utc)
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        ).update({"used_at": now})

        # Generate cryptographically secure token
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        expires_at = now + timedelta(minutes=30)

        reset_record = PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        db.add(reset_record)

        audit = AuditLog(
            user_id=user.id,
            action="auth.forgot_password_requested",
            resource_type="user",
            resource_id=user.id,
            details=json.dumps({"ip": client_ip}),
        )
        db.add(audit)
        db.commit()

        # In production/staging, email_service delivers the reset link.
        # Fallback logging for auditability:
        from app.services.email_service import send_email
        reset_link = f"/reset-password?token={raw_token}"
        try:
            send_email(
                to_email=user.email,
                subject="Reset your OpenChat password",
                body=f"Hello {user.full_name},\n\nPlease use the following link to reset your password (valid for 30 minutes):\n{reset_link}\n\nIf you did not request this, please ignore this email.",
            )
        except Exception:
            pass

    return {
        "message": "If an account with that email exists, password reset instructions have been sent.",
    }


@router.get("/reset-password/validate", response_model=PasswordResetValidateResponse)
def validate_reset_token(
    token: str = Query(..., min_length=10),
    db: Session = Depends(get_db),
):
    """
    Validate that a password reset token exists, is unexpired, and has not been used.
    """
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    record = db.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == token_hash,
        PasswordResetToken.used_at.is_(None),
    ).first()

    now = datetime.now(timezone.utc)
    rec_exp = record.expires_at if record and record.expires_at.tzinfo else (record.expires_at.replace(tzinfo=timezone.utc) if record else None)
    if not record or (rec_exp and rec_exp < now):
        return {
            "valid": False,
            "message": "This password reset link is invalid or has expired. Please request a new one.",
        }

    user = db.query(User).filter(User.id == record.user_id).first()
    masked_email = None
    if user and "@" in user.email:
        parts = user.email.split("@")
        name, domain = parts[0], parts[1]
        masked_name = name[:2] + "***" if len(name) > 2 else name + "***"
        masked_email = f"{masked_name}@{domain}"

    return {
        "valid": True,
        "email": masked_email,
        "message": "Token is valid.",
    }


@router.post("/reset-password", response_model=GenericMessageResponse)
def reset_password(
    payload: ResetPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Reset account password using a validated single-use token.
    Enforces password strength, invalidates token and clears lockout.
    """
    client_ip = request.client.host if request.client else "unknown"
    if payload.password != payload.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match.",
        )
    validate_password_strength(payload.password)

    token_hash = hashlib.sha256(payload.token.encode("utf-8")).hexdigest()
    record = db.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == token_hash,
        PasswordResetToken.used_at.is_(None),
    ).first()

    now = datetime.now(timezone.utc)
    rec_exp = record.expires_at if record and record.expires_at.tzinfo else (record.expires_at.replace(tzinfo=timezone.utc) if record else None)
    if not record or (rec_exp and rec_exp < now):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This password reset link is invalid or has expired. Please request a new one.",
        )

    user = db.query(User).filter(User.id == record.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account is inactive or not found.",
        )

    # Invalidate token
    record.used_at = now
    user.password_hash = hash_password(payload.password)

    # Clear any lockout keys in Redis for this user
    try:
        lock_key = f"login_lock:*:{user.email.lower()}"
        attempt_key = f"login_attempts:*:{user.email.lower()}"
        for k in redis_client.keys(f"login_*:{user.email.lower()}"):
            redis_client.delete(k)
    except Exception:
        pass

    audit = AuditLog(
        user_id=user.id,
        action="auth.password_reset_completed",
        resource_type="user",
        resource_id=user.id,
        details=json.dumps({"ip": client_ip}),
    )
    db.add(audit)
    db.commit()

    return {
        "message": "Your password has been reset successfully. You can now log in with your new password.",
    }


@router.post("/change-password", response_model=GenericMessageResponse)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Change password for the currently authenticated agent or administrator.
    Verifies current password, prevents password reuse, and enforces password policy.
    """
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )

    if payload.new_password != payload.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password and confirmation do not match.",
        )

    if verify_password(payload.new_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password cannot be the same as your current password.",
        )

    validate_password_strength(payload.new_password)

    current_user.password_hash = hash_password(payload.new_password)

    audit = AuditLog(
        user_id=current_user.id,
        action="auth.password_changed",
        resource_type="user",
        resource_id=current_user.id,
        details=json.dumps({"actor_id": current_user.id}),
    )
    db.add(audit)
    db.commit()

    return {
        "message": "Password changed successfully.",
    }
