from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_roles
from app.core.enums import ConversationStatus, MessageSenderType, MessageType
from app.db.session import get_db
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.user import User
from app.schemas.conversation import (
    ConversationDetail,
    ConversationListItem,
    MessageCreate,
    MessageResponse,
    AssignRequest,
    StatusUpdateRequest,
    ConversationUpdate,
)
from app.services.assignment_service import get_agent_workload, process_pending_queue, set_agent_availability
from app.services.notification_service import create_notification
from app.models.notification import NotificationPriority, NotificationType
from app.services.sla_service import record_first_response
from app.services.conversation_service import (
    ensure_can_view,
    ensure_can_modify,
    build_conversation_list_item,
    list_conversations_query,
    mark_conversation_read,
    take_conversation as svc_take,
    resolve_conversation as svc_resolve,
    reopen_conversation as svc_reopen,
    close_conversation as svc_close,
    update_conversation_properties,
    assign_conversation as svc_assign,
)
from app.services.ai_service import get_or_create_ai_config, get_runtime_ai_config, retrieve_knowledge_hits, generate_with_provider, format_knowledge_context

router = APIRouter(prefix="/agent", tags=["Agent Workspace"])


def require_agent(current_user: User = Depends(require_roles("agent", "admin"))) -> User:
    if current_user.role == "agent" and current_user.agent_profile and not current_user.agent_profile.is_approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent account is pending approval",
        )
    return current_user


@router.get("/conversations", response_model=list[ConversationListItem])
def list_agent_conversations(
    status_filter: Optional[str] = Query(None, alias="status"),
    queue: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    items, _ = list_conversations_query(db, viewer=current_user, status_filter=status_filter, queue=queue, q=q, limit=limit, offset=offset)
    return [build_conversation_list_item(db, c, viewer=current_user) for c in items]


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
def get_agent_conversation(
    conversation_id: int,
    limit: int = Query(500, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    ensure_can_view(current_user, conversation)

    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc(), Message.id.asc())
        .offset(offset).limit(limit)
        .all()
    )

    mark_conversation_read(db, conversation, "agent")
    db.commit()
    db.refresh(conversation)

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
        messages=[
            MessageResponse(
                id=m.id,
                conversation_id=m.conversation_id,
                sender_id=m.sender_id,
                sender_type=m.sender_type,
                message_type=m.message_type,
                content=m.content,
                is_internal=m.is_internal,
                delivery_status=getattr(m, "delivery_status", "delivered"),
                processed_at=getattr(m, "processed_at", None),
                client_message_id=getattr(m, "client_message_id", None),
                created_at=m.created_at,
            )
            for m in messages
        ],
    )


