import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_roles
from app.db.session import get_db
from app.models.automation_rule import AutomationRule, AutomationRuleExecution
from app.models.user import User
from app.schemas.automation_rule import (
    AutomationRuleCreate,
    AutomationRuleResponse,
    AutomationRuleUpdate,
    AutomationRuleExecutionResponse,
)

router = APIRouter(prefix="/automation-rules", tags=["Automation Rules"])


def require_admin_or_agent(current_user: User = Depends(require_roles("agent", "admin"))) -> User:
    return current_user


# ===== Automation Rule Endpoints =====

@router.post("", response_model=AutomationRuleResponse, status_code=status.HTTP_201_CREATED)
def create_automation_rule(
    data: AutomationRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Create an automation rule."""
    rule = AutomationRule(
        name=data.name,
        description=data.description,
        trigger_event=data.trigger_event,
        conditions=json.dumps(data.conditions),
        actions=json.dumps(data.actions),
        is_active=data.is_active,
        created_by_id=current_user.id,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _rule_to_response(rule)


@router.get("", response_model=list[AutomationRuleResponse])
def list_automation_rules(
    is_active: Optional[bool] = Query(None),
    trigger_event: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """List automation rules."""
    query = db.query(AutomationRule)
    if is_active is not None:
        query = query.filter(AutomationRule.is_active == is_active)
    if trigger_event:
        query = query.filter(AutomationRule.trigger_event == trigger_event)
    return [_rule_to_response(r) for r in query.order_by(AutomationRule.name).all()]


@router.get("/{rule_id}", response_model=AutomationRuleResponse)
def get_automation_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Get a specific automation rule."""
    rule = db.query(AutomationRule).filter(AutomationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Automation rule not found")
    return _rule_to_response(rule)


@router.patch("/{rule_id}", response_model=AutomationRuleResponse)
def update_automation_rule(
    rule_id: int,
    data: AutomationRuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Update an automation rule."""
    rule = db.query(AutomationRule).filter(AutomationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Automation rule not found")

    if rule.created_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to update this rule")

    for field, value in data.model_dump(exclude_unset=True).items():
        if field in ("conditions", "actions") and value is not None:
            setattr(rule, field, json.dumps(value))
        else:
            setattr(rule, field, value)

    db.commit()
    db.refresh(rule)
    return _rule_to_response(rule)


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_automation_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Delete an automation rule."""
    rule = db.query(AutomationRule).filter(AutomationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Automation rule not found")

    if rule.created_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this rule")

    db.delete(rule)
    db.commit()
    return None


@router.get("/{rule_id}/executions", response_model=list[AutomationRuleExecutionResponse])
def list_rule_executions(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """List execution history for a rule."""
    rule = db.query(AutomationRule).filter(AutomationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Automation rule not found")

    executions = (
        db.query(AutomationRuleExecution)
        .filter(AutomationRuleExecution.rule_id == rule_id)
        .order_by(AutomationRuleExecution.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        AutomationRuleExecutionResponse(
            id=e.id,
            rule_id=e.rule_id,
            trigger_event=e.trigger_event,
            trigger_payload=json.loads(e.trigger_payload) if e.trigger_payload else {},
            actions_taken=json.loads(e.actions_taken) if e.actions_taken else [],
            success=e.success,
            error_message=e.error_message,
            created_at=e.created_at,
        )
        for e in executions
    ]


def _rule_to_response(rule: AutomationRule) -> AutomationRuleResponse:
    """Convert AutomationRule model to response schema."""
    return AutomationRuleResponse(
        id=rule.id,
        name=rule.name,
        description=rule.description,
        trigger_event=rule.trigger_event,
        conditions=json.loads(rule.conditions) if rule.conditions else [],
        actions=json.loads(rule.actions) if rule.actions else [],
        is_active=rule.is_active,
        created_by_id=rule.created_by_id,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )