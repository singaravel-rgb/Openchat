import time

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.redis import redis_client
from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import UserCreate, UserResponse, Token, AgentProfileSummary


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

    access_token = create_access_token(str(user.id))

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
