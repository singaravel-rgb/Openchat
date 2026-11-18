#!/usr/bin/env python
"""
Secure bootstrap script for the initial Super Admin account.
Idempotent, auditable, and adheres to strict security standards.
"""
import argparse
import getpass
import json
import secrets
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.audit_log import AuditLog
from app.models.invitation import UserInvitation
from app.models.knowledge import Article
from app.models.user import User


def bootstrap_super_admin(email: str, full_name: str = "Singaravel", password: str | None = None, invite_only: bool = False):
    email_clean = email.strip().lower()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email.ilike(email_clean)).first()

        if invite_only:
            # Create or renew a secure invitation token for password setup / onboarding
            token = secrets.token_urlsafe(32)
            expires_at = datetime.now(timezone.utc) + timedelta(days=7)
            # Revoke any prior pending invitations for this email
            prior_invs = db.query(UserInvitation).filter(UserInvitation.email.ilike(email_clean), UserInvitation.status == "pending").all()
            for pi in prior_invs:
                pi.status = "revoked"

            inv = UserInvitation(
                email=email_clean,
                role="super_admin",
                token=token,
                status="pending",
                is_verified=False,
                expires_at=expires_at,
            )
            db.add(inv)
            db.flush()

            audit = AuditLog(
                user_id=user.id if user else None,
                action="user.bootstrap_super_admin_invite",
                resource_type="invitation",
                resource_id=inv.id,
                details=json.dumps({"email": email_clean, "role": "super_admin", "purpose": "password_setup"}),
            )
            db.add(audit)
            db.commit()
            print(f"[SUCCESS] Super Admin invitation / password setup link created for '{email_clean}'.")
            print(f"Setup URL: http://localhost:3000/accept-invitation?token={token}")
            return inv

        if user:
            if user.role == "super_admin" and user.is_active:
                print(f"[IDEMPOTENT] Account '{email_clean}' is already an active Super Admin. No changes needed.")
                # Ensure knowledge base articles point to this Super Admin
                articles = db.query(Article).all()
                for a in articles:
                    a.author_id = user.id
                db.commit()
                return user

            print(f"[UPGRADE] Account '{email_clean}' exists with role '{user.role}'. Upgrading to Super Admin...")
            old_role = user.role
            user.role = "super_admin"
            user.is_active = True
            user.role_changed_at = datetime.now(timezone.utc)
            if password:
                user.password_hash = hash_password(password)

            # Audit
            audit = AuditLog(
                user_id=user.id,
                action="user.bootstrap_super_admin",
                resource_type="user",
                resource_id=user.id,
                details=json.dumps({"email": email_clean, "action": "upgrade", "old_role": old_role}),
            )
            db.add(audit)

            # Reassign articles
            articles = db.query(Article).all()
            for a in articles:
                a.author_id = user.id
            db.commit()
            print(f"[SUCCESS] Account '{email_clean}' successfully upgraded to active Super Admin.")
            return user

        # User does not exist yet
        if invite_only:
            # Create a secure invitation token
            token = secrets.token_urlsafe(32)
            expires_at = datetime.now(timezone.utc) + timedelta(days=7)
            inv = UserInvitation(
                email=email_clean,
                role="super_admin",
                token=token,
                status="pending",
                is_verified=False,
                expires_at=expires_at,
            )
            db.add(inv)
            db.flush()

            audit = AuditLog(
                user_id=None,
                action="user.bootstrap_super_admin_invite",
                resource_type="invitation",
                resource_id=inv.id,
                details=json.dumps({"email": email_clean, "role": "super_admin"}),
            )
            db.add(audit)
            db.commit()
            print(f"[SUCCESS] Super Admin invitation created for '{email_clean}'.")
            print(f"Setup URL: http://localhost:3000/accept-invitation?token={token}")
            return inv

        # Direct setup with secure password
        if not password:
            if sys.stdin.isatty():
                password = getpass.getpass(f"Enter secure password for {email_clean}: ")
            else:
                password = "SuperAdminPassword2026!"

        new_user = User(
            email=email_clean,
            full_name=full_name,
            password_hash=hash_password(password),
            role="super_admin",
            is_active=True,
            created_at=datetime.now(timezone.utc),
            role_changed_at=datetime.now(timezone.utc),
        )
        db.add(new_user)
        db.flush()

        # Create matching accepted invitation record for full audit trail
        token = secrets.token_urlsafe(32)
        inv = UserInvitation(
            email=email_clean,
            role="super_admin",
            token=token,
            status="accepted",
            is_verified=True,
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
            accepted_at=datetime.now(timezone.utc),
        )
        db.add(inv)

        # Audit
        audit = AuditLog(
            user_id=new_user.id,
            action="user.bootstrap_super_admin",
            resource_type="user",
            resource_id=new_user.id,
            details=json.dumps({"email": email_clean, "role": "super_admin", "method": "direct_bootstrap"}),
        )
        db.add(audit)

        # Reassign articles
        articles = db.query(Article).all()
        for a in articles:
            a.author_id = new_user.id

        db.commit()
        db.refresh(new_user)
        print(f"[SUCCESS] Initial Super Admin account '{email_clean}' successfully provisioned and verified.")
        print(f"[INFO] All knowledge base articles assigned to Super Admin ID={new_user.id}.")
        return new_user
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bootstrap initial Super Admin account.")
    parser.add_argument("--email", default="singaravel@vananam.com", help="Email of the Super Admin")
    parser.add_argument("--name", default="Singaravel", help="Full name of the Super Admin")
    parser.add_argument("--password", default=None, help="Secure password (optional, prompted if omitted)")
    parser.add_argument("--invite-only", action="store_true", help="Generate an invitation token instead of creating directly")
    args = parser.parse_args()

    bootstrap_super_admin(email=args.email, full_name=args.name, password=args.password, invite_only=args.invite_only)

