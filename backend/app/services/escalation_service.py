from datetime import datetime, timezone
import logging
from typing import Optional, Any
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.enums import ConversationStatus, MessageSenderType, MessageType
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.notification import Notification, NotificationPriority, NotificationType
from app.models.setting import Setting
from app.models.user import User
from app.services.assignment_service import get_available_agents, reassign_conversation
from app.services.notification_service import create_notification

logger = logging.getLogger(__name__)

DEFAULT_FIRST_RESPONSE_TIMEOUT_SECONDS = 5
DEFAULT_SECOND_ESCALATION_TIMEOUT_SECONDS = 30


def get_escalation_settings(db: Session) -> dict[str, int]:
    """Retrieve response timeout and escalation deadline from settings, or defaults."""
    first_timeout = DEFAULT_FIRST_RESPONSE_TIMEOUT_SECONDS
    second_timeout = DEFAULT_SECOND_ESCALATION_TIMEOUT_SECONDS

    try:
        s1 = db.query(Setting).filter(Setting.key == "first_response_timeout_seconds").first()
        if s1 and s1.value is not None:
            first_timeout = int(s1.value)

        s2 = db.query(Setting).filter(Setting.key == "second_escalation_timeout_seconds").first()
        if s2 and s2.value is not None:
            second_timeout = int(s2.value)
    except Exception as e:
        logger.warning(f"Could not load escalation settings: {e}")

    return {
        "first_response_timeout_seconds": first_timeout,
        "second_escalation_timeout_seconds": second_timeout,
    }


