from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AIConfig(Base):
    __tablename__ = "ai_configs"

    id: Mapped[int] = mapped_column(primary_key=True)
    ai_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    provider: Mapped[str] = mapped_column(String(30), default="demo", server_default="demo", nullable=False)
    model: Mapped[str] = mapped_column(String(100), default="gpt-4o-mini", server_default="gpt-4o-mini", nullable=False)
    openai_api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    anthropic_api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    temperature: Mapped[float] = mapped_column(Float, default=0.3, server_default="0.3", nullable=False)
    max_tokens: Mapped[int] = mapped_column(Integer, default=500, server_default="500", nullable=False)
    system_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    greeting: Mapped[str | None] = mapped_column(Text, nullable=True)
    tone: Mapped[str] = mapped_column(String(50), default="professional", server_default="professional", nullable=False)
    supported_languages: Mapped[list] = mapped_column(JSON, default=list, server_default='["en"]', nullable=False)
    confidence_threshold: Mapped[float] = mapped_column(Float, default=0.55, server_default="0.55", nullable=False)
    escalation_rules: Mapped[dict] = mapped_column(JSON, default=dict, server_default='{}', nullable=False)
    max_response_length: Mapped[int] = mapped_column(Integer, default=1200, server_default="1200", nullable=False)
    knowledge_sources: Mapped[dict] = mapped_column(JSON, default=dict, server_default='{"faqs": true, "articles": true}', nullable=False)
    last_test_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    last_test_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class AIUsageLog(Base):
    __tablename__ = "ai_usage_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int | None] = mapped_column(ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True, index=True)
    message_id: Mapped[int | None] = mapped_column(ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    provider: Mapped[str] = mapped_column(String(30), nullable=False)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    estimated_cost_usd: Mapped[float] = mapped_column(Float, default=0.0, server_default="0", nullable=False)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    decision: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
