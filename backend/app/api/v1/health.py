from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.redis import redis_client
from app.db.session import get_db


router = APIRouter()


@router.get("/health")
def health():
    return {"status": "ok", "service": "OpenChat API"}


@router.get("/health/db")
def database_health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "service": "PostgreSQL"}
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed",
        )


@router.get("/health/redis")
def redis_health():
    try:
        redis_client.ping()
        return {"status": "ok", "service": "Redis"}
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Redis connection failed",
        )
