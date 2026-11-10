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
