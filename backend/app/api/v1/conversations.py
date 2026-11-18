from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.enums import ConversationStatus, MessageSenderType
from app.db.session import get_db
from app.models.conversation import Conversation
from app.models.csat import CSATRating
from app.models.message import Message
from app.models.user import User
from app.schemas.conversation import (
    ConversationCreate,
    ConversationResponse,
    ConversationDetail,
    ConversationListItem,
    MessageCreate,
    MessageEdit,
    MessageRetract,
    MessageResponse,
    ConversationUpdate,
    GlobalNoteUpdate,
    ConversationLinkItem,
)
from app.schemas.csat import CSATRatingCreate, CSATRatingResponse
from app.services.conversation_service import (
    process_customer_message,
    ensure_can_view,
    get_visible_messages,
    build_conversation_list_item,
    list_conversations_query,
    mark_conversation_read,
    update_conversation_properties,
    reopen_conversation,
    update_global_note,
    get_linked_conversations_for_conversation,
)
from app.services.sla_service import apply_sla_to_conversation


router = APIRouter(prefix="/conversations", tags=["Conversations"])


@router.post("", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
def create_conversation(
    data: ConversationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "customer":
        raise HTTPException(status_code=403, detail="Only customers can create conversations")

    conversation = Conversation(
        customer_id=current_user.id,
        subject=data.subject,
        status=ConversationStatus.AI_HANDLING,
        channel=data.channel or "website",
        priority=data.priority or "normal",
        tags=data.tags or [],
        assignment_history=[],
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    apply_sla_to_conversation(db, conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


@router.get("", response_model=list[ConversationListItem])
def list_conversations(
    status_filter: str | None = Query(None, alias="status"),
    q: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "customer":
        raise HTTPException(status_code=403, detail="Not authorized")
    items, _ = list_conversations_query(db, viewer=current_user, status_filter=status_filter, q=q, limit=limit, offset=offset)
    return [build_conversation_list_item(db, c, viewer=current_user) for c in items]


@router.get("/{conversation_id}", response_model=ConversationDetail)
def get_conversation(
    conversation_id: int,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    ensure_can_view(current_user, conversation)

    include_internal = current_user.role in ("agent", "admin")
    messages_q = db.query(Message).filter(Message.conversation_id == conversation_id)
    if not include_internal:
        messages_q = messages_q.filter(Message.is_internal == False, Message.is_retracted == False)  # noqa: E712
    messages = messages_q.order_by(Message.created_at.asc(), Message.id.asc()).offset(offset).limit(limit).all()

    if current_user.role == "customer":
        mark_conversation_read(db, conversation, "customer")
        db.commit()
        db.refresh(conversation)

    item = build_conversation_list_item(db, conversation, viewer=current_user)

    return ConversationDetail(
        id=conversation.id,
        customer_id=conversation.customer_id,
        assigned_agent_id=conversation.assigned_agent_id,
        subject=conversation.subject,
        status=conversation.status,
        channel=conversation.channel,
        priority=getattr(conversation, "priority", "normal"),
        tags=getattr(conversation, "tags", []) or [],
        resolution_details=getattr(conversation, "resolution_details", None),
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        resolved_at=getattr(conversation, "resolved_at", None),
        closed_at=getattr(conversation, "closed_at", None),
        customer_last_read_at=getattr(conversation, "customer_last_read_at", None),
        agent_last_read_at=getattr(conversation, "agent_last_read_at", None),
        assignment_history=getattr(conversation, "assignment_history", []) or [],
        global_note=conversation.global_note if include_internal else None,
        global_note_updated_at=conversation.global_note_updated_at if include_internal else None,
        global_note_updated_by_id=conversation.global_note_updated_by_id if include_internal else None,
        global_note_updated_by_name=(conversation.global_note_updated_by.full_name if conversation.global_note_updated_by else None) if include_internal else None,
        messages=[MessageResponse.model_validate(m) for m in messages],
        customer_name=item.get("customer_name"),
        customer_email=item.get("customer_email"),
        assigned_agent_name=item.get("assigned_agent_name"),
        last_message=item.get("last_message"),
        last_message_at=item.get("last_message_at"),
        unread_count=item.get("unread_count", 0),
        merged_into_id=getattr(conversation, "merged_into_id", None),
        linked_conversations=[
            ConversationLinkItem.model_validate(l)
            for l in get_linked_conversations_for_conversation(db, conversation.id)
        ] if include_internal else None,
    )


@router.post("/{conversation_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message(
    conversation_id: int,
    data: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    ensure_can_view(current_user, conversation)

    # customers cannot send internal notes
    if current_user.role == "customer" and data.is_internal:
        raise HTTPException(status_code=403, detail="Customers cannot create internal notes")

    if conversation.status in (ConversationStatus.RESOLVED, ConversationStatus.CLOSED):
        # allow only reopen flow separately; no messages unless reopened
        raise HTTPException(status_code=409, detail="This conversation is no longer accepting messages")

    if current_user.role == "customer":
        customer_message = await process_customer_message(db, conversation, current_user, data.content, client_message_id=data.client_message_id)
        db.refresh(customer_message)
        return customer_message
    else:
        # not expected via this route, but safe
        raise HTTPException(status_code=403, detail="Use agent endpoints to send staff messages")


@router.patch("/{conversation_id}", response_model=ConversationResponse)
def update_conversation(
    conversation_id: int,
    data: ConversationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    ensure_can_view(current_user, conversation)
    if current_user.role == "customer":
        # customers may only update subject on their own open conversation
        if data.priority is not None or data.tags is not None:
            raise HTTPException(status_code=403, detail="Customers cannot update priority or tags")
    update_conversation_properties(db, conversation, current_user, subject=data.subject,
                                   priority=data.priority if current_user.role != "customer" else None,
                                   tags=data.tags if current_user.role != "customer" else None)
    db.commit()
    db.refresh(conversation)
    return conversation


@router.post("/{conversation_id}/reopen", response_model=ConversationResponse)
def reopen_conversation_customer(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if current_user.role != "customer":
        raise HTTPException(status_code=403, detail="Only customers can use this endpoint")
    reopen_conversation(db, conversation, current_user)
    db.commit()
    db.refresh(conversation)
    return conversation


@router.post("/{conversation_id}/csat", response_model=CSATRatingResponse, status_code=201)
def submit_csat_rating(
    conversation_id: int,
    data: CSATRatingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Customer submits a CSAT rating for a resolved conversation."""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if current_user.role != "customer":
        raise HTTPException(status_code=403, detail="Only customers can submit CSAT ratings")
    if conversation.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your conversation")
    if conversation.status not in (ConversationStatus.RESOLVED, ConversationStatus.CLOSED):
        raise HTTPException(status_code=409, detail="Conversation must be resolved or closed to rate")

    # Check if already rated
    existing = db.query(CSATRating).filter(CSATRating.conversation_id == conversation_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="CSAT rating already submitted")

    rating = CSATRating(
        conversation_id=conversation_id,
        customer_id=current_user.id,
        rating=data.rating,
        comment=data.comment,
    )
    db.add(rating)
    db.commit()
    db.refresh(rating)
    return rating


@router.get("/{conversation_id}/csat", response_model=CSATRatingResponse | None)
def get_csat_rating(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get CSAT rating for a conversation (customer or agent/admin)."""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if current_user.role == "customer" and conversation.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your conversation")
    if current_user.role == "agent" and conversation.assigned_agent_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your assigned conversation")

    rating = db.query(CSATRating).filter(CSATRating.conversation_id == conversation_id).first()
    return rating


@router.patch("/{conversation_id}/global-note")
def update_global_note_endpoint(
    conversation_id: int,
    data: GlobalNoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update persistent Global Internal Note. Strictly forbidden for customers."""
    if current_user.role not in ("agent", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden: only agents and admins can access internal notes")
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    ensure_can_view(current_user, conversation)
    res = update_global_note(db, conversation, data.text, current_user)
    return res


@router.patch("/{conversation_id}/messages/{message_id}", response_model=MessageResponse)
def edit_private_note(
    conversation_id: int,
    message_id: int,
    data: MessageEdit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit an internal private note. Permitted for the note author or admins."""
    if current_user.role not in ("agent", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden: only agents and admins can edit private notes")

    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    ensure_can_view(current_user, conversation)

    message = db.query(Message).filter(Message.id == message_id, Message.conversation_id == conversation_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    if not message.is_internal:
        raise HTTPException(status_code=400, detail="Only private notes can be edited")

    if current_user.role != "admin" and message.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own private notes")

    now = datetime.now(timezone.utc)
    history_entry = {
        "content": message.content,
        "edited_at": now.isoformat(),
        "edited_by_id": current_user.id,
        "edited_by_name": current_user.full_name,
    }
    current_history = list(message.edit_history) if message.edit_history else []
    current_history.append(history_entry)
    message.edit_history = current_history
    message.content = data.content
    message.edited_at = now
    message.edited_by_id = current_user.id

    db.commit()
    db.refresh(message)
    return MessageResponse.model_validate(message)


@router.post("/{conversation_id}/messages/{message_id}/retract")
def retract_message(
    conversation_id: int,
    message_id: int,
    data: Optional[MessageRetract] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Undo / retract a sent agent message within 5 seconds."""
    if current_user.role not in ("agent", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden: only agents and admins can retract messages")

    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    ensure_can_view(current_user, conversation)

    message = db.query(Message).filter(Message.id == message_id, Message.conversation_id == conversation_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    if message.is_internal:
        raise HTTPException(status_code=400, detail="Private notes cannot be retracted; use the edit functionality")

    if current_user.role != "admin" and message.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only undo/retract your own messages")

    if message.is_retracted:
        raise HTTPException(status_code=400, detail="Message has already been retracted")

    now = datetime.now(timezone.utc)
    msg_created = message.created_at
    if msg_created.tzinfo is None:
        msg_created = msg_created.replace(tzinfo=timezone.utc)
    diff = (now - msg_created).total_seconds()
    if diff > 6.0:  # 5s window + 1s network latency buffer
        raise HTTPException(status_code=400, detail="Undo window has expired (exceeded 5 seconds)")

    message.is_retracted = True
    message.retracted_at = now
    message.retracted_by_id = current_user.id

    db.commit()
    db.refresh(message)
    return {"message": "Message retracted successfully", "id": message.id}

