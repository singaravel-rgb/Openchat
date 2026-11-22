import json
import logging
import re
from typing import Optional
from sqlalchemy.orm import Session
from app.models.bot_flow import BotFlow, BotFlowStep, BotFlowIssue
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.user import User
from app.core.enums import ConversationStatus, MessageSenderType, MessageType

logger = logging.getLogger(__name__)

# Level 1: Standard customer support issues / categories
DEFAULT_ISSUES = [
    {
        "title": "📦 Order or Booking",
        "description": "Track, modify, or question about orders and bookings",
        "start_step_key": "order_help",
        "sort_order": 1,
    },
    {
        "title": "💳 Payment Issues",
        "description": "Invoices, failed payments, charges, and payment methods",
        "start_step_key": "billing_help",
        "sort_order": 2,
    },
    {
        "title": "🔄 Refund or Cancellation",
        "description": "Return items, cancel bookings, and refund tracking",
        "start_step_key": "refund_help",
        "sort_order": 3,
    },
    {
        "title": "ℹ️ Product Information",
        "description": "Features, pricing, subscriptions, and integrations",
        "start_step_key": "product_help",
        "sort_order": 4,
    },
    {
        "title": "🛠️ Technical Support",
        "description": "App issues, website problems, login difficulties",
        "start_step_key": "tech_help",
        "sort_order": 5,
    },
    {
        "title": "❓ Other Questions",
        "description": "General questions, feedback, and custom assistance",
        "start_step_key": "other_help",
        "sort_order": 6,
    },
]

