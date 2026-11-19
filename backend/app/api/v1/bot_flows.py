from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_roles
from app.db.session import get_db
from app.models.bot_flow import BotFlow, BotFlowIssue, BotFlowStep
from app.models.user import User
from app.schemas.bot_flow import (
    BotFlowCreate,
    BotFlowIssueCreate,
    BotFlowIssueResponse,
    BotFlowIssueUpdate,
    BotFlowPublish,
    BotFlowResponse,
    BotFlowStepCreate,
    BotFlowStepResponse,
    BotFlowStepUpdate,
    BotFlowUpdate,
)

router = APIRouter(prefix="/bot-flows", tags=["Bot Flows"])


def require_admin_or_agent(current_user: User = Depends(require_roles("agent", "admin"))) -> User:
    return current_user


# ===== Bot Flow Endpoints =====

@router.post("", response_model=BotFlowResponse, status_code=status.HTTP_201_CREATED)
def create_bot_flow(
    data: BotFlowCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Create a bot flow."""
    flow = BotFlow(
        name=data.name,
        description=data.description,
        initial_greeting=data.initial_greeting,
        status=data.status,
        is_default=data.is_default,
        created_by_id=current_user.id,
    )
    db.add(flow)
    db.commit()
    db.refresh(flow)
    return flow


@router.get("", response_model=list[BotFlowResponse])
def list_bot_flows(
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """List bot flows."""
    query = db.query(BotFlow)
    if status:
        query = query.filter(BotFlow.status == status)
    return query.order_by(BotFlow.name).all()


@router.get("/{flow_id}", response_model=BotFlowResponse)
def get_bot_flow(
    flow_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Get a specific bot flow."""
    flow = db.query(BotFlow).filter(BotFlow.id == flow_id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Bot flow not found")
    return flow


@router.patch("/{flow_id}", response_model=BotFlowResponse)
def update_bot_flow(
    flow_id: int,
    data: BotFlowUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Update a bot flow."""
    flow = db.query(BotFlow).filter(BotFlow.id == flow_id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Bot flow not found")

    # Only creator or admin can update
    if flow.created_by_id != current_user.id and current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Not authorized to update this bot flow")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(flow, field, value)

    db.commit()
    db.refresh(flow)
    return flow


@router.delete("/{flow_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bot_flow(
    flow_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Delete a bot flow."""
    flow = db.query(BotFlow).filter(BotFlow.id == flow_id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Bot flow not found")

    # Only creator or admin can delete
    if flow.created_by_id != current_user.id and current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Not authorized to delete this bot flow")

    db.delete(flow)
    db.commit()
    return None


@router.post("/{flow_id}/publish", response_model=BotFlowResponse)
def publish_bot_flow(
    flow_id: int,
    data: BotFlowPublish,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Publish a bot flow (increment version, set status to published)."""
    flow = db.query(BotFlow).filter(BotFlow.id == flow_id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Bot flow not found")

    # Only creator or admin can publish
    if flow.created_by_id != current_user.id and current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Not authorized to publish this bot flow")

    # If setting as default, unset other defaults
    if flow.is_default:
        db.query(BotFlow).filter(BotFlow.id != flow_id).update({BotFlow.is_default: False})

    flow.status = "published"
    flow.version += 1
    db.commit()
    db.refresh(flow)
    return flow


@router.post("/{flow_id}/archive", response_model=BotFlowResponse)
def archive_bot_flow(
    flow_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Archive a bot flow."""
    flow = db.query(BotFlow).filter(BotFlow.id == flow_id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Bot flow not found")

    if flow.created_by_id != current_user.id and current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Not authorized to archive this bot flow")

    flow.status = "archived"
    db.commit()
    db.refresh(flow)
    return flow


# ===== Bot Flow Step Endpoints =====

@router.post("/{flow_id}/steps", response_model=BotFlowStepResponse, status_code=status.HTTP_201_CREATED)
def create_bot_flow_step(
    flow_id: int,
    data: BotFlowStepCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Create a step in a bot flow."""
    flow = db.query(BotFlow).filter(BotFlow.id == flow_id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Bot flow not found")

    step = BotFlowStep(
        flow_id=flow_id,
        step_key=data.step_key,
        step_type=data.step_type,
        message_text=data.message_text,
        options=data.options,
        next_step_key=data.next_step_key,
        is_terminal=data.is_terminal,
        sort_order=data.sort_order,
    )
    db.add(step)
    db.commit()
    db.refresh(step)
    return step


@router.get("/{flow_id}/steps", response_model=list[BotFlowStepResponse])
def list_bot_flow_steps(
    flow_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """List all steps in a bot flow."""
    flow = db.query(BotFlow).filter(BotFlow.id == flow_id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Bot flow not found")

    return (
        db.query(BotFlowStep)
        .filter(BotFlowStep.flow_id == flow_id)
        .order_by(BotFlowStep.sort_order, BotFlowStep.step_key)
        .all()
    )


@router.patch("/steps/{step_id}", response_model=BotFlowStepResponse)
def update_bot_flow_step(
    step_id: int,
    data: BotFlowStepUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Update a bot flow step."""
    step = db.query(BotFlowStep).filter(BotFlowStep.id == step_id).first()
    if not step:
        raise HTTPException(status_code=404, detail="Bot flow step not found")

    flow = db.query(BotFlow).filter(BotFlow.id == step.flow_id).first()
    if flow.created_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to update this step")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(step, field, value)

    db.commit()
    db.refresh(step)
    return step


@router.delete("/steps/{step_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bot_flow_step(
    step_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Delete a bot flow step."""
    step = db.query(BotFlowStep).filter(BotFlowStep.id == step_id).first()
    if not step:
        raise HTTPException(status_code=404, detail="Bot flow step not found")

    flow = db.query(BotFlow).filter(BotFlow.id == step.flow_id).first()
    if flow.created_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this step")

    db.delete(step)
    db.commit()
    return None


# ===== Bot Flow Issue Endpoints =====

@router.post("/{flow_id}/issues", response_model=BotFlowIssueResponse, status_code=status.HTTP_201_CREATED)
def create_bot_flow_issue(
    flow_id: int,
    data: BotFlowIssueCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Create an issue menu item for a bot flow."""
    flow = db.query(BotFlow).filter(BotFlow.id == flow_id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Bot flow not found")

    issue = BotFlowIssue(
        flow_id=flow_id,
        title=data.title,
        description=data.description,
        start_step_key=data.start_step_key,
        sort_order=data.sort_order,
        is_active=data.is_active,
    )
    db.add(issue)
    db.commit()
    db.refresh(issue)
    return issue


@router.get("/{flow_id}/issues", response_model=list[BotFlowIssueResponse])
def list_bot_flow_issues(
    flow_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """List all issues for a bot flow."""
    flow = db.query(BotFlow).filter(BotFlow.id == flow_id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Bot flow not found")

    return (
        db.query(BotFlowIssue)
        .filter(BotFlowIssue.flow_id == flow_id)
        .order_by(BotFlowIssue.sort_order, BotFlowIssue.title)
        .all()
    )


@router.patch("/issues/{issue_id}", response_model=BotFlowIssueResponse)
def update_bot_flow_issue(
    issue_id: int,
    data: BotFlowIssueUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Update a bot flow issue."""
    issue = db.query(BotFlowIssue).filter(BotFlowIssue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Bot flow issue not found")

    flow = db.query(BotFlow).filter(BotFlow.id == issue.flow_id).first()
    if flow.created_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to update this issue")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(issue, field, value)

    db.commit()
    db.refresh(issue)
    return issue


@router.delete("/issues/{issue_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bot_flow_issue(
    issue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Delete a bot flow issue."""
    issue = db.query(BotFlowIssue).filter(BotFlowIssue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Bot flow issue not found")

    flow = db.query(BotFlow).filter(BotFlow.id == issue.flow_id).first()
    if flow.created_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this issue")

    db.delete(issue)
    db.commit()
    return None