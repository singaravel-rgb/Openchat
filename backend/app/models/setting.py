from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
from sqlalchemy.orm import DeclarativeBase
from datetime import datetime

from app.db.base import Base


class Setting(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, index=True, nullable=False)
    value = Column(JSON, nullable=True)
    category = Column(String(50), index=True, nullable=False)  # general, notifications, assignment
    description = Column(Text, nullable=True)
    is_public = Column(Integer, default=0)  # 0 = admin only, 1 = public
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)