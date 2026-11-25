from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.enums import ConversationStatus, MessageSenderType, MessageType
from app.models.agent_profile import AgentProfile
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.notification import NotificationPriority, NotificationType
from app.models.user import User
from app.services.notification_service import create_notification


def get_available_agents(db: Session) -> list[User]:
    """Get all available agents with capacity for more conversations, sorted by lowest active chats."""
    agents = (
        db.query(User)
        .join(AgentProfile, User.id == AgentProfile.user_id)
        .filter(
            User.role == "agent",
            User.is_active == True,  # noqa: E712
            AgentProfile.is_available == True,  # noqa: E712
            AgentProfile.availability_status == "available",
            AgentProfile.admin_forced_offline == False,  # noqa: E712
            AgentProfile.pause_auto_assignment == False,  # noqa: E712
        )
        .all()
    )
    available: list[tuple[int, User]] = []
    for agent in agents:
        profile = agent.agent_profile
        if not profile:
            continue
        real_active = (
            db.query(Conversation)
            .filter(
                Conversation.assigned_agent_id == agent.id,
                Conversation.status.in_([ConversationStatus.ASSIGNED, ConversationStatus.OPEN]),
            )
            .count()
        )
        profile.active_conversations = real_active
        if real_active < profile.max_conversations:
            available.append((real_active, agent))
    db.flush()
    available.sort(key=lambda x: (x[0], x[1].id))
    return [a[1] for a in available]


def notify_unassigned_pending(db: Session, conversation: Conversation) -> None:
    """Notify admins when a conversation cannot be assigned because all agents are at capacity or offline."""
    chat_id_label = conversation.chat_id or f"#{conversation.id}"
    existing = (
        db.query(Notification)
        .filter(
            Notification.reference_id == conversation.id,
            Notification.reference_type == "conversation",
            Notification.type == NotificationType.SYSTEM,
            Notification.title.like("%Unassigned Conversation%"),
        )
        .first()
    )
    if existing:
        return

    admins = db.query(User).filter(User.role.in_(["admin", "super_admin"]), User.is_active == True).all()
    for admin in admins:
        create_notification(
            db,
            user_id=admin.id,
            type=NotificationType.SYSTEM,
            title=f"Unassigned Conversation: {chat_id_label}",
            message=f"Conversation {chat_id_label} is unassigned. All agents are currently at capacity or offline.",
            reference_type="conversation",
            reference_id=conversation.id,
            priority=NotificationPriority.HIGH,
        )


def assign_conversation_to_agent(db: Session, conversation: Conversation) -> bool:
    """
    Assign conversation to the available agent with the lowest active conversation count.
    Returns True if assigned, False if no agent available (conversation goes to pending).
    Caller controls transaction boundaries where possible.
    """
    # Idempotency guard: prevent duplicate assignments if already actively assigned
    if conversation.assigned_agent_id is not None and conversation.status == ConversationStatus.ASSIGNED:
        return True

    available_agents = get_available_agents(db)

    if not available_agents:
        conversation.status = ConversationStatus.OPEN
        conversation.assigned_agent_id = None
        notify_unassigned_pending(db, conversation)
        return False

    agent = available_agents[0]

    conversation.assigned_agent_id = agent.id
    conversation.status = ConversationStatus.ASSIGNED

    agent_profile = agent.agent_profile
    if agent_profile:
        agent_profile.active_conversations = (agent_profile.active_conversations or 0) + 1

    history = list(getattr(conversation, "assignment_history", None) or [])
    history.append({
        "type": "auto_assigned",
        "to_agent_id": agent.id,
        "to_agent_name": agent.full_name,
        "assigned_at": datetime.utcnow().isoformat(),
    })
    conversation.assignment_history = history

    system_message = Message(
        conversation_id=conversation.id,
        sender_id=None,
        sender_type=MessageSenderType.SYSTEM,
        message_type=MessageType.SYSTEM_EVENT,
        content=f"Conversation assigned to {agent.full_name}",
        is_internal=True,
        delivery_status="delivered",
    )
    db.add(system_message)

    create_notification(
        db,
        user_id=agent.id,
        type=NotificationType.CONVERSATION_ASSIGNED,
        title="Conversation assigned",
        message=f"Conversation #{conversation.id} has been assigned to you",
        reference_type="conversation",
        reference_id=conversation.id,
        priority=NotificationPriority.HIGH,
    )
    return True


def process_pending_queue(db: Session) -> int:
    """Process unassigned open & pending conversations FIFO when agent capacity becomes available."""
    pending_conversations = (
        db.query(Conversation)
        .filter(
            Conversation.status.in_([ConversationStatus.PENDING, ConversationStatus.OPEN]),
            Conversation.assigned_agent_id.is_(None),
            Conversation.merged_into_id.is_(None),
        )
        .order_by(Conversation.created_at.asc(), Conversation.id.asc())
        .all()
    )

    assigned_count = 0
    for conversation in pending_conversations:
        if assign_conversation_to_agent(db, conversation):
            assigned_count += 1
        else:
            break

    db.commit()
    return assigned_count


def release_agent_capacity(db: Session, agent_id: int, count: int = 1) -> None:
    """Release agent capacity when conversations are resolved/closed/pending."""
    agent_profile = db.query(AgentProfile).filter(AgentProfile.user_id == agent_id).first()
    if agent_profile:
        agent_profile.active_conversations = max(0, (agent_profile.active_conversations or 0) - count)


