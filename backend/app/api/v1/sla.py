from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_roles
from app.db.session import get_db
from app.models.conversation import Conversation, SLAConfig
from app.models.user import User
from app.schemas.sla import SLAConfigCreate, SLAConfigRead, SLAConfigUpdate, SLAStatus
from app.services.sla_service import get_sla_status

router = APIRouter(prefix="/admin/sla", tags=["Admin SLA"])


def require_admin(current_user: User = Depends(require_roles("admin", "super_admin"))) -> User:
    return current_user


@router.get("/configs", response_model=list[SLAConfigRead])
def list_sla_configs(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return db.query(SLAConfig).order_by(SLAConfig.id).all()


@router.get("/configs/{config_id}", response_model=SLAConfigRead)
def get_sla_config(
    config_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    config = db.query(SLAConfig).filter(SLAConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="SLA config not found")
    return config


@router.post("/configs", response_model=SLAConfigRead, status_code=status.HTTP_201_CREATED)
def create_sla_config(
    data: SLAConfigCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    existing = db.query(SLAConfig).filter(SLAConfig.name == data.name).first()
    if existing:
        raise HTTPException(status_code=409, detail="An SLA config with this name already exists")

    # If this is set as default, unset other defaults
    if data.is_default:
        db.query(SLAConfig).filter(SLAConfig.is_default == True).update({"is_default": False})

    config = SLAConfig(**data.model_dump())
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


@router.patch("/configs/{config_id}", response_model=SLAConfigRead)
def update_sla_config(
    config_id: int,
    data: SLAConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    config = db.query(SLAConfig).filter(SLAConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="SLA config not found")

    # If this is set as default, unset other defaults
    if data.is_default:
        db.query(SLAConfig).filter(SLAConfig.is_default == True).update({"is_default": False})

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(config, field, value)

    db.commit()
    db.refresh(config)
    return config


@router.delete("/configs/{config_id}")
def delete_sla_config(
    config_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    config = db.query(SLAConfig).filter(SLAConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="SLA config not found")

    db.delete(config)
    db.commit()
    return {"message": "SLA config deleted"}


@router.get("/conversations/{conversation_id}/status", response_model=SLAStatus)
def get_conversation_sla_status(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("agent", "admin")),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if current_user.role == "agent":
        if conversation.assigned_agent_id != current_user.id and conversation.status not in [
            "ai_handling",
            "pending",
        ]:
            raise HTTPException(status_code=403, detail="Not authorized to view this conversation")

    sla_data = get_sla_status(conversation)

    return SLAStatus(
        conversation_id=conversation.id,
        sla_config_name=conversation.sla_config.name if conversation.sla_config else None,
        response_due_at=conversation.sla_response_due_at,
        resolution_due_at=conversation.sla_resolution_due_at,
        response_breached=conversation.sla_response_breached,
        resolution_breached=conversation.sla_resolution_breached,
        first_response_at=conversation.first_response_at,
        resolved_at=conversation.resolved_at,
        **sla_data,
    )


@router.post("/check-all")
def check_all_sla(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    from app.services.sla_service import check_all_conversations_sla
    breach_count = check_all_conversations_sla(db)
    return {"message": f"SLA check completed. Found {breach_count} breached conversations."}