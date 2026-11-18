import json
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_roles
from app.core.redis import redis_client
from app.core.roles import UserRole
from app.db.session import get_db
from app.models.agent_profile import AgentProfile
from app.models.audit_log import AuditLog
from app.models.invitation import UserInvitation
from app.models.user import User
from app.schemas.user_management import (
    UserDetailResponse,
    UserInviteRequest,
    UserInvitationResponse,
    UserUpdateRequest,
    UserSummary,
)

router = APIRouter(prefix="/admin/users", tags=["User Management"])


def require_admin_or_super(current_user: User = Depends(require_roles("admin", "super_admin"))) -> User:
    return current_user


@router.get("", response_model=List[UserDetailResponse])
def list_users(
    role: Optional[str] = Query(None, description="Filter by role: super_admin, admin, agent"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    q: Optional[str] = Query(None, description="Search by name or email"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super),
):
    """
    List staff users with role and status filtering, including attribution of who created the user
    and who last changed their role.
    """
    query = db.query(User).filter(User.role.in_(["super_admin", "admin", "agent"]))

    if role:
        query = query.filter(User.role == role)

    if is_active is not None:
        query = query.filter(User.is_active == is_active)

    if q:
        search_pattern = f"%{q.strip()}%"
        query = query.filter(
            or_(
                User.full_name.ilike(search_pattern),
                User.email.ilike(search_pattern),
            )
        )

    users = query.order_by(User.id.asc()).all()
    return users


@router.post("/invite", response_model=UserInvitationResponse, status_code=status.HTTP_201_CREATED)
def invite_user(
    payload: UserInviteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super),
):
    """
    Invite a user by email with a specific role.
    - Super Admin can invite Super Admin, Admin, or Agent.
    - Admin can ONLY invite Admin or Agent.
    """
    # Authorization checks
    if payload.role == UserRole.SUPER_ADMIN or payload.role == "super_admin":
        if current_user.role != UserRole.SUPER_ADMIN and current_user.role != "super_admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only a Super Admin can invite another Super Admin.",
            )

    email_clean = payload.email.strip().lower()

    # Check if user already exists
    existing_user = db.query(User).filter(User.email.ilike(email_clean)).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User with email '{email_clean}' is already registered.",
        )

    # Revoke any prior pending invitations for this email
    prior_invites = (
        db.query(UserInvitation)
        .filter(UserInvitation.email.ilike(email_clean), UserInvitation.status == "pending")
        .all()
    )
    for inv in prior_invites:
        inv.status = "revoked"

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    invitation = UserInvitation(
        email=email_clean,
        role=payload.role,
        token=token,
        invited_by_id=current_user.id,
        status="pending",
        is_verified=False,
        expires_at=expires_at,
    )
    db.add(invitation)
    db.flush()

    # Record audit log
    audit = AuditLog(
        user_id=current_user.id,
        action="user.invited",
        resource_type="invitation",
        resource_id=invitation.id,
        details=json.dumps({
            "email": email_clean,
            "role": payload.role,
            "invited_by": current_user.email,
        }),
    )
    db.add(audit)
    db.commit()
    db.refresh(invitation)

    return invitation


@router.get("/invitations", response_model=List[UserInvitationResponse])
def list_invitations(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super),
):
    """List pending and historical invitations."""
    invitations = db.query(UserInvitation).order_by(UserInvitation.created_at.desc()).all()
    return invitations


@router.post("/invitations/{invitation_id}/resend", response_model=UserInvitationResponse)
def resend_invitation(
    invitation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super),
):
    """
    Resend an invitation, generating a fresh token and renewing expiry by 7 days.
    """
    inv = db.query(UserInvitation).filter(UserInvitation.id == invitation_id).first()
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found.")

    if inv.role == "super_admin" and current_user.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a Super Admin can manage Super Admin invitations.",
        )

    inv.token = secrets.token_urlsafe(32)
    inv.status = "pending"
    inv.expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    audit = AuditLog(
        user_id=current_user.id,
        action="user.invitation_resent",
        resource_type="invitation",
        resource_id=inv.id,
        details=json.dumps({"email": inv.email, "role": inv.role}),
    )
    db.add(audit)
    db.commit()
    db.refresh(inv)

    return inv


