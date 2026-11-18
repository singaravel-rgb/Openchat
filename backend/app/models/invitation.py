from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import User


class UserInvitation(Base):
    __tablename__ = "user_invitations"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    token: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    invited_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False)  # pending, accepted, expired, revoked
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    invited_by = relationship("User", foreign_keys=[invited_by_id])
