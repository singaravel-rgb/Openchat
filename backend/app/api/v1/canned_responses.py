from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_roles
from app.db.session import get_db
from app.models.canned_response import CannedResponse
from app.models.user import User
from app.schemas.canned_response import (
    CannedResponseCreate,
    CannedResponseResponse,
    CannedResponseUpdate,
    CannedResponseUseResponse,
)

router = APIRouter(prefix="/canned-responses", tags=["Canned Responses"])


def require_agent_or_admin(current_user: User = Depends(require_roles("agent", "admin"))) -> User:
    return current_user


@router.post("", response_model=CannedResponseResponse, status_code=status.HTTP_201_CREATED)
def create_canned_response(
    data: CannedResponseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
):
    """Create a canned response (agents and admins)."""
    canned = CannedResponse(
        title=data.title,
        content=data.content,
        category=data.category,
        shortcut=data.shortcut,
        created_by_id=current_user.id,
        is_active=data.is_active,
    )
    db.add(canned)
    db.commit()
    db.refresh(canned)
    return canned


@router.get("", response_model=list[CannedResponseResponse])
def list_canned_responses(
    category: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
):
    """List canned responses with optional filtering."""
    query = db.query(CannedResponse)
    if category:
        query = query.filter(CannedResponse.category == category)
    if is_active is not None:
        query = query.filter(CannedResponse.is_active == is_active)
    return query.order_by(CannedResponse.category, CannedResponse.title).all()


@router.get("/{canned_id}", response_model=CannedResponseResponse)
def get_canned_response(
    canned_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
):
    """Get a specific canned response."""
    canned = db.query(CannedResponse).filter(CannedResponse.id == canned_id).first()
    if not canned:
        raise HTTPException(status_code=404, detail="Canned response not found")
    return canned


@router.patch("/{canned_id}", response_model=CannedResponseResponse)
def update_canned_response(
    canned_id: int,
    data: CannedResponseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
):
    """Update a canned response."""
    canned = db.query(CannedResponse).filter(CannedResponse.id == canned_id).first()
    if not canned:
        raise HTTPException(status_code=404, detail="Canned response not found")

    # Only creator or admin can update
    if canned.created_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to update this canned response")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(canned, field, value)

    db.commit()
    db.refresh(canned)
    return canned


@router.delete("/{canned_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_canned_response(
    canned_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
):
    """Delete a canned response."""
    canned = db.query(CannedResponse).filter(CannedResponse.id == canned_id).first()
    if not canned:
        raise HTTPException(status_code=404, detail="Canned response not found")

    # Only creator or admin can delete
    if canned.created_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this canned response")

    db.delete(canned)
    db.commit()
    return None


@router.post("/{canned_id}/use", response_model=CannedResponseUseResponse)
def use_canned_response(
    canned_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
):
    """Mark a canned response as used and return its content."""
    canned = db.query(CannedResponse).filter(CannedResponse.id == canned_id).first()
    if not canned:
        raise HTTPException(status_code=404, detail="Canned response not found")
    if not canned.is_active:
        raise HTTPException(status_code=400, detail="Canned response is not active")

    canned.usage_count += 1
    db.commit()

    return CannedResponseUseResponse(content=canned.content, title=canned.title)