@router.delete("/invitations/{invitation_id}")
def revoke_invitation(
    invitation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super),
):
    """Revoke a pending invitation."""
    inv = db.query(UserInvitation).filter(UserInvitation.id == invitation_id).first()
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found.")

    if inv.role == "super_admin" and current_user.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a Super Admin can manage Super Admin invitations.",
        )

    inv.status = "revoked"
    audit = AuditLog(
        user_id=current_user.id,
        action="user.invitation_revoked",
        resource_type="invitation",
        resource_id=inv.id,
        details=json.dumps({"email": inv.email, "role": inv.role}),
    )
    db.add(audit)
    db.commit()

    return {"detail": "Invitation revoked successfully."}


@router.patch("/{user_id}", response_model=UserDetailResponse)
def update_user(
    user_id: int,
    payload: UserUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_super),
):
    """
    Edit user details, change permitted roles, and activate/deactivate accounts.
    - Super Admin can modify all roles (Super Admin, Admin, Agent).
    - Admin can only modify Admin and Agent roles, and cannot modify or deactivate Super Admins.
    - Last Super Admin protection prevents deactivating or demoting the last active Super Admin.
    - Role changes or deactivations immediately revoke active sessions in Redis.
    """
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    is_super = current_user.role in (UserRole.SUPER_ADMIN, "super_admin")

    # Permission check: Ordinary Admin cannot modify a Super Admin
    if target_user.role == "super_admin" and not is_super:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a Super Admin can modify a Super Admin account.",
        )

    # Permission check: Ordinary Admin cannot promote to Super Admin
    if payload.role == "super_admin" and not is_super:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a Super Admin can grant the Super Admin role.",
        )

    # Last Super Admin Protection
    if target_user.role == "super_admin":
        demoting = payload.role is not None and payload.role != "super_admin"
        deactivating = payload.is_active is False
        if demoting or deactivating:
            active_super_admins = (
                db.query(User)
                .filter(
                    User.role == "super_admin",
                    User.is_active == True,
                    User.id != target_user.id,
                )
                .count()
            )
            if active_super_admins == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot demote or deactivate the last active Super Admin. Another active Super Admin must exist first.",
                )

    changes = {}

    if payload.full_name is not None and payload.full_name.strip() != target_user.full_name:
        changes["full_name"] = {"old": target_user.full_name, "new": payload.full_name.strip()}
        target_user.full_name = payload.full_name.strip()

    role_changed = False
    if payload.role is not None and payload.role != target_user.role:
        changes["role"] = {"old": target_user.role, "new": payload.role}
        target_user.role = payload.role
        target_user.role_changed_at = func.now()
        target_user.last_role_changed_by_id = current_user.id
        role_changed = True

        # Ensure AgentProfile exists if assigned agent role
        if payload.role == "agent" and not target_user.agent_profile:
            profile = AgentProfile(
                user_id=target_user.id,
                is_available=True,
                max_conversations=5,
                active_conversations=0,
            )
            db.add(profile)

    status_changed = False
    if payload.is_active is not None and payload.is_active != target_user.is_active:
        changes["is_active"] = {"old": target_user.is_active, "new": payload.is_active}
        target_user.is_active = payload.is_active
        status_changed = True

    # Immediate session revocation on role change or deactivation
    if role_changed or status_changed:
        try:
            if redis_client:
                redis_client.set(f"revoked_user:{target_user.id}", str(time.time()), ex=86400)
        except Exception:
            pass

    # Audit log
    audit_action = "user.updated"
    if role_changed:
        audit_action = "user.role_changed"
    elif status_changed:
        audit_action = "user.deactivated" if not target_user.is_active else "user.activated"

    audit = AuditLog(
        user_id=current_user.id,
        action=audit_action,
        resource_type="user",
        resource_id=target_user.id,
        details=json.dumps(changes),
    )
    db.add(audit)
    db.commit()
    db.refresh(target_user)

    return target_user