@router.post("/conversations/{conversation_id}/messages", response_model=MessageResponse)
def send_agent_message(
    conversation_id: int,
    data: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    ensure_can_modify(current_user, conversation)

    if conversation.status in (ConversationStatus.RESOLVED, ConversationStatus.CLOSED):
        raise HTTPException(status_code=409, detail="This conversation is no longer accepting messages")

    # agents replying in queue take it (or must be assigned)
    if conversation.status in (ConversationStatus.AI_HANDLING, ConversationStatus.PENDING):
        if current_user.role == "agent":
            svc_take(db, conversation, current_user)
            db.flush()
            conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()

    # idempotency for retries
    if data.client_message_id:
        existing = db.query(Message).filter(
            Message.conversation_id == conversation_id,
            Message.client_message_id == data.client_message_id,
            Message.sender_id == current_user.id,
        ).first()
        if existing:
            return existing

    now = datetime.now(timezone.utc)
    message = Message(
        conversation_id=conversation.id,
        sender_id=current_user.id,
        sender_type=MessageSenderType.AGENT,
        message_type=MessageType.INTERNAL_NOTE if data.is_internal else MessageType.TEXT,
        content=data.content,
        is_internal=data.is_internal,
        delivery_status="delivered",
        processed_at=now,
        client_message_id=data.client_message_id,
    )

    db.add(message)
    conversation.updated_at = now
    if not data.is_internal:
        record_first_response(db, conversation)
        create_notification(
            db,
            user_id=conversation.customer_id,
            type=NotificationType.NEW_MESSAGE,
            title="New reply from support",
            message=f"{current_user.full_name} replied to your conversation",
            reference_type="conversation",
            reference_id=conversation.id,
            priority=NotificationPriority.NORMAL,
        )

    db.commit()
    db.refresh(message)
    return message


@router.post("/conversations/{conversation_id}/take")
def take_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    svc_take(db, conversation, current_user)
    db.commit()
    return {"message": "Conversation assigned successfully", "conversation_id": conversation_id}


@router.post("/conversations/{conversation_id}/assign")
def assign_conversation(
    conversation_id: int,
    data: AssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    # only admins can assign to others/unassign; agents can self-assign via take
    if current_user.role == "agent" and data.agent_id not in (None, current_user.id):
        raise HTTPException(status_code=403, detail="Agents cannot reassign to another agent")
    if data.agent_id == current_user.id and current_user.role == "agent":
        svc_take(db, conversation, current_user)
    else:
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Admin only")
        svc_assign(db, conversation, current_user, data.agent_id, note=data.note)
    db.commit()
    return {"message": "Conversation assignment updated"}


@router.patch("/conversations/{conversation_id}")
def update_conversation_agent(
    conversation_id: int,
    data: ConversationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    ensure_can_modify(current_user, conversation)
    update_conversation_properties(db, conversation, current_user, subject=data.subject, priority=data.priority, tags=data.tags)
    db.commit()
    db.refresh(conversation)
    return {"message": "Conversation updated"}


@router.post("/conversations/{conversation_id}/resolve")
def resolve_conversation(
    conversation_id: int,
    data: StatusUpdateRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    svc_resolve(db, conversation, current_user, resolution_details=(data.resolution_details if data else None))
    db.commit()
    return {"message": "Conversation resolved successfully"}


@router.post("/conversations/{conversation_id}/close")
def close_conversation(
    conversation_id: int,
    data: StatusUpdateRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    svc_close(db, conversation, current_user, resolution_details=(data.resolution_details if data else None))
    db.commit()
    return {"message": "Conversation closed successfully"}


@router.post("/conversations/{conversation_id}/reopen")
def reopen_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    svc_reopen(db, conversation, current_user)
    db.commit()
    return {"message": "Conversation reopened successfully"}


@router.get("/workload")
def get_my_workload(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    if current_user.role != "agent":
        return {"active": 0, "max": 5, "available": False, "capacity_remaining": 0}
    return get_agent_workload(db, current_user.id)


@router.patch("/availability")
def set_my_availability(
    is_available: bool = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    if current_user.role != "agent":
        raise HTTPException(status_code=403, detail="Only agents can set availability")
    set_agent_availability(db, current_user.id, is_available)
    return {"message": f"Availability set to {'available' if is_available else 'unavailable'}"}


@router.get("/agents")
def list_agents(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    """List all agents for assignment (agents and admins)."""
    from app.models.user import User as UserModel
    from app.models.conversation import Conversation
    from app.core.enums import ConversationStatus

    agents = db.query(UserModel).filter(UserModel.role == "agent", UserModel.is_active == True).all()  # noqa: E712
    result = []
    for agent in agents:
        profile = agent.agent_profile
        active_count = (
            db.query(Conversation)
            .filter(
                Conversation.assigned_agent_id == agent.id,
                Conversation.status.in_([ConversationStatus.ASSIGNED, ConversationStatus.AI_HANDLING]),
            )
            .count()
        )
        result.append({
            "id": agent.id,
            "email": agent.email,
            "full_name": agent.full_name,
            "is_active": agent.is_active,
            "is_approved": profile.is_approved if profile else False,
            "is_available": profile.is_available if profile else False,
            "max_conversations": profile.max_conversations if profile else 5,
            "active_conversations": active_count,
            "capacity_remaining": max(0, (profile.max_conversations if profile else 5) - active_count),
        })
    return result


@router.post("/conversations/{conversation_id}/ai-suggest")
async def suggest_agent_reply(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    ensure_can_view(current_user, conversation)

    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc(), Message.id.asc())
        .limit(20)
        .all()
    )

    cfg = get_or_create_ai_config(db)
    runtime = get_runtime_ai_config(db)

    # Build context from recent conversation history
    conversation_context: list[dict[str, str]] = []
    last_customer_message = ""
    for m in messages:
        if m.sender_type.name == MessageSenderType.CUSTOMER.name or m.sender_type.name == MessageSenderType.AGENT.name:
            prefix = "Customer: " if m.sender_type.name == MessageSenderType.CUSTOMER.name else "Agent: "
            conversation_context.append({"role": "user" if m.sender_type.name == MessageSenderType.CUSTOMER.name else "assistant", "content": prefix + (m.content or "")})
        elif m.sender_type.name == MessageSenderType.AI.name and not m.is_internal:
            conversation_context.append({"role": "assistant", "content": f"AI: {m.content or ''}"})
        if m.sender_type.name == MessageSenderType.CUSTOMER.name and not m.is_internal:
            last_customer_message = m.content or ""

    hits = retrieve_knowledge_hits(db, last_customer_message or conversation.subject or "", limit=3) if last_customer_message else []
    knowledge_context = format_knowledge_context(hits) if hits else ""

    history = conversation_context[-14:]
    system = (
        "You are a professional customer support agent assisting a human agent. "
        "Draft a helpful, accurate, and empathetic customer support reply based on the conversation context. "
        "Use only verified information; if unsure, ask a clarifying question or suggest escalation. "
        "Keep it concise (2-4 short paragraphs max) and do not reveal internal notes."
    )

    answer, usage, provider_used = await generate_with_provider(runtime, system, history, hits, last_customer_message)

    return {
        "draft": answer,
        "provider": provider_used,
        "usage": usage,
        "sources": [h.to_ref() for h in hits],
    }
