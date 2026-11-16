from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, String, Boolean, Text, func, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ConversationStatus
from app.db.base import Base
from app.models.message import Message


class SLAConfig(Base):
    __tablename__ = "sla_configs"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    response_time_minutes: Mapped[int] = mapped_column(nullable=False)
    resolution_time_minutes: Mapped[int] = mapped_column(nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Conversation(Base):
    __tablename__ = "conversations"

    __table_args__ = (
        Index("ix_conversations_status_created_at", "status", "created_at"),
        Index("ix_conversations_sla_response_due", "sla_response_due_at"),
        Index("ix_conversations_sla_resolution_due", "sla_resolution_due_at"),
        Index("ix_conversations_priority", "priority"),
        Index("ix_conversations_assigned_status", "assigned_agent_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    customer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    assigned_agent_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    sla_config_id: Mapped[int | None] = mapped_column(
        ForeignKey("sla_configs.id", ondelete="SET NULL"),
        nullable=True,
    )

    subject: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        default=ConversationStatus.AI_HANDLING,
        server_default=ConversationStatus.AI_HANDLING,
        nullable=False,
    )

    channel: Mapped[str] = mapped_column(
        String(30),
        default="website",
        server_default="website",
        nullable=False,
    )

    priority: Mapped[str] = mapped_column(
        String(20),
        default="normal",
        server_default="normal",
        nullable=False,
    )

    tags: Mapped[list] = mapped_column(
        JSON,
        default=list,
        server_default="[]",
        nullable=False,
    )

    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    assignment_history: Mapped[list] = mapped_column(JSON, default=list, server_default="[]", nullable=False)
    resolution_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    customer_last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    agent_last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # SLA tracking fields
    sla_response_due_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    sla_resolution_due_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    sla_response_breached: Mapped[bool] = mapped_column(Boolean, default=False)
    sla_resolution_breached: Mapped[bool] = mapped_column(Boolean, default=False)
    first_response_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    customer = relationship(
        "User",
        foreign_keys=[customer_id],
    )

    assigned_agent = relationship(
        "User",
        foreign_keys=[assigned_agent_id],
    )

    sla_config = relationship("SLAConfig")

    messages = relationship(
        Message,
        back_populates="conversation",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by=Message.created_at,
    )
