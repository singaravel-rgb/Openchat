import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL

ROOT_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # PostgreSQL
    postgres_db: str = "openchat"
    postgres_user: str = "openchat"
    postgres_password: str = "openchat"
    postgres_host: str = "127.0.0.1"
    postgres_port: int = 5434

    # Redis
    redis_host: str = "127.0.0.1"
    redis_port: int = 6379
    redis_password: str = ""

    # Authentication
    secret_key: str = "production_ready_secret_key_change_in_env_file_32_chars!"
    access_token_expire_minutes: int = 30
    algorithm: str = "HS256"

    # Environment
    environment: str = "development"
    allow_localhost_in_production: bool = False

    # AI Provider
    ai_provider: str = "gemini"  # gemini, demo, openai, anthropic
    gemini_api_key: str | None = None
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    ai_model: str = "gemini-flash-lite-latest"
    ai_temperature: float = 0.3

    # Agent settings
    default_max_conversations_per_agent: int = 5

    # CORS
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ]

    # Celery / background tasks
    celery_broker_url: str = "redis://:redispass@127.0.0.1:6379/1"
    celery_result_backend: str = "redis://:redispass@127.0.0.1:6379/2"

    # SMTP / Email
    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_tls: bool = True
    smtp_from_email: str = "noreply@openchat.io"
    smtp_from_name: str = "OpenChat"

    # File Attachments
    upload_dir: str = "uploads"
    max_file_size: int = 10 * 1024 * 1024  # 10 MB
    allowed_mime_types: list[str] = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "application/pdf",
        "text/plain",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/zip",
    ]

    # Host Identity Verification (for widget authenticated mode)
    host_identity_jwks_url: str | None = None
    host_identity_issuer: str | None = None
    host_identity_audience: str = "openchat-widget"
    host_identity_public_key: str | None = None

    @property
    def database_url(self) -> URL | str:
        db_env = os.environ.get("DATABASE_URL")
        if db_env:
            if db_env.startswith("postgres://"):
                db_env = db_env.replace("postgres://", "postgresql+psycopg://", 1)
            elif db_env.startswith("postgresql://") and "+psycopg" not in db_env:
                db_env = db_env.replace("postgresql://", "postgresql+psycopg://", 1)
            return db_env
        return URL.create(
            "postgresql+psycopg",
            username=self.postgres_user,
            password=self.postgres_password,
            host=self.postgres_host,
            port=self.postgres_port,
            database=self.postgres_db,
        )


settings = Settings()
