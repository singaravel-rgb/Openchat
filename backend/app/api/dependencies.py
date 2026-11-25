import hashlib
import jwt

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.redis import redis_client
from app.core.roles import UserRole
from app.db.session import get_db
from app.models.user import User


oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login"
)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:

    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
        )

        user_id = int(payload.get("sub"))
        token_iat = float(payload.get("iat", 0))

    except (jwt.InvalidTokenError, TypeError, ValueError):
        raise credentials_error

    # Immediate session revocation check (e.g. logout, role change, password change, or deactivation)
    try:
        if redis_client:
            token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
            if redis_client.get(f"revoked_token:{token_hash}"):
                raise credentials_error
            revocation_ts = redis_client.get(f"revoked_user:{user_id}")
            if revocation_ts:
                if isinstance(revocation_ts, bytes):
                    revocation_ts = revocation_ts.decode("utf-8")
                if token_iat > 0 and token_iat < float(revocation_ts):
                    raise credentials_error
    except HTTPException:
        raise
    except Exception:
        pass  # Redis offline shouldn't break DB fallback

    user = db.query(User).filter(User.id == user_id).first()

    if not user or not user.is_active:
        raise credentials_error

    if user.password_changed_at and token_iat > 0:
        pwd_ts = user.password_changed_at.timestamp()
        if token_iat < pwd_ts - 1.0:
            raise credentials_error

    return user


def require_roles(*allowed_roles: str | UserRole):

    def role_checker(
        current_user: User = Depends(get_current_user),
    ) -> User:

        allowed_values = {role.value if isinstance(role, UserRole) else role for role in allowed_roles}

        # Super admin always has full access across all administrative and agent resources
        if current_user.role == UserRole.SUPER_ADMIN or current_user.role == "super_admin":
            return current_user

        if current_user.role not in allowed_values:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource",
            )

        return current_user

    return role_checker


def require_super_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role != UserRole.SUPER_ADMIN and current_user.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin privileges required to access this resource",
        )
    return current_user

