from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class AgentProfile(Base):
    __tablename__ = "agent_profiles"

    __table_args__ = (
        CheckConstraint(
            "availability_status IN ('available', 'busy', 'online', 'offline')",
            name="ck_agent_profiles_availability_status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    availability_status: Mapped[str] = mapped_column(
        String(20),
        default="offline",
        server_default="offline",
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    user = relationship("User", back_populates="agent_profile")
