from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.dependencies import require_roles
from app.db.session import get_db
from app.models.user import User
from app.schemas.widget import WidgetConfigResponse, WidgetConfigUpdate
from app.services.widget_service import get_or_create_widget_config, update_widget_config, build_embed_snippet

router = APIRouter(prefix="/admin/widget", tags=["Admin Widget"])


def require_admin(current_user: User = Depends(require_roles("admin"))) -> User:
    return current_user


@router.get("/config", response_model=WidgetConfigResponse)
def get_widget_config_admin(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return get_or_create_widget_config(db)


@router.put("/config", response_model=WidgetConfigResponse)
def update_widget_config_admin(
    data: WidgetConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    payload = data.model_dump(exclude_unset=True)
    # normalize domains
    if "allowed_domains" in payload and payload["allowed_domains"] is not None:
        cleaned = []
        for d in payload["allowed_domains"]:
            if not isinstance(d, str):
                continue
            v = d.strip()
            if not v:
                continue
            # keep as provided but trim; origin validation normalizes scheme/host
            if v.endswith('/'):
                v = v[:-1]
            if v not in cleaned:
                cleaned.append(v)
        payload["allowed_domains"] = cleaned
    return update_widget_config(db, payload)


@router.get("/embed-snippet")
def get_embed_snippet(
    request: Request,
    backend_url: str | None = None,
    current_user: User = Depends(require_admin),
):
    base = backend_url.rstrip('/') if backend_url else str(request.base_url).rstrip('/')
    return {"snippet": build_embed_snippet(base), "script_url": f"{base}/api/v1/widget/embed.js"}


@router.post("/test-connection")
def test_widget_connection(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    import time
    start = time.time()
    cfg = get_or_create_widget_config(db)
    
    from app.core.config import settings
    from app.models.widget import WidgetSession
    session_count = db.query(WidgetSession).count()
    duration_ms = round((time.time() - start) * 1000, 2)
    
    checks = [
        {"name": "Widget Service", "status": "ok" if cfg.widget_visibility else "disabled", "detail": "Visible and accepting traffic" if cfg.widget_visibility else "Widget launcher is disabled"},
        {"name": "Widget Availability", "status": "ok" if cfg.widget_availability else "disabled", "detail": "Customer messaging enabled" if cfg.widget_availability else "Messaging paused"},
        {"name": "Allowed Domains", "status": "ok", "detail": f"{len(cfg.allowed_domains or [])} origin(s) allowed (or open in development)"},
        {"name": "Embed Script Delivery", "status": "ok", "detail": f"{str(request.base_url).rstrip('/')}/api/v1/widget/embed.js generated"},
        {"name": "AI Grounding Engine", "status": "ok", "detail": f"Provider: {settings.ai_provider} ({settings.ai_model})"},
        {"name": "Session Store", "status": "ok", "detail": f"{session_count} active/past customer sessions tracked"}
    ]
    
    return {
        "status": "connected" if cfg.widget_visibility and cfg.widget_availability else "attention_needed",
        "latency_ms": duration_ms,
        "is_enabled": bool(cfg.widget_visibility and cfg.widget_availability),
        "checks": checks,
    }
