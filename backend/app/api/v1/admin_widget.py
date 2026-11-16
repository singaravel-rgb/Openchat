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
    current_user: User = Depends(require_admin),
):
    base = str(request.base_url).rstrip('/')
    return {"snippet": build_embed_snippet(base), "script_url": f"{base}/api/v1/widget/embed.js"}
