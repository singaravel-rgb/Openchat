from datetime import datetime
from typing import List

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.agent_profile import AgentProfile
from app.models.notification import Notification
from app.models.team import user_team_membership


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    password_hash: Mapped[str] = mapped_column(
        String(255), nullable=False
    )

    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    last_role_changed_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    role_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_by = relationship(
        "User",
        remote_side=[id],
        foreign_keys=[created_by_id],
        uselist=False,
    )
    last_role_changed_by = relationship(
        "User",
        remote_side=[id],
        foreign_keys=[last_role_changed_by_id],
        uselist=False,
    )

    agent_profile = relationship(
        AgentProfile,
        foreign_keys=AgentProfile.user_id,
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    notifications: Mapped[List[Notification]] = relationship(
        Notification,
        foreign_keys=Notification.user_id,
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    teams: Mapped[list["Team"]] = relationship(
        secondary=user_team_membership, back_populates="members"
    )
