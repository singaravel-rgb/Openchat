from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import require_roles
from app.db.session import get_db
from app.models.tag import Tag
from app.models.user import User
from app.schemas.tag import TagCreate, TagResponse, TagUpdate

router = APIRouter(prefix="/tags", tags=["Tags"])


def require_staff(current_user: User = Depends(require_roles("agent", "admin", "super_admin"))) -> User:
    return current_user


def require_admin(current_user: User = Depends(require_roles("admin", "super_admin"))) -> User:
    return current_user


@router.get("", response_model=list[TagResponse])
def list_tags(
    is_active: Optional[bool] = Query(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """List configurable conversation tags."""
    query = db.query(Tag)
    if is_active is not None:
        query = query.filter(Tag.is_active == is_active)
    return query.order_by(Tag.name.asc()).all()


@router.post("", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
def create_tag(
    data: TagCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Create a new configurable conversation tag (Admin / Super Admin)."""
    name_clean = data.name.strip()
    if not name_clean:
        raise HTTPException(status_code=400, detail="Tag name cannot be empty")
    existing = db.query(Tag).filter(Tag.name.ilike(name_clean)).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Tag '{name_clean}' already exists")

    tag = Tag(
        name=name_clean,
        color=data.color or "#3b82f6",
        description=data.description,
        is_active=data.is_active,
        created_by_id=current_user.id,
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


@router.patch("/{tag_id}", response_model=TagResponse)
def update_tag(
    tag_id: int,
    data: TagUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Update an existing tag (Admin / Super Admin)."""
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    if data.name is not None:
        name_clean = data.name.strip()
        if not name_clean:
            raise HTTPException(status_code=400, detail="Tag name cannot be empty")
        dup = db.query(Tag).filter(Tag.name.ilike(name_clean), Tag.id != tag_id).first()
        if dup:
            raise HTTPException(status_code=409, detail=f"Tag '{name_clean}' already exists")
        tag.name = name_clean
    if data.color is not None:
        tag.color = data.color
    if data.description is not None:
        tag.description = data.description
    if data.is_active is not None:
        tag.is_active = data.is_active

    db.commit()
    db.refresh(tag)
    return tag


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Delete a tag from the configurable catalog (Admin / Super Admin)."""
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    db.delete(tag)
    db.commit()
    return None
