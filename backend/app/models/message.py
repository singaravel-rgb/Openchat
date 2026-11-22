from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func, Index, Index, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import MessageSenderType, MessageType
from app.db.base import Base
from app.models.user import User


class Message(Base):
    __tablename__ = "messages"

    __table_args__ = (
        Index("ix_messages_client_message_id", "client_message_id"),
        Index("ix_messages_conversation_created", "conversation_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    original_conversation_id: Mapped[int | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    sender_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    sender_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    message_type: Mapped[str] = mapped_column(
        String(20),
        default=MessageType.TEXT,
        server_default=MessageType.TEXT,
        nullable=False,
    )

    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    is_internal: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default="false",
        nullable=False,
    )

    delivery_status: Mapped[str] = mapped_column(
        String(20),
        default="delivered",
        server_default="delivered",
        nullable=False,
    )

    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    client_message_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    ai_metadata: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    edited_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    edit_history: Mapped[list | None] = mapped_column(JSON, default=list, server_default="[]", nullable=True)

    is_retracted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    retracted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retracted_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    conversation = relationship(
        "Conversation",
        back_populates="messages",
        foreign_keys=[conversation_id],
    )

    sender = relationship(
        "User",
        foreign_keys=[sender_id],
    )

    edited_by = relationship(
        "User",
        foreign_keys=[edited_by_id],
    )

    retracted_by = relationship(
        "User",
        foreign_keys=[retracted_by_id],
    )

    attachments = relationship(
        "Attachment",
        foreign_keys="Attachment.message_id",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

