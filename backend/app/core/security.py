from datetime import datetime, timedelta, timezone

import jwt
from pwdlib import PasswordHash

from app.core.config import settings

password_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return password_hasher.verify(password, hashed_password)


def create_access_token(subject: str, role: str | None = None) -> str:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(
        minutes=settings.access_token_expire_minutes
    )

    payload = {
        "sub": subject,
        "iat": now.timestamp(),
        "exp": expires_at,
    }
    if role:
        payload["role"] = role

    return jwt.encode(
        payload,
        settings.secret_key,
        algorithm=settings.algorithm,
    )
