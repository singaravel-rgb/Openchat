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
    postgres_db: str
    postgres_user: str
    postgres_password: str
    postgres_host: str = "127.0.0.1"
    postgres_port: int = 5434

    # Redis
    redis_host: str = "127.0.0.1"
    redis_port: int = 6379
    redis_password: str

    # Authentication
    secret_key: str
    access_token_expire_minutes: int = 30
    algorithm: str = "HS256"

    # AI Provider
    ai_provider: str = "demo"  # demo, openai, anthropic
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    ai_model: str = "gpt-4o-mini"
    ai_temperature: float = 0.3

    # Agent settings
    default_max_conversations_per_agent: int = 5

    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

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
    def database_url(self) -> URL:
        return URL.create(
            "postgresql+psycopg",
            username=self.postgres_user,
            password=self.postgres_password,
            host=self.postgres_host,
            port=self.postgres_port,
            database=self.postgres_db,
        )


settings = Settings()
