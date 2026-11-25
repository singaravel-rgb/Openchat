from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_roles
from app.core.enums import ConversationStatus, MessageSenderType, MessageType
from app.db.session import get_db
from app.models.conversation import Conversation
from app.models.conversation_task import ConversationTask
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
    GlobalNoteUpdate,
    ConversationLinkCreate,
    ConversationLinkItem,
    ConversationMergeRequest,
)
from app.schemas.conversation_task import (
    ConversationTaskCreate,
    ConversationTaskResponse,
    ConversationTaskUpdate,
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
    mark_conversation_read_for_user,
    take_conversation as svc_take,
    resolve_conversation as svc_resolve,
    reopen_conversation as svc_reopen,
    close_conversation as svc_close,
    update_conversation_properties,
    assign_conversation as svc_assign,
    transition_status,
    update_global_note,
    get_linked_conversations_for_conversation,
    link_conversations,
    unlink_conversations,
    merge_conversations,
    release_agent_capacity,
    record_system_event,
    _utcnow,
)
from app.services.ai_service import get_or_create_ai_config, get_runtime_ai_config, retrieve_knowledge_hits, generate_with_provider, format_knowledge_context

router = APIRouter(prefix="/agent", tags=["Agent Workspace"])


def require_agent(current_user: User = Depends(require_roles("agent", "admin", "super_admin"))) -> User:
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
    handling: Optional[str] = Query(None),
    filter_type: Optional[str] = Query(None, alias="filter"),
    priority: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    sort_by: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    items, _ = list_conversations_query(
        db,
        viewer=current_user,
        status_filter=status_filter,
        queue=queue,
        handling=handling,
        filter_type=filter_type,
        priority=priority,
        tag=tag,
        sort_by=sort_by,
        q=q,
        limit=limit,
        offset=offset,
    )
    return [build_conversation_list_item(db, c, viewer=current_user) for c in items]