# Multi-level bot flow steps (Levels 2, 3, and 4)
DEFAULT_STEPS = [
    # ===== LEVEL 2: Order or Booking =====
    {
        "step_key": "order_help",
        "step_type": "question",
        "message_text": "What would you like help with regarding your order or booking?",
        "options": json.dumps([
            {"label": "Track my order", "value": "Track my order", "next_step_key": "track_order"},
            {"label": "Booking confirmation", "value": "Booking confirmation", "next_step_key": "booking_confirm"},
            {"label": "Download invoice", "value": "Download invoice", "next_step_key": "invoice_help"},
            {"label": "Change booking", "value": "Change booking", "next_step_key": "change_booking"},
            {"label": "Cancel booking", "value": "Cancel booking", "next_step_key": "cancel_info"},
            {"label": "Something else", "value": "Something else", "next_step_key": "other_help"},
        ]),
        "next_step_key": None,
        "is_terminal": False,
        "sort_order": 1,
    },

    # ===== LEVEL 3: Track my order =====
    {
        "step_key": "track_order",
        "step_type": "question",
        "message_text": "How would you like to find your order?",
        "options": json.dumps([
            {"label": "Enter order ID", "value": "Enter order ID", "next_step_key": "track_order_id"},
            {"label": "Enter registered email", "value": "Enter registered email", "next_step_key": "track_order_email"},
            {"label": "Something else", "value": "Something else", "next_step_key": "other_help"},
        ]),
        "next_step_key": None,
        "is_terminal": False,
        "sort_order": 2,
    },

    # ===== LEVEL 4: Track Order Actions =====
    {
        "step_key": "track_order_id",
        "step_type": "input",
        "message_text": "Please enter your Order ID (for example: ORD-12345). Our support team will verify the shipping status right away.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 3,
    },
    {
        "step_key": "track_order_email",
        "step_type": "input",
        "message_text": "Please enter your registered email address. We'll look up all active shipments and delivery updates for your account.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 4,
    },
    {
        "step_key": "booking_confirm",
        "step_type": "message",
        "message_text": "Booking confirmations are sent immediately via email and SMS upon reservation. If you need it resent, please provide your booking reference or registered phone number.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 5,
    },
    {
        "step_key": "change_booking",
        "step_type": "message",
        "message_text": "Modifications can be made up to 24 hours prior to scheduled service. Reply with your booking reference number and requested changes.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 6,
    },
    {
        "step_key": "cancel_info",
        "step_type": "message",
        "message_text": "Orders and bookings can be cancelled before dispatch or within the cancellation window. Please reply with your Order ID and reason for cancellation to proceed.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 7,
    },

    # ===== LEVEL 2: Payment Issues =====
    {
        "step_key": "billing_help",
        "step_type": "question",
        "message_text": "What payment or billing question do you have?",
        "options": json.dumps([
            {"label": "Payment Failed", "value": "Payment Failed", "next_step_key": "payment_failure"},
            {"label": "Amount Deducted", "value": "Amount Deducted", "next_step_key": "amount_deducted"},
            {"label": "Download tax invoice", "value": "Download tax invoice", "next_step_key": "invoice_help"},
            {"label": "Update payment method", "value": "Update payment method", "next_step_key": "update_payment"},
            {"label": "Something else", "value": "Something else", "next_step_key": "other_help"},
        ]),
        "next_step_key": None,
        "is_terminal": False,
        "sort_order": 8,
    },
    {
        "step_key": "payment_failure",
        "step_type": "message",
        "message_text": "For failed checkout attempts, banks typically release authorization holds within 24 to 48 hours. If amount was debited, please share your transaction reference (UTR) so we can trace it.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 9,
    },
    {
        "step_key": "amount_deducted",
        "step_type": "message",
        "message_text": "If money was deducted during an unconfirmed checkout, banks auto-refund within 3-5 business days. Please reply with your bank transaction reference (UTR) and payment method.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 10,
    },
    {
        "step_key": "invoice_help",
        "step_type": "message",
        "message_text": "Invoices can be downloaded from your Account Dashboard under Billing History. If you require a GST/VAT tax invoice, reply with your tax registration details here.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 11,
    },
    {
        "step_key": "update_payment",
        "step_type": "message",
        "message_text": "You can add or update credit/debit cards, net banking, and UPI IDs securely in Account Settings > Payment Methods.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 12,
    },

    # ===== LEVEL 2: Refund or Cancellation =====
    {
        "step_key": "refund_help",
        "step_type": "question",
        "message_text": "How can we assist with your refund or return?",
        "options": json.dumps([
            {"label": "Check refund status", "value": "Check refund status", "next_step_key": "refund_status_info"},
            {"label": "Cancel my order", "value": "Cancel my order", "next_step_key": "cancel_info"},
            {"label": "Return policy", "value": "Return policy", "next_step_key": "return_policy"},
            {"label": "Something else", "value": "Something else", "next_step_key": "other_help"},
        ]),
        "next_step_key": None,
        "is_terminal": False,
        "sort_order": 13,
    },
    {
        "step_key": "refund_status_info",
        "step_type": "message",
        "message_text": "Approved refunds are credited to original payment methods within 5-7 business days. Please provide your Refund or Order ID so we can verify the status.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 14,
    },
    {
        "step_key": "return_policy",
        "step_type": "message",
        "message_text": "Standard returns are accepted within 30 days of receipt in original condition and packaging. Reply with your Order ID and the item name to initiate a return request.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 15,
    },

    # ===== LEVEL 2: Product Information =====
    {
        "step_key": "product_help",
        "step_type": "question",
        "message_text": "What product details would you like to explore?",
        "options": json.dumps([
            {"label": "Features & capabilities", "value": "Features & capabilities", "next_step_key": "prod_features"},
            {"label": "Pricing & plans", "value": "Pricing & plans", "next_step_key": "prod_pricing"},
            {"label": "Integrations", "value": "Integrations", "next_step_key": "prod_integrations"},
            {"label": "Something else", "value": "Something else", "next_step_key": "other_help"},
        ]),
        "next_step_key": None,
        "is_terminal": False,
        "sort_order": 16,
    },
    {
        "step_key": "prod_features",
        "step_type": "message",
        "message_text": "OpenChat provides AI-first conversation triage, real-time agent handoff, live customer chat widget, custom SLAs, and team inbox collaboration. Let us know what specific capability you're interested in!",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 17,
    },
    {
        "step_key": "prod_pricing",
        "step_type": "message",
        "message_text": "We offer flexible Starter, Professional, and Enterprise plans with transparent agent seats and generous AI usage quotas. Tell us your team size and we can recommend the best option.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 18,
    },
    {
        "step_key": "prod_integrations",
        "step_type": "message",
        "message_text": "OpenChat integrates with webhooks, REST APIs, email channels, and embeddable JavaScript chat widgets. Which platform or workflow would you like to connect?",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 19,
    },

    # ===== LEVEL 2: Technical Support =====
    {
        "step_key": "tech_help",
        "step_type": "question",
        "message_text": "What technical issue are you experiencing?",
        "options": json.dumps([
            {"label": "Login or account access", "value": "Login or account access", "next_step_key": "account_help"},
            {"label": "Website or portal error", "value": "Website or portal error", "next_step_key": "tech_site_issue"},
            {"label": "Something else", "value": "Something else", "next_step_key": "other_help"},
        ]),
        "next_step_key": None,
        "is_terminal": False,
        "sort_order": 20,
    },
    {
        "step_key": "tech_site_issue",
        "step_type": "message",
        "message_text": "Please describe what happened, or paste any error code or screenshot details. Our technical support team will investigate right away.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 21,
    },
    {
        "step_key": "account_help",
        "step_type": "message",
        "message_text": "For password resets, use the 'Forgot Password' link on the login page. For two-factor authentication or locked accounts, reply here and our security team will assist.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 22,
    },

    # ===== LEVEL 2: Other Questions =====
    {
        "step_key": "other_help",
        "step_type": "message",
        "message_text": "Our support team is here to help! Please send your question or describe your request, and we'll assist you immediately.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 23,
    },
]


