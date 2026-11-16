from datetime import datetime
from enum import Enum as PyEnum
from typing import Optional

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Index, Integer, String, Text, Boolean
from sqlalchemy.orm import relationship

from app.db.base import Base


class NotificationType(str, PyEnum):
    NEW_MESSAGE = "new_message"
    CONVERSATION_ASSIGNED = "conversation_assigned"
    CONVERSATION_REOPENED = "conversation_reopened"
    MENTION = "mention"
    SLA_WARNING = "sla_warning"
    SLA_BREACH = "sla_breach"
    AGENT_INVITED = "agent_invited"
    ARTICLE_PUBLISHED = "article_published"
    FAQ_PUBLISHED = "faq_published"
    SYSTEM = "system"


class NotificationPriority(str, PyEnum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(Enum(NotificationType), nullable=False)
    priority = Column(Enum(NotificationPriority), default=NotificationPriority.NORMAL, nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=True)
    reference_type = Column(String(50), nullable=True)
    reference_id = Column(Integer, nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="notifications")

    __table_args__ = (
        Index("ix_notifications_user_read", "user_id", "is_read"),
        Index("ix_notifications_user_created", "user_id", "created_at"),
    )