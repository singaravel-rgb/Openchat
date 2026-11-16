from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import User


class WidgetConfig(Base):
    __tablename__ = "widget_configs"

    id: Mapped[int] = mapped_column(primary_key=True)
    widget_title: Mapped[str] = mapped_column(String(100), default="OpenChat Support", server_default="OpenChat Support", nullable=False)
    brand_name: Mapped[str] = mapped_column(String(100), default="OpenChat", server_default="OpenChat", nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    primary_color: Mapped[str] = mapped_column(String(20), default="#2563eb", server_default="#2563eb", nullable=False)
    launcher_position: Mapped[str] = mapped_column(String(20), default="bottom-right", server_default="bottom-right", nullable=False)
    welcome_message: Mapped[str] = mapped_column(String(500), default="Hi! How can we help you today?", server_default="Hi! How can we help you today?", nullable=False)
    greeting_text: Mapped[str] = mapped_column(String(500), default="Start a conversation with our team.", server_default="Start a conversation with our team.", nullable=False)
    widget_visibility: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    allowed_domains: Mapped[list] = mapped_column(JSON, default=list, server_default="[]", nullable=False)
    widget_availability: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    hide_launcher_on_help_page: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    show_agent_avatar: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    require_email: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    # Host identity verification (authenticated host mode)
    host_identity_jwks_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    host_identity_issuer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    host_identity_audience: Mapped[str] = mapped_column(String(255), default="openchat-widget", server_default="openchat-widget", nullable=False)
    host_identity_public_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class WidgetSession(Base):
    __tablename__ = "widget_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_token_hash: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    is_guest: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    origin: Mapped[str | None] = mapped_column(String(255), nullable=True)
    guest_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    guest_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship(User)