def _normalize_issue_key(title: str, step_key: str = "") -> str:
    """Normalize issue title/key to prevent duplicate seed issues with/without emojis."""
    clean_title = re.sub(r"[^\w\s]", "", title or "").strip().lower()
    clean_key = (step_key or "").strip().lower()
    return f"{clean_key}:{clean_title}"


def seed_default_bot_flow(db: Session) -> BotFlow:
    """Ensure a default published bot flow exists with multi-level categories and steps."""
    flow = db.query(BotFlow).filter(BotFlow.is_default == True).first()  # noqa: E712
    if not flow:
        flow = db.query(BotFlow).filter(BotFlow.status == "published").first()
    if flow:
        # Load all existing issues and identify duplicates by start_step_key or normalized title
        all_existing_issues = db.query(BotFlowIssue).filter(BotFlowIssue.flow_id == flow.id).order_by(BotFlowIssue.id.asc()).all()
        existing_by_step = {}
        for i in all_existing_issues:
            step_k = (i.start_step_key or "").strip()
            norm_k = re.sub(r"[^\w\s]", "", i.title or "").strip().lower()
            key = step_k or norm_k
            if key in existing_by_step:
                # Duplicate detected: keep the earliest or active one, delete duplicate
                db.delete(i)
            else:
                existing_by_step[key] = i

        for issue_data in DEFAULT_ISSUES:
            step_k = issue_data["start_step_key"].strip()
            norm_k = re.sub(r"[^\w\s]", "", issue_data["title"]).strip().lower()
            matched = existing_by_step.get(step_k) or existing_by_step.get(norm_k)
            if not matched:
                issue = BotFlowIssue(
                    flow_id=flow.id,
                    title=issue_data["title"],
                    description=issue_data["description"],
                    start_step_key=issue_data["start_step_key"],
                    sort_order=issue_data["sort_order"],
                    is_active=True,
                )
                db.add(issue)
                existing_by_step[step_k] = issue
            else:
                matched.title = issue_data["title"]
                matched.description = issue_data["description"]
                matched.start_step_key = issue_data["start_step_key"]
                matched.sort_order = issue_data["sort_order"]
                matched.is_active = True

        existing_steps = {s.step_key: s for s in db.query(BotFlowStep).filter(BotFlowStep.flow_id == flow.id).all()}
        for step_data in DEFAULT_STEPS:
            if step_data["step_key"] not in existing_steps:
                step = BotFlowStep(
                    flow_id=flow.id,
                    step_key=step_data["step_key"],
                    step_type=step_data["step_type"],
                    message_text=step_data["message_text"],
                    options=step_data["options"],
                    next_step_key=step_data["next_step_key"],
                    is_terminal=step_data["is_terminal"],
                    sort_order=step_data["sort_order"],
                )
                db.add(step)
            else:
                existing_step = existing_steps[step_data["step_key"]]
                existing_step.step_type = step_data["step_type"]
                existing_step.message_text = step_data["message_text"]
                existing_step.options = step_data["options"]
                existing_step.is_terminal = step_data["is_terminal"]

        db.commit()
        return flow

    admin = db.query(User).filter(User.role.in_(["admin", "super_admin"])).first()
    flow = BotFlow(
        name="Standard Customer Support Flow",
        description="Multi-level guided customer self-service flow with contextual branching",
        initial_greeting="Hello! Welcome to OpenChat Support. How can we help you today?",
        status="published",
        version=1,
        is_default=True,
        created_by_id=admin.id if admin else None,
    )
    db.add(flow)
    db.commit()
    db.refresh(flow)

    for issue_data in DEFAULT_ISSUES:
        issue = BotFlowIssue(
            flow_id=flow.id,
            title=issue_data["title"],
            description=issue_data["description"],
            start_step_key=issue_data["start_step_key"],
            sort_order=issue_data["sort_order"],
            is_active=True,
        )
        db.add(issue)

    for step_data in DEFAULT_STEPS:
        step = BotFlowStep(
            flow_id=flow.id,
            step_key=step_data["step_key"],
            step_type=step_data["step_type"],
            message_text=step_data["message_text"],
            options=step_data["options"],
            next_step_key=step_data["next_step_key"],
            is_terminal=step_data["is_terminal"],
            sort_order=step_data["sort_order"],
        )
        db.add(step)

    db.commit()
    logger.info("Seeded default multi-level bot flow with %d issues and %d steps", len(DEFAULT_ISSUES), len(DEFAULT_STEPS))
    return flow