def _conversation_detail(
    db: Session,
    conversation: Conversation,
    limit: int = 500,
    offset: int = 0,
    viewer: User | None = None,
) -> ConversationDetail:
    """Build the full conversation detail payload (messages + metadata)."""
    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.asc(), Message.id.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    item = build_conversation_list_item(db, conversation, viewer=viewer) if viewer else {}

    return ConversationDetail(
        id=conversation.id,
        chat_id=conversation.chat_id,
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
        global_note=conversation.global_note,
        global_note_updated_at=conversation.global_note_updated_at,
        global_note_updated_by_id=conversation.global_note_updated_by_id,
        global_note_updated_by_name=conversation.global_note_updated_by.full_name if conversation.global_note_updated_by else None,
        messages=[MessageResponse.model_validate(m) for m in messages],
        customer_name=item.get("customer_name"),
        customer_email=item.get("customer_email"),
        assigned_agent_name=item.get("assigned_agent_name"),
        last_message=item.get("last_message"),
        last_message_at=item.get("last_message_at"),
        unread_count=item.get("unread_count", 0),
        merged_into_id=getattr(conversation, "merged_into_id", None),
        version=getattr(conversation, "version", 1) or 1,
        linked_conversations=[
            ConversationLinkItem.model_validate(l)
            for l in get_linked_conversations_for_conversation(db, conversation.id)
        ],
    )


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

    mark_conversation_read(db, conversation, "agent")
    db.commit()
    db.refresh(conversation)

    return _conversation_detail(db, conversation, limit, offset, viewer=current_user)


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

    # Concurrency & ownership checks
    from app.services.conversation_service import check_and_bump_version
    check_and_bump_version(conversation, data.expected_version)

    if not data.is_internal and current_user.role == "agent":
        if conversation.assigned_agent_id and conversation.assigned_agent_id != current_user.id:
            owner_name = conversation.assigned_agent.full_name if conversation.assigned_agent else "another agent"
            raise HTTPException(
                status_code=409,
                detail=f"This conversation is currently owned by {owner_name}. Refresh or reassign before replying.",
            )

    # agents replying in queue take it (or must be assigned)
    if conversation.status in (ConversationStatus.AI_HANDLING, ConversationStatus.PENDING, ConversationStatus.OPEN) and not conversation.assigned_agent_id:
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
    from app.services.ai_service import enforce_action_claim_safety
    msg_content = enforce_action_claim_safety(data.content) if not data.is_internal else data.content

    message = Message(
        conversation_id=conversation.id,
        sender_id=current_user.id,
        sender_type=MessageSenderType.AGENT,
        message_type=MessageType.INTERNAL_NOTE if data.is_internal else MessageType.TEXT,
        content=msg_content,
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
    else:
        # Private note notification: alert assigned agent if different from note author
        if conversation.assigned_agent_id and conversation.assigned_agent_id != current_user.id:
            chat_ref = conversation.chat_id or f"#{conversation.id}"
            create_notification(
                db,
                user_id=conversation.assigned_agent_id,
                type=NotificationType.NEW_MESSAGE,
                title=f"New private note in Chat {chat_ref}",
                message=f"{current_user.full_name}: {data.content[:120]}",
                reference_type="conversation",
                reference_id=conversation.id,
                priority=NotificationPriority.NORMAL,
            )

    db.commit()
    db.refresh(message)

    # Mark as read for this agent
    try:
        mark_conversation_read_for_user(db, conversation.id, current_user, last_message_id=message.id)
    except Exception:
        pass

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

    if current_user.role == "agent":
        if data.agent_id is None:
            # Unassign back to queue
            if conversation.assigned_agent_id != current_user.id:
                raise HTTPException(status_code=403, detail="You can only unassign conversations assigned to you")
            if conversation.assigned_agent_id:
                release_agent_capacity(db, conversation.assigned_agent_id)
            conversation.assigned_agent_id = None
            conversation.status = ConversationStatus.OPEN
            conversation.updated_at = _utcnow()
            record_system_event(db, conversation, f"Unassigned by {current_user.full_name}", actor_id=current_user.id)
            db.commit()
            return {"message": "Conversation unassigned"}
        elif data.agent_id == current_user.id:
            svc_take(db, conversation, current_user)
        else:
            # Agent-to-Agent Reassignment:
            # Agents can transfer assigned conversations (or unassigned/pending) to another active eligible agent
            if conversation.assigned_agent_id is not None and conversation.assigned_agent_id != current_user.id:
                raise HTTPException(status_code=403, detail="You can only reassign conversations assigned to you")
            svc_assign(db, conversation, current_user, data.agent_id, note=data.note)
    else:
        # Admin / Super Admin
        if data.agent_id is None:
            if conversation.assigned_agent_id:
                release_agent_capacity(db, conversation.assigned_agent_id)
            conversation.assigned_agent_id = None
            conversation.status = ConversationStatus.OPEN
            conversation.updated_at = _utcnow()
            record_system_event(db, conversation, f"Unassigned by {current_user.full_name}", actor_id=current_user.id)
        else:
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


@router.patch("/conversations/{conversation_id}/global-note")
def update_global_note_agent(
    conversation_id: int,
    data: GlobalNoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    ensure_can_modify(current_user, conversation)
    res = update_global_note(db, conversation, data.text, current_user)
    return res


@router.get("/conversations/{conversation_id}/links", response_model=list[ConversationLinkItem])
def get_conversation_links(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    ensure_can_view(current_user, conversation)
    links = get_linked_conversations_for_conversation(db, conversation_id)
    return [ConversationLinkItem.model_validate(l) for l in links]


@router.post("/conversations/{conversation_id}/link")
def link_conversation_endpoint(
    conversation_id: int,
    data: ConversationLinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    ensure_can_modify(current_user, conversation)
    target_id = data.target_conversation_id
    if not target_id and data.target_chat_id:
        target_conv = db.query(Conversation).filter(func.lower(Conversation.chat_id) == data.target_chat_id.strip().lower()).first()
        if not target_conv:
            raise HTTPException(status_code=404, detail=f"Target conversation with Chat ID '{data.target_chat_id}' not found")
        target_id = target_conv.id
    if not target_id:
        raise HTTPException(status_code=400, detail="Target conversation ID or Chat ID is required")
    return link_conversations(db, conversation_id, target_id, current_user)


@router.delete("/conversations/{conversation_id}/link/{target_id}")
def unlink_conversation_endpoint(
    conversation_id: int,
    target_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    ensure_can_modify(current_user, conversation)
    return unlink_conversations(db, conversation_id, target_id, current_user)


@router.post("/conversations/{conversation_id}/merge", response_model=ConversationDetail)
def merge_conversation_endpoint(
    conversation_id: int,
    data: ConversationMergeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Source conversation not found")
    if conversation.status == ConversationStatus.MERGED or conversation.merged_into_id:
        raise HTTPException(status_code=400, detail=f"Source conversation #{conversation_id} is already merged into #{conversation.merged_into_id}")
    ensure_can_modify(current_user, conversation)

    target_id = data.target_conversation_id
    if not target_id and data.target_chat_id:
        target_conv = db.query(Conversation).filter(func.lower(Conversation.chat_id) == data.target_chat_id.strip().lower()).first()
        if not target_conv:
            raise HTTPException(status_code=404, detail=f"Target conversation with Chat ID '{data.target_chat_id}' not found")
        target_id = target_conv.id
    if not target_id:
        raise HTTPException(status_code=400, detail="Target conversation ID or Chat ID is required")

    target = merge_conversations(
        db=db,
        source_id=conversation_id,
        target_id=target_id,
        actor=current_user,
        confirm_cross_customer=data.confirm_cross_customer,
    )
    return _conversation_detail(db, target, limit=500, offset=0, viewer=current_user)


@router.post("/conversations/{conversation_id}/status")
def update_conversation_status_agent(
    conversation_id: int,
    data: StatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    ensure_can_modify(current_user, conversation)
    if not data.status:
        raise HTTPException(status_code=400, detail="status is required")

    target_status = data.status.lower()
    if target_status == "open":
        target_status = ConversationStatus.OPEN
    elif target_status == "resolved":
        target_status = ConversationStatus.RESOLVED
    elif target_status == "pending":
        target_status = ConversationStatus.PENDING
    elif target_status == "waiting_on_customer":
        target_status = ConversationStatus.WAITING_ON_CUSTOMER
    elif target_status == "on_hold":
        if current_user.role not in ("admin", "super_admin") and conversation.assigned_agent_id is not None:
            raise HTTPException(status_code=403, detail="Only administrators can place assigned conversations On Hold")
        target_status = ConversationStatus.ON_HOLD

    if target_status == ConversationStatus.RESOLVED:
        svc_resolve(db, conversation, current_user, resolution_details=data.resolution_details)
    elif target_status == ConversationStatus.CLOSED:
        svc_close(db, conversation, current_user, resolution_details=data.resolution_details)
    elif target_status in (
        ConversationStatus.PENDING,
        ConversationStatus.OPEN,
        ConversationStatus.ASSIGNED,
        ConversationStatus.WAITING_ON_CUSTOMER,
        ConversationStatus.ON_HOLD,
    ):
        if conversation.status in (ConversationStatus.RESOLVED, ConversationStatus.CLOSED):
            svc_reopen(db, conversation, current_user)
            if target_status != conversation.status:
                transition_status(db, conversation, target_status, current_user)
        else:
            transition_status(db, conversation, target_status, current_user)
    else:
        raise HTTPException(status_code=400, detail="Unsupported status")
    db.commit()
    return {"message": "Conversation status updated"}


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
    is_available: Optional[bool] = Query(None),
    availability_status: Optional[str] = Query(None),
    pause_auto_assignment: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    if current_user.role != "agent":
        raise HTTPException(status_code=403, detail="Only agents can set availability")
    profile = set_agent_availability(
        db,
        current_user.id,
        is_available=is_available,
        availability_status=availability_status,
        pause_auto_assignment=pause_auto_assignment,
        by_admin=False,
    )
    eff = "offline" if (profile and profile.admin_forced_offline) else (profile.availability_status if profile else "offline")
    if eff == "available" and profile and profile.pause_auto_assignment:
        eff = "busy"
    return {
        "message": f"Availability updated to {eff}",
        "availability_status": profile.availability_status if profile else "offline",
        "effective_status": eff,
        "admin_forced_offline": profile.admin_forced_offline if profile else False,
        "pause_auto_assignment": profile.pause_auto_assignment if profile else False,
        "is_available": profile.is_available if profile else False,
    }


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

    # Build context from recent conversation history.
    # Message.sender_type is stored as a plain string column, so compare values
    # (never attribute access like ``m.sender_type.name``).
    conversation_context: list[dict[str, str]] = []
    last_customer_message = ""
    for m in messages:
        sender = str(m.sender_type)
        if sender == MessageSenderType.CUSTOMER.value:
            conversation_context.append({"role": "user", "content": "Customer: " + (m.content or "")})
        elif sender == MessageSenderType.AGENT.value:
            conversation_context.append({"role": "assistant", "content": "Agent: " + (m.content or "")})
        elif sender == MessageSenderType.AI.value and not m.is_internal:
            conversation_context.append({"role": "assistant", "content": f"AI: {m.content or ''}"})
        if sender == MessageSenderType.CUSTOMER.value and not m.is_internal:
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


class AgentCustomerUpdate(BaseModel):
    """Contact edit for the customer linked to a conversation."""

    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    # Kept as a plain string: guest customers use the internal reserved
    # "widget.openchat.local" domain, which EmailStr rejects.
    email: str | None = Field(default=None, max_length=255)


@router.patch("/conversations/{conversation_id}/customer", response_model=ConversationDetail)
def update_conversation_customer(
    conversation_id: int,
    data: AgentCustomerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    """Edit the contact details (name/email) of the customer on a conversation."""
    conversation = _get_conversation_or_404(db, conversation_id)
    ensure_can_modify(current_user, conversation)

    if not conversation.customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    if data.full_name is not None:
        conversation.customer.full_name = data.full_name
    if data.email is not None:
        candidate = data.email.strip()
        if candidate and "@" not in candidate:
            raise HTTPException(status_code=422, detail="A valid email address is required")
        if candidate:
            existing = (
                db.query(User)
                .filter(User.email == candidate, User.id != conversation.customer_id)
                .first()
            )
            if existing:
                raise HTTPException(status_code=409, detail="Email already in use")
            conversation.customer.email = candidate

    db.commit()
    db.refresh(conversation)
    return _conversation_detail(db, conversation, viewer=current_user)


def _get_conversation_or_404(db: Session, conversation_id: int) -> Conversation:
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@router.get("/conversations/{conversation_id}/tasks", response_model=list[ConversationTaskResponse])
def list_conversation_tasks(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    """List persisted To-do tasks for a conversation."""
    conversation = _get_conversation_or_404(db, conversation_id)
    ensure_can_view(current_user, conversation)
    tasks = (
        db.query(ConversationTask)
        .filter(ConversationTask.conversation_id == conversation_id)
        .order_by(ConversationTask.status.asc(), ConversationTask.created_at.desc())
        .all()
    )
    return [ConversationTaskResponse.model_validate(t) for t in tasks]


@router.post(
    "/conversations/{conversation_id}/tasks",
    response_model=ConversationTaskResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_conversation_task(
    conversation_id: int,
    data: ConversationTaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    """Create a To-do task on a conversation."""
    conversation = _get_conversation_or_404(db, conversation_id)
    ensure_can_modify(current_user, conversation)

    task = ConversationTask(
        conversation_id=conversation.id,
        title=data.title,
        description=data.description,
        due_at=data.due_at,
        status="open",
        created_by_id=current_user.id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return ConversationTaskResponse.model_validate(task)


@router.patch("/conversations/{conversation_id}/tasks/{task_id}", response_model=ConversationTaskResponse)
def update_conversation_task(
    conversation_id: int,
    task_id: int,
    data: ConversationTaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    """Update a To-do task (edit, complete, reopen, reschedule)."""
    conversation = _get_conversation_or_404(db, conversation_id)
    ensure_can_modify(current_user, conversation)

    task = (
        db.query(ConversationTask)
        .filter(
            ConversationTask.id == task_id,
            ConversationTask.conversation_id == conversation_id,
        )
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    payload = data.model_dump(exclude_unset=True)
    if "title" in payload and payload["title"] is not None:
        task.title = payload["title"]
    if "description" in payload:
        task.description = payload["description"]
    if "due_at" in payload:
        task.due_at = payload["due_at"]
    if "status" in payload and payload["status"] is not None:
        new_status = payload["status"]
        if new_status == "done":
            task.status = "done"
            task.completed_at = datetime.now(timezone.utc)
            task.completed_by_id = current_user.id
        else:
            task.status = "open"
            task.completed_at = None
            task.completed_by_id = None

    db.commit()
    db.refresh(task)
    return ConversationTaskResponse.model_validate(task)


@router.delete("/conversations/{conversation_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation_task(
    conversation_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    """Delete a To-do task."""
    conversation = _get_conversation_or_404(db, conversation_id)
    ensure_can_modify(current_user, conversation)

    task = (
        db.query(ConversationTask)
        .filter(
            ConversationTask.id == task_id,
            ConversationTask.conversation_id == conversation_id,
        )
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    db.delete(task)
    db.commit()
    return None
