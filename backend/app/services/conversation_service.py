from datetime import datetime, timezone
from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, distinct, text, select
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status

from app.models.conversation import Conversation, ConversationStatus, ConversationLink
from app.models.message import Message, MessageType, MessageSenderType
from app.models.user import User
from app.models.agent_profile import AgentProfile
from app.models.ai import AIConfig
from app.models.audit_log import AuditLog
from app.models.notification import Notification, NotificationType, NotificationPriority
from app.schemas.conversation import ConversationCreate, ConversationUpdate
from app.services.sla_service import apply_sla_to_conversation


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def generate_chat_id(db: Session) -> str:
    """Generate an atomic, sequential, permanent Chat ID (e.g. OC-2026-000001)."""
    year = datetime.now(timezone.utc).year
    try:
        seq_val = db.execute(text("SELECT nextval('conversation_chat_id_seq')")).scalar()
        if seq_val is not None:
            return f"OC-{year}-{int(seq_val):06d}"
    except Exception:
        db.rollback()
    # Fallback when sequence is not present (e.g. SQLite unit tests)
    try:
        max_id = db.execute(text("SELECT COALESCE(MAX(id), 0) FROM conversations")).scalar() or 0
        return f"OC-{year}-{(int(max_id) + 1):06d}"
    except Exception:
        import uuid
        return f"OC-{year}-{uuid.uuid4().hex[:6].upper()}"