def get_active_bot_flow_data(db: Session) -> dict:
    """Retrieve full active bot flow with issues and structured steps."""
    flow = db.query(BotFlow).filter(BotFlow.status == "published", BotFlow.is_default == True).first()  # noqa: E712
    if not flow:
        flow = db.query(BotFlow).filter(BotFlow.status == "published").order_by(BotFlow.updated_at.desc()).first()
    if not flow:
        flow = seed_default_bot_flow(db)

    issues = (
        db.query(BotFlowIssue)
        .filter(BotFlowIssue.flow_id == flow.id, BotFlowIssue.is_active == True)  # noqa: E712
        .order_by(BotFlowIssue.sort_order.asc())
        .all()
    )
    steps = (
        db.query(BotFlowStep)
        .filter(BotFlowStep.flow_id == flow.id)
        .order_by(BotFlowStep.sort_order.asc())
        .all()
    )

    steps_dict = {}
    for s in steps:
        parsed_options = None
        if s.options:
            try:
                parsed_options = json.loads(s.options)
            except Exception:
                parsed_options = None
        steps_dict[s.step_key] = {
            "id": s.id,
            "step_key": s.step_key,
            "step_type": s.step_type,
            "message_text": s.message_text,
            "options": parsed_options,
            "next_step_key": s.next_step_key,
            "is_terminal": s.is_terminal,
        }

    seen_keys = set()
    unique_issues = []
    for i in issues:
        norm_key = (i.start_step_key or "").strip() or re.sub(r"[^\w\s]", "", i.title or "").strip().lower()
        if norm_key not in seen_keys:
            seen_keys.add(norm_key)
            unique_issues.append({
                "id": i.id,
                "title": i.title,
                "description": i.description,
                "start_step_key": i.start_step_key,
                "sort_order": i.sort_order,
            })

    return {
        "id": flow.id,
        "name": flow.name,
        "initial_greeting": flow.initial_greeting or "Hello! Welcome to OpenChat Support. How can we help you today?",
        "issues": unique_issues,
        "steps": steps_dict,
    }