def reassign_conversation(db: Session, conversation: Conversation, new_agent_id: int | None = None) -> bool:
    """Reassign a conversation to a different agent or back to the queue."""
    if conversation.assigned_agent_id:
        release_agent_capacity(db, conversation.assigned_agent_id)

    if new_agent_id:
        new_agent = db.query(User).filter(User.id == new_agent_id, User.role == "agent", User.is_active == True).first()
        if new_agent:
            new_agent_profile = new_agent.agent_profile
            if not new_agent_profile or not new_agent_profile.is_available:
                return False
            active_count = db.query(func.count(Conversation.id)).filter(
                Conversation.assigned_agent_id == new_agent.id,
                Conversation.status.in_([ConversationStatus.ASSIGNED, ConversationStatus.OPEN]),
            ).scalar() or 0
            if new_agent_profile and active_count < new_agent_profile.max_conversations:
                conversation.assigned_agent_id = new_agent_id
                conversation.status = ConversationStatus.ASSIGNED
                new_agent_profile.active_conversations = int(active_count) + 1
                history = list(getattr(conversation, "assignment_history", None) or [])
                history.append({"type": "reassigned", "to_agent_id": new_agent_id})
                conversation.assignment_history = history
                system_message = Message(
                    conversation_id=conversation.id,
                    sender_id=None,
                    sender_type=MessageSenderType.SYSTEM,
                    message_type=MessageType.SYSTEM_EVENT,
                    content=f"Conversation reassigned to {new_agent.full_name}",
                    is_internal=True,
                    delivery_status="delivered",
                )
                db.add(system_message)
                create_notification(
                    db,
                    user_id=new_agent_id,
                    type=NotificationType.CONVERSATION_ASSIGNED,
                    title="Conversation assigned",
                    message=f"Conversation #{conversation.id} has been assigned to you",
                    reference_type="conversation",
                    reference_id=conversation.id,
                    priority=NotificationPriority.HIGH,
                )
                db.commit()
                return True

    conversation.assigned_agent_id = None
    return assign_conversation_to_agent(db, conversation)


def set_agent_availability(
    db: Session,
    agent_id: int,
    is_available: bool | None = None,
    availability_status: str | None = None,
    pause_auto_assignment: bool | None = None,
    by_admin: bool = False,
) -> AgentProfile | None:
    """
    Set agent availability (available | busy | offline) and/or pause_auto_assignment.
    Enforces admin_forced_offline so agents cannot override an administrator-enforced Offline state.
    Processes pending/open queue if becoming available.
    """
    agent_profile = db.query(AgentProfile).filter(AgentProfile.user_id == agent_id).first()
    if not agent_profile:
        return None

    if not by_admin and agent_profile.admin_forced_offline:
        if (availability_status and availability_status != "offline") or is_available is True:
            raise HTTPException(
                status_code=403,
                detail="Your availability has been set to Offline by an administrator and cannot be overridden.",
            )

    if availability_status is not None:
        status_norm = availability_status.lower().strip()
        if status_norm not in ("available", "busy", "offline"):
            raise HTTPException(status_code=400, detail="availability_status must be 'available', 'busy', or 'offline'")
        agent_profile.availability_status = status_norm
        if status_norm == "available" and pause_auto_assignment is None:
            agent_profile.pause_auto_assignment = False
    elif is_available is not None:
        agent_profile.availability_status = "available" if is_available else "offline"
        if is_available and pause_auto_assignment is None:
            agent_profile.pause_auto_assignment = False

    if pause_auto_assignment is not None:
        agent_profile.pause_auto_assignment = pause_auto_assignment

    if by_admin:
        if agent_profile.availability_status == "offline":
            agent_profile.admin_forced_offline = True
        else:
            agent_profile.admin_forced_offline = False

    # Effective auto-assignment eligibility
    effective_available = (
        agent_profile.availability_status == "available"
        and not agent_profile.pause_auto_assignment
        and not agent_profile.admin_forced_offline
    )
    agent_profile.is_available = effective_available
    db.commit()
    db.refresh(agent_profile)

    if effective_available:
        process_pending_queue(db)

    return agent_profile


def get_agent_workload(db: Session, agent_id: int) -> dict:
    """Get current workload and availability statistics for an agent."""
    agent_profile = db.query(AgentProfile).filter(AgentProfile.user_id == agent_id).first()
    if not agent_profile:
        return {
            "active": 0,
            "max": 5,
            "available": False,
            "availability_status": "offline",
            "effective_status": "offline",
            "admin_forced_offline": False,
            "pause_auto_assignment": False,
            "capacity_remaining": 0,
        }

    active_conversations = (
        db.query(Conversation)
        .filter(
            Conversation.assigned_agent_id == agent_id,
            Conversation.status.in_([ConversationStatus.ASSIGNED, ConversationStatus.OPEN, ConversationStatus.PENDING]),
        )
        .count()
    )

    eff = "offline" if agent_profile.admin_forced_offline else agent_profile.availability_status
    if eff == "available" and agent_profile.pause_auto_assignment:
        eff = "busy"

    return {
        "active": active_conversations,
        "max": agent_profile.max_conversations,
        "available": agent_profile.is_available,
        "availability_status": agent_profile.availability_status,
        "effective_status": eff,
        "admin_forced_offline": agent_profile.admin_forced_offline,
        "pause_auto_assignment": agent_profile.pause_auto_assignment,
        "capacity_remaining": max(0, agent_profile.max_conversations - active_conversations),
    }
