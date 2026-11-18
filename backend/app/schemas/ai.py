from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, ConfigDict


class AIConfigUpdate(BaseModel):
    ai_enabled: Optional[bool] = None
    provider: Optional[str] = Field(default=None, max_length=30)
    model: Optional[str] = Field(default=None, max_length=100)
    gemini_api_key: Optional[str] = Field(default=None, max_length=500)
    openai_api_key: Optional[str] = Field(default=None, max_length=500)
    anthropic_api_key: Optional[str] = Field(default=None, max_length=500)
    clear_gemini_api_key: bool = False
    clear_openai_api_key: bool = False
    clear_anthropic_api_key: bool = False
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(default=None, ge=50, le=4000)
    system_instructions: Optional[str] = Field(default=None, max_length=8000)
    greeting: Optional[str] = Field(default=None, max_length=1000)
    tone: Optional[str] = Field(default=None, max_length=50)
    supported_languages: Optional[list[str]] = None
    confidence_threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    escalation_rules: Optional[dict[str, Any]] = None
    max_response_length: Optional[int] = Field(default=None, ge=200, le=4000)
    knowledge_sources: Optional[dict[str, Any]] = None


class AIConfigResponse(BaseModel):
    id: int
    ai_enabled: bool
    provider: str
    model: str
    temperature: float
    max_tokens: int
    system_instructions: Optional[str] = None
    greeting: Optional[str] = None
    tone: str
    supported_languages: list[str]
    confidence_threshold: float
    escalation_rules: dict[str, Any]
    max_response_length: int
    knowledge_sources: dict[str, Any]
    has_gemini_api_key: bool = False
    has_openai_api_key: bool
    has_anthropic_api_key: bool
    gemini_api_key_masked: Optional[str] = None
    openai_api_key_masked: Optional[str] = None
    anthropic_api_key_masked: Optional[str] = None
    provider_available: bool
    availability_message: Optional[str] = None
    last_test_status: Optional[str] = None
    last_test_message: Optional[str] = None
    last_tested_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class AITestRequest(BaseModel):
    provider: Optional[str] = None
    model: Optional[str] = None
    gemini_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None


class AITestResponse(BaseModel):
    ok: bool
    provider: str
    model: Optional[str] = None
    message: str
    latency_ms: Optional[int] = None


class AIUsageSummary(BaseModel):
    total_requests: int
    successful_requests: int
    failed_requests: int
    total_prompt_tokens: int
    total_completion_tokens: int
    total_tokens: int
    estimated_cost_usd: float
    by_provider: dict[str, Any]