def match_and_execute_bot_flow_step(
    db: Session,
    conversation: Conversation,
    customer: User,
    user_text: str,
) -> Optional[Message]:
    """
    Check if the customer's input matches an active bot flow issue or step option.
    If matched, generates the bot response with next-level options and returns the Message.
    If no match (free-text question), returns None so Gemini handles it.
    """
    flow_data = get_active_bot_flow_data(db)
    if not flow_data:
        return None

    raw_text = (user_text or "").strip()
    norm_text = raw_text.lower()
    norm_text_clean = re.sub(r"[^\w\s]", "", norm_text).strip()

    target_step_key = None

    # 1. Check if user selected one of the Level 1 issues
    for issue in flow_data["issues"]:
        norm_title = issue["title"].lower()
        norm_title_clean = re.sub(r"[^\w\s]", "", norm_title).strip()
        if (
            norm_text == norm_title
            or norm_text_clean == norm_title_clean
            or (len(norm_text_clean) >= 4 and norm_text_clean in norm_title_clean)
            or (len(norm_title_clean) >= 4 and norm_title_clean in norm_text_clean)
        ):
            target_step_key = issue["start_step_key"]
            break

    # 2. Check if previous bot message in this conversation had options and user selected one
    if not target_step_key:
        last_bot_msg = (
            db.query(Message)
            .filter(
                Message.conversation_id == conversation.id,
                Message.sender_type == MessageSenderType.AI,
            )
            .order_by(Message.created_at.desc(), Message.id.desc())
            .first()
        )
        if last_bot_msg and last_bot_msg.ai_metadata:
            options = last_bot_msg.ai_metadata.get("options") or []
            for opt in options:
                opt_label = (opt.get("label") or "").lower()
                opt_val = (opt.get("value") or "").lower()
                opt_label_clean = re.sub(r"[^\w\s]", "", opt_label).strip()
                if (
                    norm_text == opt_label
                    or norm_text == opt_val
                    or norm_text_clean == opt_label_clean
                    or (len(norm_text_clean) >= 4 and norm_text_clean in opt_label_clean)
                ):
                    target_step_key = opt.get("next_step_key")
                    break

    # 3. Check any step's options if not found yet
    if not target_step_key:
        for s_key, s_data in flow_data["steps"].items():
            options = s_data.get("options") or []
            for opt in options:
                opt_label = (opt.get("label") or "").lower()
                opt_val = (opt.get("value") or "").lower()
                opt_label_clean = re.sub(r"[^\w\s]", "", opt_label).strip()
                if (
                    norm_text == opt_label
                    or norm_text == opt_val
                    or norm_text_clean == opt_label_clean
                    or (len(norm_text_clean) >= 5 and norm_text_clean in opt_label_clean)
                ):
                    target_step_key = opt.get("next_step_key")
                    break
            if target_step_key:
                break

    if not target_step_key:
        return None

    step = flow_data["steps"].get(target_step_key)
    if not step:
        return None

    # Step found! Create bot response message with next-level options
    ai_metadata = {
        "flow_id": flow_data["id"],
        "step_key": step["step_key"],
        "step_type": step["step_type"],
        "options": step["options"],
        "is_terminal": step["is_terminal"],
        "decision": "bot_flow_step",
    }
    bot_msg = Message(
        conversation_id=conversation.id,
        sender_id=None,
        sender_type=MessageSenderType.AI,
        message_type=MessageType.TEXT,
        content=step["message_text"] or "How can we assist you with this?",
        is_internal=False,
        delivery_status="delivered",
        ai_metadata=ai_metadata,
    )
    db.add(bot_msg)

    # Check if this step requires escalation or handoff
    if step.get("step_type") in ("handoff", "escalate"):
        from app.services.assignment_service import assign_conversation_to_agent
        from app.services.conversation_service import record_system_event
        conversation.status = ConversationStatus.PENDING
        record_system_event(db, conversation, f"Bot flow step '{step['step_key']}' triggered escalation to human support")
        assign_conversation_to_agent(db, conversation)

    db.commit()
    db.refresh(bot_msg)
    logger.info("Bot flow triggered step '%s' for conversation %d", target_step_key, conversation.id)
    return bot_msg
