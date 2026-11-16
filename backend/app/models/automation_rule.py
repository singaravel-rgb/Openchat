from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AutomationRule(Base):
    __tablename__ = "automation_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    trigger_event: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g., conversation.created, message.created, conversation.assigned
    conditions: Mapped[str] = mapped_column(Text, nullable=False)  # JSON array of condition objects
    actions: Mapped[str] = mapped_column(Text, nullable=False)  # JSON array of action objects
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class AutomationRuleExecution(Base):
    __tablename__ = "automation_rule_executions"

    id: Mapped[int] = mapped_column(primary_key=True)
    rule_id: Mapped[int] = mapped_column(
        ForeignKey("automation_rules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    trigger_event: Mapped[str] = mapped_column(String(100), nullable=False)
    trigger_payload: Mapped[str] = mapped_column(Text, nullable=False)  # JSON payload
    actions_taken: Mapped[str] = mapped_column(Text, nullable=False)  # JSON array of actions taken
    success: Mapped[bool] = mapped_column(default=False, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())