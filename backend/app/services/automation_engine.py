from typing import Any
import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.enums import ConversationStatus, MessageSenderType
from app.models.automation_rule import AutomationRule, AutomationRuleExecution
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.user import User
from app.services.conversation_service import assign_conversation, transition_status
from app.services.notification_service import create_notification
from app.services.assignment_service import assign_conversation_to_agent


def evaluate_condition(condition: dict, context: dict) -> bool:
    """Evaluate a single condition against the context."""
    field = condition.get("field", "")
    operator = condition.get("operator", "equals")
    value = condition.get("value")

    context_value = context.get(field)

    if operator == "equals":
        return context_value == value
    elif operator == "not_equals":
        return context_value != value
    elif operator == "contains":
        return value in (context_value or "")
    elif operator == "not_contains":
        return value not in (context_value or "")
    elif operator == "greater_than":
        try:
            return float(context_value) > float(value)
        except (ValueError, TypeError):
            return False
    elif operator == "less_than":
        try:
            return float(context_value) < float(value)
        except (ValueError, TypeError):
            return False
    elif operator == "exists":
        return context_value is not None
    elif operator == "not_exists":
        return context_value is None
    return False


def evaluate_conditions(conditions: list[dict], context: dict) -> bool:
    """Evaluate all conditions (AND logic)."""
    if not conditions:
        return True
    return all(evaluate_condition(c, context) for c in conditions)


def execute_action(action: dict, context: dict, db: Session) -> dict:
    """Execute a single action and return the result."""
    action_type = action.get("type", "")
    result = {"type": action_type, "success": False, "detail": ""}

    try:
        if action_type == "assign_to_agent":
            agent_id = action.get("agent_id")
            conversation_id = context.get("conversation_id")
            if agent_id and conversation_id:
                conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
                if conversation:
                    from app.services.conversation_service import assign_conversation as svc_assign
                    actor = db.query(User).filter(User.id == agent_id).first()
                    svc_assign(db, conversation, actor, agent_id, note=action.get("note", "Auto-assigned by rule"))
                    db.commit()
                    result["success"] = True
                    result["detail"] = f"Assigned to agent {agent_id}"

        elif action_type == "change_status":
            new_status = action.get("status")
            conversation_id = context.get("conversation_id")
            if new_status and conversation_id:
                conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
                if conversation:
                    actor_id = action.get("actor_id", 1)
                    actor = db.query(User).filter(User.id == actor_id).first()
                    transition_status(db, conversation, new_status, actor)
                    db.commit()
                    result["success"] = True
                    result["detail"] = f"Status changed to {new_status}"

        elif action_type == "send_notification":
            user_id = action.get("user_id")
            title = action.get("title", "Automation Notification")
            message = action.get("message", "")
            if user_id:
                create_notification(
                    db, user_id=user_id, type="system",
                    title=title, message=message,
                    priority="normal"
                )
                db.commit()
                result["success"] = True
                result["detail"] = f"Notification sent to user {user_id}"

        elif action_type == "add_tag":
            tag = action.get("tag")
            conversation_id = context.get("conversation_id")
            if tag and conversation_id:
                conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
                if conversation:
                    current_tags = conversation.tags or []
                    if tag not in current_tags:
                        current_tags.append(tag)
                    conversation.tags = current_tags
                    db.commit()
                    result["success"] = True
                    result["detail"] = f"Added tag: {tag}"

        elif action_type == "set_priority":
            priority = action.get("priority")
            conversation_id = context.get("conversation_id")
            if priority and conversation_id:
                conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
                if conversation:
                    conversation.priority = priority
                    db.commit()
                    result["success"] = True
                    result["detail"] = f"Priority set to {priority}"

        else:
            result["detail"] = f"Unknown action type: {action_type}"

    except Exception as e:
        result["detail"] = str(e)

    return result


def evaluate_and_execute_rules(
    db: Session,
    trigger_event: str,
    context: dict,
) -> list[dict]:
    """Evaluate all active automation rules matching the trigger event and execute matching actions."""
    results = []

    rules = (
        db.query(AutomationRule)
        .filter(AutomationRule.is_active == True, AutomationRule.trigger_event == trigger_event)  # noqa: E712
        .all()
    )

    for rule in rules:
        try:
            conditions = json.loads(rule.conditions) if rule.conditions else []
            actions = json.loads(rule.actions) if rule.actions else []

            if not evaluate_conditions(conditions, context):
                continue

            actions_taken = []
            all_success = True

            for action in actions:
                result = execute_action(action, context, db)
                actions_taken.append(result)
                if not result["success"]:
                    all_success = False

            execution = AutomationRuleExecution(
                rule_id=rule.id,
                trigger_event=trigger_event,
                trigger_payload=json.dumps(context),
                actions_taken=json.dumps(actions_taken),
                success=all_success,
                error_message=None if all_success else "One or more actions failed",
            )
            db.add(execution)
            db.commit()

            results.append({
                "rule_id": rule.id,
                "rule_name": rule.name,
                "trigger_event": trigger_event,
                "success": all_success,
                "actions_taken": actions_taken,
            })

        except Exception as e:
            execution = AutomationRuleExecution(
                rule_id=rule.id,
                trigger_event=trigger_event,
                trigger_payload=json.dumps(context),
                actions_taken=json.dumps([]),
                success=False,
                error_message=str(e),
            )
            db.add(execution)
            db.commit()
            results.append({
                "rule_id": rule.id,
                "rule_name": rule.name,
                "trigger_event": trigger_event,
                "success": False,
                "error": str(e),
            })

    return results


def on_conversation_created(db: Session, conversation: Conversation, context: dict):
    """Trigger automation rules when a conversation is created."""
    context["conversation_id"] = conversation.id
    context["customer_id"] = conversation.customer_id
    context["subject"] = conversation.subject
    context["status"] = conversation.status
    context["priority"] = conversation.priority
    return evaluate_and_execute_rules(db, "conversation.created", context)


def on_message_created(db: Session, message: Message, context: dict):
    """Trigger automation rules when a message is created."""
    conversation = db.query(Conversation).filter(Conversation.id == message.conversation_id).first()
    if not conversation:
        return []

    context["conversation_id"] = message.conversation_id
    context["message_id"] = message.id
    context["sender_type"] = message.sender_type
    context["sender_id"] = message.sender_id
    context["content"] = message.content
    context["customer_id"] = conversation.customer_id
    context["status"] = conversation.status
    return evaluate_and_execute_rules(db, "message.created", context)


def on_conversation_status_changed(db: Session, conversation: Conversation, old_status: str, new_status: str, context: dict):
    """Trigger automation rules when a conversation status changes."""
    context["conversation_id"] = conversation.id
    context["customer_id"] = conversation.customer_id
    context["old_status"] = old_status
    context["new_status"] = new_status
    context["status"] = conversation.status
    return evaluate_and_execute_rules(db, "conversation.status_changed", context)