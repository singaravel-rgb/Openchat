from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_roles
from app.core.crypto import decrypt_secret, encrypt_secret, mask_secret
from app.db.session import get_db
from app.models.ai import AIConfig, AIUsageLog
from app.models.user import User
from app.schemas.ai import (
    AIConfigResponse,
    AIConfigUpdate,
    AITestRequest,
    AITestResponse,
    AIUsageSummary,
)
from app.services.ai_service import get_or_create_ai_config, get_runtime_ai_config, to_runtime_config

router = APIRouter(prefix="/admin/ai", tags=["Admin AI"])


def require_admin(current_user: User = Depends(require_roles("admin"))) -> User:
    return current_user


@router.get("/config", response_model=AIConfigResponse)
def get_ai_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    cfg = get_or_create_ai_config(db)
    runtime = to_runtime_config(cfg)

    # Check provider availability
    provider_available = True
    availability_message = None
    if runtime.provider == "openai" and not runtime.openai_api_key:
        provider_available = False
        availability_message = "OpenAI API key not configured"
    elif runtime.provider == "anthropic" and not runtime.anthropic_api_key:
        provider_available = False
        availability_message = "Anthropic API key not configured"
    elif runtime.provider not in ("demo", "openai", "anthropic"):
        provider_available = False
        availability_message = f"Unknown provider: {runtime.provider}"

    return AIConfigResponse(
        id=cfg.id,
        ai_enabled=cfg.ai_enabled,
        provider=cfg.provider,
        model=cfg.model,
        temperature=cfg.temperature,
        max_tokens=cfg.max_tokens,
        system_instructions=cfg.system_instructions,
        greeting=cfg.greeting,
        tone=cfg.tone,
        supported_languages=cfg.supported_languages,
        confidence_threshold=cfg.confidence_threshold,
        escalation_rules=cfg.escalation_rules,
        max_response_length=cfg.max_response_length,
        knowledge_sources=cfg.knowledge_sources,
        has_openai_api_key=bool(cfg.openai_api_key_encrypted),
        has_anthropic_api_key=bool(cfg.anthropic_api_key_encrypted),
        openai_api_key_masked=mask_secret(decrypt_secret(cfg.openai_api_key_encrypted)),
        anthropic_api_key_masked=mask_secret(decrypt_secret(cfg.anthropic_api_key_encrypted)),
        provider_available=provider_available,
        availability_message=availability_message,
        last_test_status=cfg.last_test_status,
        last_test_message=cfg.last_test_message,
        last_tested_at=cfg.last_tested_at,
        updated_at=cfg.updated_at,
    )