def list_conversations_query(
    db: Session,
    *,
    viewer: User,
    status_filter: Optional[str] = None,
    queue: Optional[str] = None,
    agent_id: Optional[int] = None,
    customer_id: Optional[int] = None,
    q: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Tuple[List[Conversation], int]:
    query = db.query(Conversation)

    if viewer.role == "customer":
        query = query.filter(Conversation.customer_id == viewer.id)
    elif viewer.role == "agent":
        if queue == "inbox":
            query = query.filter(
                or_(
                    and_(
                        Conversation.assigned_agent_id == viewer.id,
                        Conversation.status.in_([
                            ConversationStatus.OPEN,
                            ConversationStatus.ASSIGNED,
                            ConversationStatus.PENDING,
                            ConversationStatus.AI_HANDLING,
                            ConversationStatus.WAITING_ON_CUSTOMER,
                            ConversationStatus.ON_HOLD,
                        ]),
                    ),
                    and_(
                        Conversation.assigned_agent_id.is_(None),
                        Conversation.status.in_([
                            ConversationStatus.OPEN,
                            ConversationStatus.ASSIGNED,
                            ConversationStatus.PENDING,
                            ConversationStatus.AI_HANDLING,
                        ]),
                    ),
                )
            )
        elif queue == "pending":
            query = query.filter(Conversation.status == ConversationStatus.PENDING)
        elif queue == "assigned":
            query = query.filter(
                Conversation.assigned_agent_id == viewer.id,
                Conversation.status.in_([
                    ConversationStatus.OPEN,
                    ConversationStatus.ASSIGNED,
                    ConversationStatus.PENDING,
                    ConversationStatus.AI_HANDLING,
                    ConversationStatus.WAITING_ON_CUSTOMER,
                    ConversationStatus.ON_HOLD,
                ]),
            )
        elif queue == "unassigned":
            query = query.filter(
                Conversation.assigned_agent_id.is_(None),
                Conversation.status.in_([
                    ConversationStatus.OPEN,
                    ConversationStatus.ASSIGNED,
                    ConversationStatus.PENDING,
                    ConversationStatus.AI_HANDLING,
                ]),
            )
        elif queue == "resolved":
            query = query.filter(
                Conversation.assigned_agent_id == viewer.id,
                Conversation.status.in_([ConversationStatus.RESOLVED, ConversationStatus.CLOSED]),
            )
        else:
            query = query.filter(
                or_(
                    Conversation.assigned_agent_id == viewer.id,
                    Conversation.status.in_([ConversationStatus.AI_HANDLING, ConversationStatus.PENDING]),
                )
            )
    else:  # admin / super_admin
        if queue == "inbox":
            query = query.filter(
                Conversation.status.in_([
                    ConversationStatus.OPEN,
                    ConversationStatus.ASSIGNED,
                    ConversationStatus.PENDING,
                    ConversationStatus.AI_HANDLING,
                    ConversationStatus.WAITING_ON_CUSTOMER,
                    ConversationStatus.ON_HOLD,
                ])
            )
        elif queue == "pending":
            query = query.filter(Conversation.status == ConversationStatus.PENDING)
        elif queue == "assigned":
            query = query.filter(Conversation.status.in_([ConversationStatus.OPEN, ConversationStatus.ASSIGNED]))
        elif queue == "unassigned":
            query = query.filter(
                Conversation.assigned_agent_id.is_(None),
                Conversation.status.in_([
                    ConversationStatus.OPEN,
                    ConversationStatus.ASSIGNED,
                    ConversationStatus.PENDING,
                    ConversationStatus.AI_HANDLING,
                ]),
            )
        elif queue == "resolved":
            query = query.filter(Conversation.status.in_([ConversationStatus.RESOLVED, ConversationStatus.CLOSED]))
        if agent_id:
            query = query.filter(Conversation.assigned_agent_id == agent_id)
        if customer_id:
            query = query.filter(Conversation.customer_id == customer_id)

    if status_filter:
        s = status_filter.lower()
        if s == "open":
            query = query.filter(Conversation.status.in_([ConversationStatus.OPEN, ConversationStatus.ASSIGNED]))
        elif s == "resolved":
            query = query.filter(Conversation.status.in_([ConversationStatus.RESOLVED, ConversationStatus.CLOSED]))
        elif s in ("all", "any"):
            pass  # Explicit all includes resolved
        else:
            query = query.filter(Conversation.status == s)
    elif not q and queue not in ("resolved",):
        # Default view: show unresolved/active conversations only (hide resolved & closed by default)
        query = query.filter(
            Conversation.status.in_([
                ConversationStatus.OPEN,
                ConversationStatus.ASSIGNED,
                ConversationStatus.PENDING,
                ConversationStatus.AI_HANDLING,
                ConversationStatus.WAITING_ON_CUSTOMER,
                ConversationStatus.ON_HOLD,
            ])
        )

    if q:
        like = f"%{q.strip()}%"
        # Search merged secondary conversations so searching their Chat ID returns the primary conversation
        merged_parent_stmt = (
            select(Conversation.merged_into_id)
            .filter(
                Conversation.chat_id.ilike(like),
                Conversation.merged_into_id.isnot(None),
            )
        )
        # Use select statement to get distinct conversation IDs first (avoids JSON comparison issues with DISTINCT)
        subq_stmt = (
            select(Conversation.id)
            .join(User, User.id == Conversation.customer_id)
            .outerjoin(Message, Message.conversation_id == Conversation.id)
            .filter(or_(
                Conversation.chat_id.ilike(like),
                Conversation.id.in_(merged_parent_stmt),
                Conversation.subject.ilike(like),
                User.full_name.ilike(like),
                User.email.ilike(like),
                and_(Message.is_internal == False, Message.content.ilike(like)),  # noqa: E712
            ))
            .distinct()
        )
        query = query.filter(Conversation.id.in_(subq_stmt))

    total = query.with_entities(func.count(func.distinct(Conversation.id))).scalar() if q else query.count()
    items = query.order_by(Conversation.updated_at.desc(), Conversation.id.desc()).offset(offset).limit(limit).all()
    return items, int(total or 0)


ALLOWED_TRANSITIONS = {
    ConversationStatus.OPEN: {
        ConversationStatus.PENDING,
        ConversationStatus.RESOLVED,
        ConversationStatus.WAITING_ON_CUSTOMER,
        ConversationStatus.ON_HOLD,
        ConversationStatus.CLOSED,
    },
    ConversationStatus.PENDING: {
        ConversationStatus.OPEN,
        ConversationStatus.ASSIGNED,
        ConversationStatus.ON_HOLD,
        ConversationStatus.WAITING_ON_CUSTOMER,
        ConversationStatus.RESOLVED,
        ConversationStatus.CLOSED,
        ConversationStatus.AI_HANDLING,
    },
    ConversationStatus.WAITING_ON_CUSTOMER: {
        ConversationStatus.OPEN,
        ConversationStatus.ASSIGNED,
        ConversationStatus.PENDING,
        ConversationStatus.RESOLVED,
        ConversationStatus.ON_HOLD,
        ConversationStatus.CLOSED,
    },
    ConversationStatus.ON_HOLD: {
        ConversationStatus.PENDING,
        ConversationStatus.OPEN,
        ConversationStatus.ASSIGNED,
        ConversationStatus.RESOLVED,
    },
    ConversationStatus.RESOLVED: {
        ConversationStatus.PENDING,
        ConversationStatus.OPEN,
        ConversationStatus.ASSIGNED,
        ConversationStatus.CLOSED,
    },
    # Backward compatibility for legacy / internal statuses:
    ConversationStatus.ASSIGNED: {
        ConversationStatus.PENDING,
        ConversationStatus.RESOLVED,
        ConversationStatus.WAITING_ON_CUSTOMER,
        ConversationStatus.ON_HOLD,
        ConversationStatus.OPEN,
        ConversationStatus.CLOSED,
    },
    ConversationStatus.AI_HANDLING: {
        ConversationStatus.OPEN,
        ConversationStatus.ASSIGNED,
        ConversationStatus.PENDING,
        ConversationStatus.RESOLVED,
        ConversationStatus.ON_HOLD,
        ConversationStatus.CLOSED,
    },
    ConversationStatus.CLOSED: {
        ConversationStatus.PENDING,
        ConversationStatus.OPEN,
        ConversationStatus.ASSIGNED,
        ConversationStatus.RESOLVED,
    },
}


def transition_status(
    db: Session,
    conversation: Conversation,
    new_status: str,
    actor: User,
    resolution_details: Optional[str] = None
) -> Conversation:
    current = conversation.status
    if current == new_status:
        if resolution_details is not None and new_status in (ConversationStatus.RESOLVED, ConversationStatus.CLOSED):
            conversation.resolution_details = resolution_details
        return conversation

    allowed = ALLOWED_TRANSITIONS.get(ConversationStatus(current), set())
    if ConversationStatus(new_status) not in allowed and new_status not in {s.value for s in allowed}:
        raise HTTPException(status_code=409, detail=f"Invalid status transition: {current} -> {new_status}")

    # Handle agent capacity release when leaving active assignment or placing on hold
    if conversation.assigned_agent_id and new_status in (
        ConversationStatus.RESOLVED,
        ConversationStatus.CLOSED,
        ConversationStatus.PENDING,
        ConversationStatus.ON_HOLD,
    ):
        release_agent_capacity(db, conversation.assigned_agent_id)
        if new_status in (ConversationStatus.PENDING, ConversationStatus.ON_HOLD):
            conversation.assigned_agent_id = None

    conversation.status = new_status
    conversation.updated_at = _utcnow()
    if new_status == ConversationStatus.RESOLVED:
        conversation.resolved_at = conversation.resolved_at or _utcnow()
        conversation.closed_at = None
        if resolution_details is not None:
            conversation.resolution_details = resolution_details
        record_resolution(db, conversation)
    elif new_status == ConversationStatus.CLOSED:
        conversation.closed_at = _utcnow()
        if not conversation.resolved_at:
            conversation.resolved_at = _utcnow()
        if resolution_details is not None:
            conversation.resolution_details = resolution_details
        record_resolution(db, conversation)
    elif new_status in (ConversationStatus.OPEN, ConversationStatus.ASSIGNED, ConversationStatus.PENDING, ConversationStatus.AI_HANDLING):
        if current in (ConversationStatus.RESOLVED, ConversationStatus.CLOSED):
            conversation.closed_at = None
            conversation.resolved_at = None
            conversation.sla_resolution_breached = False

    record_system_event(db, conversation, f"Status changed from {current} to {new_status} by {actor.full_name}", actor_id=actor.id)
    return conversation


def update_conversation_properties(
    db: Session,
    conversation: Conversation,
    actor: User,
    *,
    subject=None,
    priority=None,
    tags=None
) -> Conversation:
    changed = []
    if subject is not None and subject != conversation.subject:
        conversation.subject = subject
        changed.append("subject")
    if priority is not None and priority != getattr(conversation, "priority", "normal"):
        conversation.priority = priority
        changed.append("priority")
    if tags is not None:
        new_tags = ensure_tags(tags)
        if new_tags != getattr(conversation, "tags", []):
            conversation.tags = new_tags
            changed.append("tags")

    if changed:
        conversation.updated_at = _utcnow()
        record_system_event(db, conversation, f"Updated: {', '.join(changed)} by {actor.full_name}", actor_id=actor.id)

    return conversation


def ensure_tags(tags) -> list[str]:
    if isinstance(tags, str):
        import json
        try:
            parsed = json.loads(tags)
            if isinstance(parsed, list):
                return [str(t) for t in parsed]
        except Exception:
            return [t.strip() for t in tags.split(",") if t.strip()]
    if isinstance(tags, list):
        return [str(t) for t in tags]
    return []


def record_system_event(db: Session, conversation: Conversation, content: str, actor_id: int | None = None) -> Message:
    msg = Message(
        conversation_id=conversation.id,
        sender_id=actor_id,
        sender_type=MessageSenderType.SYSTEM,
        message_type=MessageType.SYSTEM_EVENT,
        content=content,
        is_internal=True,
    )
    db.add(msg)
    return msg


def record_resolution(db: Session, conversation: Conversation) -> Message:
    return record_system_event(db, conversation, f"Conversation resolved", actor_id=conversation.assigned_agent_id)


def release_agent_capacity(db: Session, agent_id: int) -> None:
    profile = db.query(AgentProfile).filter(AgentProfile.user_id == agent_id).first()
    if profile:
        profile.active_conversations = max(0, profile.active_conversations - 1)


def assign_conversation(db: Session, conversation: Conversation, actor: User, agent_id: int, note: Optional[str] = None) -> Conversation:
    agent = db.query(User).filter(User.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if not agent.is_active:
        raise HTTPException(status_code=400, detail="Target agent is inactive")

    # Check availability and capacity of target agent
    profile = db.query(AgentProfile).filter(AgentProfile.user_id == agent.id).first()
    if profile:
        if not profile.is_available:
            raise HTTPException(
                status_code=400,
                detail=f"Agent {agent.full_name} is currently offline and cannot receive new assignments",
            )
        live_active = (
            db.query(Conversation)
            .filter(
                Conversation.assigned_agent_id == agent.id,
                Conversation.status.in_([ConversationStatus.OPEN, ConversationStatus.ASSIGNED, ConversationStatus.AI_HANDLING]),
            )
            .count()
        )
        if live_active >= profile.max_conversations and agent.id != conversation.assigned_agent_id:
            raise HTTPException(status_code=409, detail=f"Agent {agent.full_name} is at maximum capacity ({profile.max_conversations})")

    old_agent_id = conversation.assigned_agent_id
    if old_agent_id and old_agent_id != agent.id:
        release_agent_capacity(db, old_agent_id)

    conversation.assigned_agent_id = agent.id
    conversation.status = ConversationStatus.ASSIGNED
    conversation.updated_at = _utcnow()

    if profile:
        profile.active_conversations += 1

    # Record assignment history
    history_entry = {
        "assigned_at": _utcnow().isoformat(),
        "assigned_by_id": actor.id,
        "assigned_by_name": actor.full_name,
        "from_agent_id": old_agent_id,
        "to_agent_id": agent.id,
        "to_agent_name": agent.full_name,
        "note": note,
    }
    conversation.assignment_history = list(conversation.assignment_history or []) + [history_entry]

    # Send notification to receiving agent if assigned by someone else
    if agent.id != actor.id:
        try:
            notif = Notification(
                user_id=agent.id,
                type=NotificationType.CONVERSATION_ASSIGNED,
                priority=NotificationPriority.NORMAL,
                title="Conversation Assigned",
                message=f"Conversation {conversation.chat_id or f'#{conversation.id}'} was assigned to you by {actor.full_name}" + (f": {note}" if note else ""),
                reference_type="conversation",
                reference_id=conversation.id,
                is_read=False,
            )
            db.add(notif)
        except Exception:
            pass

    if note:
        record_system_event(db, conversation, f"Assigned to {agent.full_name}: {note}", actor_id=actor.id)
    else:
        record_system_event(db, conversation, f"Assigned to {agent.full_name}", actor_id=actor.id)

    return conversation


def create_conversation(db: Session, data: ConversationCreate, customer: User) -> Conversation:
    cid = generate_chat_id(db)
    conversation = Conversation(
        chat_id=cid,
        customer_id=customer.id,
        subject=data.subject,
        priority=data.priority or "normal",
        tags=data.tags or [],
        channel=data.channel or "web",
    )
    db.add(conversation)
    db.flush()

    record_system_event(db, conversation, "Conversation created")
    return conversation


def take_conversation(db: Session, conversation: Conversation, agent: User) -> Conversation:
    if conversation.assigned_agent_id and conversation.assigned_agent_id != agent.id:
        raise HTTPException(status_code=409, detail="Conversation already assigned to another agent")

    if conversation.status not in (ConversationStatus.AI_HANDLING, ConversationStatus.PENDING):
        raise HTTPException(status_code=409, detail="Conversation cannot be taken")

    profile = db.query(AgentProfile).filter(AgentProfile.user_id == agent.id).first()
    if profile and not profile.is_available:
        raise HTTPException(status_code=400, detail="You are currently offline. Please set your status to Online before taking conversations.")
    if profile and profile.active_conversations >= profile.max_conversations:
        raise HTTPException(status_code=409, detail="Agent at capacity")

    return assign_conversation(db, conversation, agent, agent.id)


def add_message(
    db: Session,
    conversation: Conversation,
    sender: User,
    content: str,
    is_internal: bool = False,
    message_type: MessageType = MessageType.TEXT,
    client_message_id: Optional[str] = None,
) -> Message:
    message = Message(
        conversation_id=conversation.id,
        sender_id=sender.id,
        sender_type=MessageSenderType.AGENT if sender.role in ("agent", "admin", "super_admin") else MessageSenderType.CUSTOMER,
        message_type=message_type,
        content=content,
        is_internal=is_internal,
        client_message_id=client_message_id,
    )
    db.add(message)

    conversation.updated_at = _utcnow()
    conversation.last_message_at = _utcnow()

    if not is_internal:
        if sender.role == "customer":
            conversation.customer_last_read_at = _utcnow()
            # If conversation was waiting_on_customer, customer reply makes it eligible for handling again
            if conversation.status == ConversationStatus.WAITING_ON_CUSTOMER:
                new_st = ConversationStatus.OPEN if conversation.assigned_agent_id else ConversationStatus.PENDING
                transition_status(db, conversation, new_st.value, sender)
        else:
            conversation.agent_last_read_at = _utcnow()

    return message


def update_global_note(
    db: Session,
    conversation: Conversation,
    note: str,
    actor: User,
) -> dict:
    """Update the persistent Global Internal Note for this conversation. Never exposed to customers."""
    import re
    from app.models.notification import NotificationType, NotificationPriority
    from app.services.notification_service import create_notification

    conversation.global_note = note
    conversation.global_note_updated_at = _utcnow()
    conversation.global_note_updated_by_id = actor.id

    # Parse @mentions for agents/admins
    mentioned_users = []
    all_agents = db.query(User).filter(User.role.in_(["agent", "admin"]), User.is_active == True).all()  # noqa: E712
    notified_ids = set()
    note_lower = (note or "").lower()

    for agent in all_agents:
        if agent.id == actor.id:
            continue
        name_tag = f"@{agent.full_name.lower()}"
        email_tag = f"@{agent.email.lower()}"
        first_name = agent.full_name.split()[0].lower() if agent.full_name else ""
        first_name_tag = f"@{first_name}" if len(first_name) >= 3 else None

        is_mentioned = (
            name_tag in note_lower or
            email_tag in note_lower or
            (first_name_tag and (first_name_tag + " ") in (note_lower + " "))
        )

        if is_mentioned and agent.id not in notified_ids:
            notified_ids.add(agent.id)
            mentioned_users.append(agent)
            create_notification(
                db=db,
                user_id=agent.id,
                type=NotificationType.MENTION,
                title=f"Mentioned in Conversation #{conversation.id}",
                message=f"{actor.full_name} mentioned you in the internal note for conversation #{conversation.id}",
                reference_type="conversation",
                reference_id=conversation.id,
                priority=NotificationPriority.NORMAL,
            )
            record_system_event(
                db,
                conversation,
                f"{actor.full_name} mentioned {agent.full_name} in the internal note",
                actor_id=actor.id,
            )

    record_system_event(
        db,
        conversation,
        f"Global internal note updated by {actor.full_name}",
        actor_id=actor.id,
    )
    db.commit()
    db.refresh(conversation)

    return {
        "global_note": conversation.global_note,
        "global_note_updated_at": conversation.global_note_updated_at,
        "global_note_updated_by_id": conversation.global_note_updated_by_id,
        "global_note_updated_by_name": actor.full_name,
        "mentioned_agents": [u.full_name for u in mentioned_users],
    }


def reopen_conversation(db: Session, conversation: Conversation, actor: User) -> Conversation:
    if conversation.status not in (ConversationStatus.RESOLVED, ConversationStatus.CLOSED):
        raise HTTPException(status_code=409, detail="Conversation is not resolved or closed")

    return transition_status(db, conversation, ConversationStatus.PENDING.value, actor)


def ensure_can_view(user: User, conversation: Conversation) -> None:
    """Check if user can view this conversation."""
    if user.role == "customer" and conversation.customer_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this conversation")
    elif user.role == "agent":
        # Agents can view if assigned, if in inbox/pending queues, or if merged
        if conversation.assigned_agent_id != user.id and conversation.status not in (
            ConversationStatus.AI_HANDLING,
            ConversationStatus.PENDING,
            ConversationStatus.MERGED,
        ):
            raise HTTPException(status_code=403, detail="Not authorized to view this conversation")


def ensure_can_modify(user: User, conversation: Conversation) -> None:
    """Check if user can modify this conversation (send messages, etc.)."""
    ensure_can_view(user, conversation)
    if user.role == "agent" and conversation.assigned_agent_id != user.id:
        if conversation.status not in (ConversationStatus.AI_HANDLING, ConversationStatus.PENDING):
            raise HTTPException(status_code=403, detail="Not assigned to this conversation")


def get_visible_messages(
    db: Session,
    conversation_id: int,
    user: User,
    limit: int = 500,
    offset: int = 0
) -> List[Message]:
    """Get messages visible to the user (filter internal notes for customers)."""
    include_internal = user.role in ("agent", "admin", "super_admin")
    messages_q = db.query(Message).filter(Message.conversation_id == conversation_id)
    if not include_internal:
        messages_q = messages_q.filter(Message.is_internal == False, Message.is_retracted == False)  # noqa: E712
    return messages_q.order_by(Message.created_at.asc(), Message.id.asc()).offset(offset).limit(limit).all()


def build_conversation_list_item(db: Session, conversation: Conversation, viewer: User):
    """Build a ConversationListItem from a Conversation with related data."""
    # Get last message
    last_msg = (
        db.query(Message)
        .filter(Message.conversation_id == conversation.id, Message.is_internal == False, Message.is_retracted == False)  # noqa: E712
        .order_by(Message.created_at.desc())
        .first()
    )
    
    # Get unread count for customer
    unread = 0
    if viewer.role == "customer":
        unread = db.query(Message).filter(
            Message.conversation_id == conversation.id,
            Message.is_internal == False,  # noqa: E712
            Message.sender_type != MessageSenderType.CUSTOMER,
            Message.created_at > (conversation.customer_last_read_at or datetime.min.replace(tzinfo=timezone.utc))
        ).count()
    elif viewer.role == "agent":
        unread = db.query(Message).filter(
            Message.conversation_id == conversation.id,
            Message.is_internal == False,  # noqa: E712
            Message.sender_type == MessageSenderType.CUSTOMER,
            Message.created_at > (conversation.agent_last_read_at or datetime.min.replace(tzinfo=timezone.utc))
        ).count()

    return {
        "id": conversation.id,
        "chat_id": getattr(conversation, "chat_id", None),
        "customer_id": conversation.customer_id,
        "assigned_agent_id": conversation.assigned_agent_id,
        "subject": conversation.subject,
        "status": conversation.status,
        "channel": conversation.channel,
        "priority": getattr(conversation, "priority", "normal"),
        "tags": getattr(conversation, "tags", []) or [],
        "resolution_details": getattr(conversation, "resolution_details", None),
        "created_at": conversation.created_at,
        "updated_at": conversation.updated_at,
        "resolved_at": getattr(conversation, "resolved_at", None),
        "closed_at": getattr(conversation, "closed_at", None),
        "customer_last_read_at": getattr(conversation, "customer_last_read_at", None),
        "agent_last_read_at": getattr(conversation, "agent_last_read_at", None),
        "customer_name": getattr(conversation.customer, "full_name", "Unknown"),
        "customer_email": getattr(conversation.customer, "email", ""),
        "assigned_agent_name": getattr(conversation.assigned_agent, "full_name", None) if conversation.assigned_agent else None,
        "last_message": last_msg.content if last_msg else None,
        "last_message_at": last_msg.created_at if last_msg else None,
        "unread_count": unread,
        "merged_into_id": getattr(conversation, "merged_into_id", None),
    }


def mark_conversation_read(db: Session, conversation: Conversation, role: str) -> None:
    """Mark conversation as read for the given role."""
    now = _utcnow()
    if role == "customer":
        conversation.customer_last_read_at = now
    elif role == "agent":
        conversation.agent_last_read_at = now


async def _execute_ai_turn_for_conversation(db: Session, conversation_id: int, customer_id: int) -> None:
    try:
        conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        customer = db.query(User).filter(User.id == customer_id).first()
        if not conversation or not customer:
            return
        if conversation.status != ConversationStatus.AI_HANDLING:
            return

        from app.services.ai_service import process_ai_turn
        from app.services.assignment_service import assign_conversation_to_agent

        history_messages = (
            db.query(Message)
            .filter(Message.conversation_id == conversation.id, Message.is_retracted == False)  # noqa: E712
            .order_by(Message.created_at.asc(), Message.id.asc())
            .all()
        )
        result = await process_ai_turn(db, conversation, history_messages, customer)
        if result:
            ai_metadata = {
                "provider": result.provider,
                "model": result.model,
                "latency_ms": result.latency_ms,
                "decision": result.decision,
                "confidence": result.confidence,
                "sources": result.sources or [],
                "knowledge": result.sources or [],
                "escalated": result.should_escalate,
                "escalation_reason": result.escalation_reason,
            }
            if result.answer:
                # Idempotency check: prevent duplicate AI message for this turn
                duplicate_check = (
                    db.query(Message)
                    .filter(
                        Message.conversation_id == conversation.id,
                        Message.sender_type == MessageSenderType.AI,
                        Message.content == result.answer,
                    )
                    .first()
                )
                if not duplicate_check:
                    ai_msg = Message(
                        conversation_id=conversation.id,
                        sender_id=None,
                        sender_type=MessageSenderType.AI,
                        message_type=MessageType.TEXT,
                        content=result.answer,
                        is_internal=False,
                        delivery_status="delivered",
                        ai_metadata=ai_metadata,
                    )
                    db.add(ai_msg)
                    db.commit()

            if result.should_escalate:
                conversation.status = ConversationStatus.PENDING
                record_system_event(
                    db,
                    conversation,
                    "Customer requested human assistance" if result.decision == "handoff_requested" else f"AI escalated to human support: {result.escalation_reason or 'assistance needed'}"
                )
                assign_conversation_to_agent(db, conversation)
                db.commit()
    except Exception:
        import logging
        logging.getLogger(__name__).exception("AI turn execution error")
        db.rollback()


async def _run_ai_turn_background(conversation_id: int, customer_id: int) -> None:
    from app.db.session import SessionLocal
    bg_db = SessionLocal()
    try:
        await _execute_ai_turn_for_conversation(bg_db, conversation_id, customer_id)
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception("Background AI turn failed: %s", e)
    finally:
        bg_db.close()


async def process_customer_message(
    db: Session,
    conversation: Conversation,
    customer: User,
    content: str,
    client_message_id: Optional[str] = None,
    sync_ai: bool = False,
) -> Message:
    """Process a customer message: save it, trigger AI response if applicable.
    
    If client_message_id is provided and a message with that ID already exists
    for this conversation, return the existing message (idempotency).
    """
    # Check for existing message with same client_message_id (idempotency)
    if client_message_id:
        existing_msg = (
            db.query(Message)
            .filter(
                Message.conversation_id == conversation.id,
                Message.client_message_id == client_message_id,
            )
            .first()
        )
        if existing_msg:
            return existing_msg

    # Save customer message immediately
    customer_msg = add_message(
        db, conversation, customer, content,
        is_internal=False,
        message_type=MessageType.TEXT,
        client_message_id=client_message_id
    )
    customer_msg.delivery_status = "delivered"

    # Notify assigned agent of customer reply if conversation is assigned
    if conversation.assigned_agent_id and conversation.status in (ConversationStatus.ASSIGNED, ConversationStatus.OPEN):
        try:
            from app.models.notification import NotificationType, NotificationPriority
            from app.services.notification_service import create_notification
            create_notification(
                db=db,
                user_id=conversation.assigned_agent_id,
                type=NotificationType.NEW_MESSAGE,
                title=f"New message in {conversation.chat_id or f'#{conversation.id}'}",
                message=f"{customer.full_name}: {content[:120]}",
                reference_type="conversation",
                reference_id=conversation.id,
                priority=NotificationPriority.HIGH,
            )
        except Exception:
            pass

    # Commit customer message immediately so HTTP response returns in <50ms with delivery_status: delivered
    db.commit()
    db.refresh(customer_msg)

    # If conversation is in AI_HANDLING status, evaluate bot flow step or Gemini AI response
    if conversation.status == ConversationStatus.AI_HANDLING:
        from app.services.bot_flow_service import match_and_execute_bot_flow_step
        bot_flow_msg = match_and_execute_bot_flow_step(db, conversation, customer, content)
        if not bot_flow_msg:
            if sync_ai:
                await _execute_ai_turn_for_conversation(db, conversation.id, customer.id)
                db.refresh(conversation)
            else:
                import asyncio
                asyncio.create_task(_run_ai_turn_background(conversation.id, customer.id))

    return customer_msg


def append_assignment_history(db: Session, conversation: Conversation, agent_id: int, action: str) -> None:
    """Append an entry to the conversation's assignment history."""
    history = conversation.assignment_history or []
    history.append({
        "agent_id": agent_id,
        "action": action,
        "timestamp": _utcnow().isoformat(),
    })
    conversation.assignment_history = history


def resolve_conversation(db: Session, conversation: Conversation, actor: User, resolution_details: Optional[str] = None) -> Conversation:
    """Resolve a conversation."""
    return transition_status(db, conversation, ConversationStatus.RESOLVED.value, actor, resolution_details)


def close_conversation(db: Session, conversation: Conversation, actor: User, resolution_details: Optional[str] = None) -> Conversation:
    """Close a conversation."""
    return transition_status(db, conversation, ConversationStatus.CLOSED.value, actor, resolution_details)


def get_last_public_message(db: Session, conversation_id: int):
    """Get the last non-internal message for a conversation."""
    return (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id, Message.is_internal == False)  # noqa: E712
        .order_by(Message.created_at.desc())
        .first()
    )


def compute_unread_count(db: Session, conversation: Conversation, role: str) -> int:
    """Compute unread message count for a role."""
    if role == "customer":
        last_read = conversation.customer_last_read_at or datetime.min.replace(tzinfo=timezone.utc)
        return db.query(Message).filter(
            Message.conversation_id == conversation.id,
            Message.is_internal == False,  # noqa: E712
            Message.sender_type != MessageSenderType.CUSTOMER,
            Message.created_at > last_read
        ).count()
    elif role == "agent":
        last_read = conversation.agent_last_read_at or datetime.min.replace(tzinfo=timezone.utc)
        return db.query(Message).filter(
            Message.conversation_id == conversation.id,
            Message.is_internal == False,  # noqa: E712
            Message.sender_type == MessageSenderType.CUSTOMER,
            Message.created_at > last_read
        ).count()
    return 0


def get_linked_conversations_for_conversation(db: Session, conversation_id: int) -> List[dict]:
    """Retrieve all conversations linked to the given conversation."""
    links = (
        db.query(ConversationLink)
        .filter(
            or_(
                ConversationLink.conversation_id_1 == conversation_id,
                ConversationLink.conversation_id_2 == conversation_id,
            )
        )
        .order_by(ConversationLink.created_at.desc())
        .all()
    )
    result = []
    for link in links:
        other_id = link.conversation_id_2 if link.conversation_id_1 == conversation_id else link.conversation_id_1
        other_conv = db.query(Conversation).filter(Conversation.id == other_id).first()
        if not other_conv:
            continue
        result.append({
            "id": link.id,
            "linked_conversation_id": other_conv.id,
            "chat_id": getattr(other_conv, "chat_id", None),
            "subject": other_conv.subject,
            "status": other_conv.status,
            "customer_id": other_conv.customer_id,
            "customer_name": other_conv.customer.full_name if other_conv.customer else "Unknown Customer",
            "created_at": link.created_at,
            "created_by_id": link.created_by_id,
            "created_by_name": link.created_by.full_name if link.created_by else None,
        })
    return result


def link_conversations(db: Session, conv_id: int, target_id: int, actor: User) -> dict:
    """Link two related conversations together without combining messages."""
    if conv_id == target_id:
        raise HTTPException(status_code=400, detail="Cannot link a conversation to itself")

    c1_id, c2_id = min(conv_id, target_id), max(conv_id, target_id)
    c1 = db.query(Conversation).filter(Conversation.id == c1_id).first()
    c2 = db.query(Conversation).filter(Conversation.id == c2_id).first()
    if not c1 or not c2:
        raise HTTPException(status_code=404, detail="One or both conversations not found")

    existing = db.query(ConversationLink).filter(
        ConversationLink.conversation_id_1 == c1_id,
        ConversationLink.conversation_id_2 == c2_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Conversations are already linked")

    link = ConversationLink(
        conversation_id_1=c1_id,
        conversation_id_2=c2_id,
        created_by_id=actor.id,
    )
    db.add(link)

    # System events for audit
    record_system_event(db, c1, f"Linked to conversation #{c2_id} by {actor.full_name}", actor_id=actor.id)
    record_system_event(db, c2, f"Linked to conversation #{c1_id} by {actor.full_name}", actor_id=actor.id)

    db.commit()
    db.refresh(link)
    return {
        "id": link.id,
        "conversation_id_1": c1_id,
        "conversation_id_2": c2_id,
        "created_at": link.created_at,
        "created_by_id": actor.id,
    }


def unlink_conversations(db: Session, conv_id: int, target_id: int, actor: User) -> dict:
    """Unlink two previously linked conversations."""
    c1_id, c2_id = min(conv_id, target_id), max(conv_id, target_id)
    link = db.query(ConversationLink).filter(
        ConversationLink.conversation_id_1 == c1_id,
        ConversationLink.conversation_id_2 == c2_id,
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Conversation link not found")

    c1 = db.query(Conversation).filter(Conversation.id == c1_id).first()
    c2 = db.query(Conversation).filter(Conversation.id == c2_id).first()

    db.delete(link)

    if c1:
        record_system_event(db, c1, f"Unlinked from conversation #{c2_id} by {actor.full_name}", actor_id=actor.id)
    if c2:
        record_system_event(db, c2, f"Unlinked from conversation #{c1_id} by {actor.full_name}", actor_id=actor.id)

    db.commit()
    return {"message": f"Successfully unlinked conversation #{conv_id} and #{target_id}"}


def merge_conversations(
    db: Session,
    source_id: int,
    target_id: int,
    actor: User,
    confirm_cross_customer: bool = False,
) -> Conversation:
    """Merge duplicate conversations into a target conversation while preserving message provenance."""
    if source_id == target_id:
        raise HTTPException(status_code=400, detail="Cannot merge a conversation into itself")

    source = db.query(Conversation).filter(Conversation.id == source_id).first()
    target = db.query(Conversation).filter(Conversation.id == target_id).first()

    if not source:
        raise HTTPException(status_code=404, detail="Source conversation not found")
    if not target:
        raise HTTPException(status_code=404, detail="Target conversation not found")

    if source.status == ConversationStatus.MERGED or source.merged_into_id:
        raise HTTPException(status_code=400, detail=f"Source conversation #{source_id} is already merged into #{source.merged_into_id}")

    if target.status == ConversationStatus.MERGED:
        raise HTTPException(status_code=400, detail=f"Target conversation #{target_id} is already merged and cannot receive messages")

    # Circular merge detection: ensure target does not eventually point back to source
    curr = target
    visited = {source_id}
    while curr and curr.merged_into_id:
        if curr.merged_into_id in visited:
            raise HTTPException(status_code=400, detail="Circular merge detected")
        visited.add(curr.merged_into_id)
        curr = db.query(Conversation).filter(Conversation.id == curr.merged_into_id).first()

    # Cross-customer validation
    is_cross_customer = source.customer_id != target.customer_id
    if is_cross_customer:
        if actor.role not in ("admin", "super_admin"):
            raise HTTPException(
                status_code=403,
                detail="Merging conversations belonging to different customers requires administrator privileges",
            )
        if not confirm_cross_customer:
            raise HTTPException(
                status_code=400,
                detail="Source and target conversations belong to different customers. Explicit confirmation is required to proceed.",
            )

    # 1. Repoint all messages from source to target, recording provenance
    source_messages = db.query(Message).filter(Message.conversation_id == source_id).all()
    for msg in source_messages:
        if not msg.original_conversation_id:
            msg.original_conversation_id = source_id
        msg.conversation_id = target_id

    # 2. Repoint attachments
    from app.models.attachment import Attachment
    attachments = db.query(Attachment).filter(Attachment.conversation_id == source_id).all()
    for att in attachments:
        att.conversation_id = target_id

    # 3. Repoint tasks
    from app.models.conversation_task import ConversationTask
    tasks = db.query(ConversationTask).filter(ConversationTask.conversation_id == source_id).all()
    for task in tasks:
        task.conversation_id = target_id

    # 3b. Preserve global internal note from merged conversation
    if source.global_note:
        source_note_tag = f"\n\n--- [Internal Note Merged from {source.chat_id or f'#{source_id}'}] ---\n{source.global_note}"
        target.global_note = (target.global_note or "") + source_note_tag
        target.global_note_updated_at = _utcnow()
        target.global_note_updated_by_id = actor.id

    # 4. Update source conversation status
    source.status = ConversationStatus.MERGED
    source.merged_into_id = target_id
    source.updated_at = _utcnow()

    # 5. Update target conversation
    target.updated_at = _utcnow()
    target.last_message_at = _utcnow()

    # 6. Audit & system events
    source_cust_name = source.customer.full_name if source.customer else f"Customer #{source.customer_id}"
    target_cust_name = target.customer.full_name if target.customer else f"Customer #{target.customer_id}"

    record_system_event(
        db,
        target,
        f"Conversation #{source_id} ({source_cust_name}) merged into this conversation by {actor.full_name}",
        actor_id=actor.id,
    )
    record_system_event(
        db,
        source,
        f"This conversation was merged into #{target_id} ({target_cust_name}) by {actor.full_name}",
        actor_id=actor.id,
    )

    import json
    audit_entry = AuditLog(
        user_id=actor.id,
        action="conversation.merge",
        resource_type="conversation",
        resource_id=target_id,
        details=json.dumps({
            "source_id": source_id,
            "target_id": target_id,
            "source_customer_id": source.customer_id,
            "target_customer_id": target.customer_id,
            "cross_customer": is_cross_customer,
            "messages_moved": len(source_messages),
        }),
    )
    db.add(audit_entry)

    db.commit()
    db.refresh(target)
    return target


def delete_conversation(db: Session, conversation: Conversation, actor: User) -> dict:
    """Delete a conversation and cascade all related data. Restricted to admin and super_admin."""
    if actor.role not in ("admin", "super_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators and super administrators can delete conversations.",
        )

    conv_id = conversation.id
    chat_id = conversation.chat_id or f"#{conv_id}"

    # Release agent capacity if assigned
    if conversation.assigned_agent_id:
        release_agent_capacity(db, conversation.assigned_agent_id)

    # Clear merged_into_id on conversations that pointed to this one
    db.query(Conversation).filter(Conversation.merged_into_id == conv_id).update(
        {"merged_into_id": None}, synchronize_session=False
    )

    # Delete conversation tasks
    from app.models.conversation_task import ConversationTask
    db.query(ConversationTask).filter(ConversationTask.conversation_id == conv_id).delete(synchronize_session=False)

    # Delete attachments
    from app.models.attachment import Attachment
    db.query(Attachment).filter(Attachment.conversation_id == conv_id).delete(synchronize_session=False)

    # Delete messages
    db.query(Message).filter(Message.conversation_id == conv_id).delete(synchronize_session=False)

    # Delete links
    db.query(ConversationLink).filter(
        or_(
            ConversationLink.conversation_id_1 == conv_id,
            ConversationLink.conversation_id_2 == conv_id,
        )
    ).delete(synchronize_session=False)

    # Create audit log record before deleting conversation
    import json
    audit_entry = AuditLog(
        user_id=actor.id,
        action="conversation.delete",
        resource_type="conversation",
        resource_id=conv_id,
        details=json.dumps({
            "conversation_id": conv_id,
            "chat_id": chat_id,
            "customer_id": conversation.customer_id,
            "subject": conversation.subject,
            "deleted_by": actor.full_name,
            "deleted_by_id": actor.id,
            "deleted_at": _utcnow().isoformat(),
        }),
    )
    db.add(audit_entry)

    db.delete(conversation)
    db.commit()

    return {"message": f"Conversation {chat_id} successfully deleted", "deleted_id": conv_id, "chat_id": chat_id}