def check_response_deadlines_and_escalate(db: Session) -> dict[str, Any]:
    """
    Monitor response times for assigned conversations.
    - If customer sent a message and assigned agent did not respond within first threshold:
      dispatch SLA warning notification to assigned agent.
    - If agent still did not respond within second escalation threshold:
      automatically reassign to another eligible agent (or move to Pending queue if none available)
      and notify admins/supervisors.
    Resets whenever customer sends a new message or agent replies.
    Excludes internal notes from satisfying customer response timer.
    """
    cfg = get_escalation_settings(db)
    first_threshold = cfg["first_response_timeout_seconds"]
    second_threshold = cfg["second_escalation_timeout_seconds"]

    now = datetime.now(timezone.utc)
    warnings_issued = 0
    reassignments = 0
    pending_moved = 0

    # Query active assigned/open conversations that have an assigned agent
    active_conversations = (
        db.query(Conversation)
        .filter(
            Conversation.status.in_([ConversationStatus.ASSIGNED, ConversationStatus.OPEN]),
            Conversation.assigned_agent_id.isnot(None),
            Conversation.merged_into_id.is_(None),
        )
        .all()
    )

    for conv in active_conversations:
        # Find latest non-internal message
        latest_msg = (
            db.query(Message)
            .filter(
                Message.conversation_id == conv.id,
                Message.is_internal == False,  # noqa: E712
            )
            .order_by(Message.created_at.desc(), Message.id.desc())
            .first()
        )

        if not latest_msg:
            continue

        # If latest message is NOT from a customer, agent has already responded or AI is active
        if latest_msg.sender_type != MessageSenderType.CUSTOMER:
            continue

        # Calculate elapsed seconds since customer message
        msg_time = latest_msg.created_at
        if msg_time.tzinfo is None:
            msg_time = msg_time.replace(tzinfo=timezone.utc)
        elapsed = (now - msg_time).total_seconds()

        chat_id_label = conv.chat_id or f"#{conv.id}"
        agent_id = conv.assigned_agent_id

        # 1. First Response Warning Threshold
        if elapsed >= first_threshold:
            # Check if agent already warned for this turn (created_at >= latest customer message)
            already_warned = (
                db.query(Notification)
                .filter(
                    Notification.user_id == agent_id,
                    Notification.reference_id == conv.id,
                    Notification.reference_type == "conversation",
                    Notification.type == NotificationType.SLA_WARNING,
                    Notification.created_at >= latest_msg.created_at,
                )
                .first()
            )

            if not already_warned:
                create_notification(
                    db,
                    user_id=agent_id,
                    type=NotificationType.SLA_WARNING,
                    title=f"Response overdue: {chat_id_label}",
                    message=f"Customer is waiting. First response deadline ({first_threshold}s) has elapsed.",
                    reference_type="conversation",
                    reference_id=conv.id,
                    priority=NotificationPriority.HIGH,
                )
                conv.sla_response_breached = True
                warnings_issued += 1

        # 2. Second Escalation Reassignment Threshold
        if elapsed >= second_threshold:
            history = list(conv.assignment_history or [])
            # Check if already auto-escalated for this exact customer message turn
            already_escalated = any(
                h.get("type") == "auto_escalated_reassignment" and h.get("trigger_msg_id") == latest_msg.id
                for h in history
            )

            if not already_escalated:
                # Find available agents excluding current assigned agent
                candidates = get_available_agents(db)
                eligible_agents = [a for a in candidates if a.id != agent_id]

                if eligible_agents:
                    new_agent = eligible_agents[0]
                    old_agent = conv.assigned_agent

                    # Reassign
                    reassign_conversation(db, conv, new_agent.id)

                    history.append({
                        "type": "auto_escalated_reassignment",
                        "from_agent_id": agent_id,
                        "to_agent_id": new_agent.id,
                        "trigger_msg_id": latest_msg.id,
                        "elapsed_seconds": round(elapsed, 1),
                        "timestamp": now.isoformat(),
                        "reason": f"Assigned agent did not respond within {second_threshold}s deadline.",
                    })
                    conv.assignment_history = history

                    # System message in conversation
                    sys_msg = Message(
                        conversation_id=conv.id,
                        sender_id=None,
                        sender_type=MessageSenderType.SYSTEM,
                        message_type=MessageType.SYSTEM_EVENT,
                        content=f"Response deadline ({second_threshold}s) exceeded. Automatically escalated and reassigned from {old_agent.full_name if old_agent else 'previous agent'} to {new_agent.full_name}.",
                        is_internal=True,
                        delivery_status="delivered",
                    )
                    db.add(sys_msg)

                    # Notify new agent
                    create_notification(
                        db,
                        user_id=new_agent.id,
                        type=NotificationType.CONVERSATION_ASSIGNED,
                        title=f"Escalated Conversation: {chat_id_label}",
                        message=f"Ticket {chat_id_label} was escalated to you due to missed response deadline.",
                        reference_type="conversation",
                        reference_id=conv.id,
                        priority=NotificationPriority.URGENT,
                    )
                    reassignments += 1
                else:
                    # No other agent available; move to unassigned OPEN queue and alert supervisors
                    old_agent = conv.assigned_agent
                    conv.status = ConversationStatus.OPEN
                    conv.assigned_agent_id = None

                    history.append({
                        "type": "auto_escalated_reassignment",
                        "from_agent_id": agent_id,
                        "to_agent_id": None,
                        "trigger_msg_id": latest_msg.id,
                        "elapsed_seconds": round(elapsed, 1),
                        "timestamp": now.isoformat(),
                        "reason": f"Response deadline exceeded. No other agents available; moved to Pending queue.",
                    })
                    conv.assignment_history = history

                    sys_msg = Message(
                        conversation_id=conv.id,
                        sender_id=None,
                        sender_type=MessageSenderType.SYSTEM,
                        message_type=MessageType.SYSTEM_EVENT,
                        content=f"Response deadline ({second_threshold}s) exceeded. No other available agents; ticket moved to Pending queue.",
                        is_internal=True,
                        delivery_status="delivered",
                    )
                    db.add(sys_msg)

                    # Alert supervisors/admins
                    admins = db.query(User).filter(User.role.in_(["admin", "super_admin"]), User.is_active == True).all()  # noqa: E712
                    for admin in admins:
                        create_notification(
                            db,
                            user_id=admin.id,
                            type=NotificationType.SLA_BREACH,
                            title=f"Urgent: Unassigned Overdue Ticket {chat_id_label}",
                            message=f"Conversation {chat_id_label} missed response deadline and no eligible agents are available.",
                            reference_type="conversation",
                            reference_id=conv.id,
                            priority=NotificationPriority.URGENT,
                        )
                    pending_moved += 1

    db.commit()
    return {
        "status": "success",
        "warnings_issued": warnings_issued,
        "reassignments": reassignments,
        "pending_moved": pending_moved,
    }
