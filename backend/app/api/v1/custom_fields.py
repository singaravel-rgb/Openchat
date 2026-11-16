from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_roles
from app.db.session import get_db
from app.models.conversation import Conversation
from app.models.custom_field import CustomField, ConversationCustomField
from app.models.user import User
from app.schemas.custom_field import (
    CustomFieldCreate,
    CustomFieldResponse,
    CustomFieldUpdate,
    ConversationCustomFieldSet,
    ConversationCustomFieldValue,
)

router = APIRouter(prefix="/custom-fields", tags=["Custom Fields"])


def require_agent_or_admin(current_user: User = Depends(require_roles("agent", "admin"))) -> User:
    return current_user


@router.post("", response_model=CustomFieldResponse, status_code=status.HTTP_201_CREATED)
def create_custom_field(
    data: CustomFieldCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
):
    """Create a custom field definition (agents and admins)."""
    existing = db.query(CustomField).filter(CustomField.field_key == data.field_key).first()
    if existing:
        raise HTTPException(status_code=409, detail="Custom field key already exists")

    field = CustomField(
        name=data.name,
        field_key=data.field_key,
        field_type=data.field_type,
        options=data.options,
        is_required=data.is_required,
        is_active=data.is_active,
        created_by_id=current_user.id,
    )
    db.add(field)
    db.commit()
    db.refresh(field)
    return field


@router.get("", response_model=list[CustomFieldResponse])
def list_custom_fields(
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
):
    """List custom field definitions."""
    query = db.query(CustomField)
    if is_active is not None:
        query = query.filter(CustomField.is_active == is_active)
    return query.order_by(CustomField.name).all()


@router.get("/{field_id}", response_model=CustomFieldResponse)
def get_custom_field(
    field_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
):
    """Get a specific custom field definition."""
    field = db.query(CustomField).filter(CustomField.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail="Custom field not found")
    return field


@router.patch("/{field_id}", response_model=CustomFieldResponse)
def update_custom_field(
    field_id: int,
    data: CustomFieldUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
):
    """Update a custom field definition."""
    field = db.query(CustomField).filter(CustomField.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail="Custom field not found")

    # Only creator or admin can update
    if field.created_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to update this custom field")

    for field_name, value in data.model_dump(exclude_unset=True).items():
        setattr(field, field_name, value)

    db.commit()
    db.refresh(field)
    return field


@router.delete("/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_custom_field(
    field_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
):
    """Delete a custom field definition."""
    field = db.query(CustomField).filter(CustomField.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail="Custom field not found")

    # Only creator or admin can delete
    if field.created_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this custom field")

    # Delete associated values
    db.query(ConversationCustomField).filter(
        ConversationCustomField.custom_field_id == field_id
    ).delete()

    db.delete(field)
    db.commit()
    return None


@router.get("/conversation/{conversation_id}", response_model=list[ConversationCustomFieldValue])
def get_conversation_custom_fields(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all custom field values for a conversation."""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Permission check
    if current_user.role == "customer" and conversation.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if current_user.role == "agent" and conversation.assigned_agent_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    values = (
        db.query(ConversationCustomField, CustomField)
        .join(CustomField, ConversationCustomField.custom_field_id == CustomField.id)
        .filter(ConversationCustomField.conversation_id == conversation_id)
        .all()
    )

    return [
        ConversationCustomFieldValue(
            custom_field_id=cf.custom_field_id,
            field_key=cfd.field_key,
            field_name=cfd.name,
            field_type=cfd.field_type,
            value=cf.value,
        )
        for cf, cfd in values
    ]


@router.post("/conversation/{conversation_id}", response_model=list[ConversationCustomFieldValue])
def set_conversation_custom_fields(
    conversation_id: int,
    data: ConversationCustomFieldSet,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
):
    """Set custom field values for a conversation."""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Permission check
    if current_user.role == "agent" and conversation.assigned_agent_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    results = []
    for field_key, value in data.field_values.items():
        field = db.query(CustomField).filter(CustomField.field_key == field_key).first()
        if not field:
            continue  # Skip unknown fields

        # Validate field type
        if field.field_type == "boolean" and value.lower() not in ("true", "false"):
            raise HTTPException(status_code=400, detail=f"Invalid boolean value for field {field_key}")
        if field.field_type == "number":
            try:
                float(value)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid number value for field {field_key}")

        # Upsert value
        existing = (
            db.query(ConversationCustomField)
            .filter(
                ConversationCustomField.conversation_id == conversation_id,
                ConversationCustomField.custom_field_id == field.id,
            )
            .first()
        )

        if existing:
            existing.value = value
        else:
            new_value = ConversationCustomField(
                conversation_id=conversation_id,
                custom_field_id=field.id,
                value=value,
            )
            db.add(new_value)

        results.append(
            ConversationCustomFieldValue(
                custom_field_id=field.id,
                field_key=field.field_key,
                field_name=field.name,
                field_type=field.field_type,
                value=value,
            )
        )

    db.commit()
    return results