@router.put("/config", response_model=AIConfigResponse)
def update_ai_config(
    data: AIConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    cfg = get_or_create_ai_config(db)
    update_data = data.model_dump(exclude_unset=True)

    # Handle API key clearing
    if update_data.pop("clear_openai_api_key", False):
        cfg.openai_api_key_encrypted = None
    if update_data.pop("clear_anthropic_api_key", False):
        cfg.anthropic_api_key_encrypted = None

    # Handle API key updates
    if "openai_api_key" in update_data:
        key = update_data.pop("openai_api_key")
        if key is not None and key.strip():
            cfg.openai_api_key_encrypted = encrypt_secret(key)
        else:
            cfg.openai_api_key_encrypted = None

    if "anthropic_api_key" in update_data:
        key = update_data.pop("anthropic_api_key")
        if key is not None and key.strip():
            cfg.anthropic_api_key_encrypted = encrypt_secret(key)
        else:
            cfg.anthropic_api_key_encrypted = None

    # Apply remaining updates
    for field, value in update_data.items():
        if hasattr(cfg, field) and value is not None:
            setattr(cfg, field, value)

    db.add(cfg)
    db.commit()
    db.refresh(cfg)

    return get_ai_config(db, current_user)


@router.post("/test", response_model=AITestResponse)
async def test_ai_provider(
    data: AITestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    import time
    started = time.perf_counter()

    # Use provided config or fall back to stored config
    if data.provider or data.model or data.openai_api_key or data.anthropic_api_key:
        from app.services.ai_service import RuntimeAIConfig
        runtime = RuntimeAIConfig(
            provider=data.provider or "demo",
            model=data.model or "gpt-4o-mini",
            openai_api_key=data.openai_api_key,
            anthropic_api_key=data.anthropic_api_key,
        )
    else:
        cfg = get_or_create_ai_config(db)
        runtime = to_runtime_config(cfg)

    try:
        # Simple test: try to generate a brief response
        from app.services.ai_service import generate_with_provider
        test_prompt = "Hello, this is a test message."
        system = "You are a helpful assistant. Respond briefly."
        history = [{"role": "user", "content": test_prompt}]
        text, usage, provider_used = await generate_with_provider(
            runtime, system, history, [], test_prompt
        )
        latency = int((time.perf_counter() - started) * 1000)

        # Update last test status on stored config if not using temp config
        if not (data.provider or data.model or data.openai_api_key or data.anthropic_api_key):
            cfg = get_or_create_ai_config(db)
            cfg.last_test_status = "success"
            cfg.last_test_message = f"Test successful ({provider_used})"
            cfg.last_tested_at = _utcnow()
            db.commit()

        return AITestResponse(
            ok=True,
            provider=provider_used,
            model=runtime.model if provider_used != "demo" else "demo",
            message=text[:500],
            latency_ms=latency,
        )
    except Exception as e:
        latency = int((time.perf_counter() - started) * 1000)
        error_msg = str(e)

        # Update last test status on stored config
        if not (data.provider or data.model or data.openai_api_key or data.anthropic_api_key):
            cfg = get_or_create_ai_config(db)
            cfg.last_test_status = "failed"
            cfg.last_test_message = error_msg
            cfg.last_tested_at = _utcnow()
            db.commit()

        return AITestResponse(
            ok=False,
            provider=runtime.provider,
            model=runtime.model,
            message=f"Test failed: {error_msg}",
            latency_ms=latency,
        )


@router.get("/usage", response_model=AIUsageSummary)
def get_ai_usage(
    conversation_id: Optional[int] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    query = db.query(AIUsageLog)
    if conversation_id:
        query = query.filter(AIUsageLog.conversation_id == conversation_id)

    logs = query.order_by(AIUsageLog.created_at.desc()).limit(limit).all()

    total_requests = len(logs)
    successful = sum(1 for l in logs if l.success)
    failed = total_requests - successful
    total_prompt = sum(l.prompt_tokens for l in logs)
    total_completion = sum(l.completion_tokens for l in logs)
    total_tokens = sum(l.total_tokens for l in logs)
    total_cost = sum(l.estimated_cost_usd for l in logs)

    by_provider: dict[str, dict] = {}
    for log in logs:
        p = log.provider
        if p not in by_provider:
            by_provider[p] = {
                "requests": 0,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
                "cost_usd": 0.0,
                "models": {},
            }
        bp = by_provider[p]
        bp["requests"] += 1
        bp["prompt_tokens"] += log.prompt_tokens
        bp["completion_tokens"] += log.completion_tokens
        bp["total_tokens"] += log.total_tokens
        bp["cost_usd"] += log.estimated_cost_usd
        m = log.model or "unknown"
        if m not in bp["models"]:
            bp["models"][m] = {"requests": 0, "tokens": 0, "cost_usd": 0.0}
        bp["models"][m]["requests"] += 1
        bp["models"][m]["tokens"] += log.total_tokens
        bp["models"][m]["cost_usd"] += log.estimated_cost_usd

    return AIUsageSummary(
        total_requests=total_requests,
        successful_requests=successful,
        failed_requests=failed,
        total_prompt_tokens=total_prompt,
        total_completion_tokens=total_completion,
        total_tokens=total_tokens,
        estimated_cost_usd=total_cost,
        by_provider=by_provider,
    )


def _utcnow():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)