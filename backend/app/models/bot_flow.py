from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BotFlow(Base):
    __tablename__ = "bot_flows"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    initial_greeting: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft")  # draft, published, archived
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_default: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class BotFlowStep(Base):
    __tablename__ = "bot_flow_steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    flow_id: Mapped[int] = mapped_column(
        ForeignKey("bot_flows.id", ondelete="CASCADE"), nullable=False, index=True
    )
    step_key: Mapped[str] = mapped_column(String(100), nullable=False)  # Unique key within flow
    step_type: Mapped[str] = mapped_column(String(50), nullable=False, default="message")  # message, question, handoff, end
    message_text: Mapped[str | None] = mapped_column(Text, nullable=True)  # Message to show customer
    options: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array of option objects for question steps
    next_step_key: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Key of next step
    is_terminal: Mapped[bool] = mapped_column(default=False, nullable=False)  # End of flow
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BotFlowIssue(Base):
    __tablename__ = "bot_flow_issues"

    id: Mapped[int] = mapped_column(primary_key=True)
    flow_id: Mapped[int] = mapped_column(
        ForeignKey("bot_flows.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)  # Issue menu item title
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_step_key: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Which step to start with
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())