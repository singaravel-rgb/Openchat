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
        conversation.status = ConversationStatus.PENDING
        conversation.assigned_agent_id = None
        return False

    agent = available_agents[0]

    conversation.assigned_agent_id = agent.id
    conversation.status = ConversationStatus.ASSIGNED

    agent_profile = agent.agent_profile
    if agent_profile:
        agent_profile.active_conversations = (agent_profile.active_conversations or 0) + 1

    history = list(getattr(conversation, "assignment_history", None) or [])
    history.append({"type": "auto_assigned", "to_agent_id": agent.id})
    conversation.assignment_history = history

    system_message = Message(
        conversation_id=conversation.id,
        sender_id=None,
        sender_type=MessageSenderType.SYSTEM,
        message_type=MessageType.SYSTEM_EVENT,
        content=f"Conversation assigned to {agent.full_name}",
        is_internal=False,
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
    """Process pending conversations FIFO when agent capacity becomes available."""
    pending_conversations = (
        db.query(Conversation)
        .filter(Conversation.status == ConversationStatus.PENDING)
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
                Conversation.status.in_([ConversationStatus.ASSIGNED, ConversationStatus.AI_HANDLING]),
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
                    is_internal=False,
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


def set_agent_availability(db: Session, agent_id: int, is_available: bool) -> bool:
    """Set agent availability and process pending queue if becoming available."""
    agent_profile = db.query(AgentProfile).filter(AgentProfile.user_id == agent_id).first()
    if not agent_profile:
        return False

    agent_profile.is_available = is_available
    db.commit()

    if is_available:
        process_pending_queue(db)

    return True


def get_agent_workload(db: Session, agent_id: int) -> dict:
    """Get current workload statistics for an agent."""
    agent_profile = db.query(AgentProfile).filter(AgentProfile.user_id == agent_id).first()
    if not agent_profile:
        return {"active": 0, "max": 5, "available": False, "capacity_remaining": 0}

    active_conversations = (
        db.query(Conversation)
        .filter(
            Conversation.assigned_agent_id == agent_id,
            Conversation.status.in_([ConversationStatus.ASSIGNED, ConversationStatus.AI_HANDLING]),
        )
        .count()
    )

    return {
        "active": active_conversations,
        "max": agent_profile.max_conversations,
        "available": agent_profile.is_available,
        "capacity_remaining": max(0, agent_profile.max_conversations - active_conversations),
    }
