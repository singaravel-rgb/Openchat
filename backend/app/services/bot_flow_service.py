import json
import logging
from sqlalchemy.orm import Session
from app.models.bot_flow import BotFlow, BotFlowStep, BotFlowIssue
from app.models.user import User

logger = logging.getLogger(__name__)

DEFAULT_ISSUES = [
    {
        "title": "📦 Order or Booking",
        "description": "Track, modify, or question about orders and bookings",
        "start_step_key": "order_help",
        "sort_order": 1,
    },
    {
        "title": "💳 Payment and Billing",
        "description": "Invoices, payment issues, charges, and payment methods",
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
        "title": "🛠️ Technical Support",
        "description": "App issues, website problems, login difficulties",
        "start_step_key": "tech_help",
        "sort_order": 4,
    },
    {
        "title": "👤 Account Assistance",
        "description": "Profile details, password reset, security settings",
        "start_step_key": "account_help",
        "sort_order": 5,
    },
]

DEFAULT_STEPS = [
    {
        "step_key": "order_help",
        "step_type": "question",
        "message_text": "For Order or Booking: You can view real-time shipping updates or modify your reservation. How can we help with your order?",
        "options": json.dumps([
            {"label": "Track order status", "value": "Track my order status", "next_step_key": "track_order"},
            {"label": "Modify booking details", "value": "Modify my booking details", "next_step_key": "modify_booking"},
            {"label": "Report delivery delay", "value": "My order delivery is delayed", "next_step_key": "delivery_delay"},
        ]),
        "next_step_key": None,
        "is_terminal": False,
        "sort_order": 1,
    },
    {
        "step_key": "track_order",
        "step_type": "message",
        "message_text": "Please provide your Order ID or tracking reference, and our support bot will verify the shipping status right away.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 2,
    },
    {
        "step_key": "modify_booking",
        "step_type": "message",
        "message_text": "Modifications can be made up to 24 hours prior to service. Reply with your Booking Reference number and requested changes.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 3,
    },
    {
        "step_key": "delivery_delay",
        "step_type": "message",
        "message_text": "We apologize for the delivery delay. Please send your Order ID so our fulfillment team can prioritize your shipment.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 4,
    },
    {
        "step_key": "billing_help",
        "step_type": "question",
        "message_text": "For Payment and Billing: All receipts are emailed automatically. What billing question do you have?",
        "options": json.dumps([
            {"label": "Download tax invoice", "value": "How do I download a tax invoice?", "next_step_key": "invoice_help"},
            {"label": "Payment debited but order unconfirmed", "value": "Payment debited but order not confirmed", "next_step_key": "payment_failure"},
            {"label": "Update payment method", "value": "How do I update my payment method?", "next_step_key": "update_payment"},
        ]),
        "next_step_key": None,
        "is_terminal": False,
        "sort_order": 5,
    },
    {
        "step_key": "invoice_help",
        "step_type": "message",
        "message_text": "Invoices can be downloaded from your Account Dashboard under Billing History. If you require GST/VAT invoices, enter your tax registration number here.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 6,
    },
    {
        "step_key": "payment_failure",
        "step_type": "message",
        "message_text": "If money was deducted during a failed checkout, banks typically auto-refund within 3-5 business days. Reply with your bank transaction UTR/reference so we can confirm.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 7,
    },
    {
        "step_key": "update_payment",
        "step_type": "message",
        "message_text": "You can add or update credit/debit cards and UPI IDs in Settings > Payment Methods.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 8,
    },
    {
        "step_key": "refund_help",
        "step_type": "question",
        "message_text": "For Refunds and Cancellations: Standard returns are accepted within 30 days of receipt. What would you like to do?",
        "options": json.dumps([
            {"label": "Cancel my order", "value": "I want to cancel my order", "next_step_key": "cancel_info"},
            {"label": "Check refund status", "value": "Check my refund status", "next_step_key": "refund_status_info"},
        ]),
        "next_step_key": None,
        "is_terminal": False,
        "sort_order": 9,
    },
    {
        "step_key": "cancel_info",
        "step_type": "message",
        "message_text": "Orders can be cancelled anytime before dispatch. Reply with your Order ID and reason for cancellation to proceed.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 10,
    },
    {
        "step_key": "refund_status_info",
        "step_type": "message",
        "message_text": "Refunds are processed back to original source payment within 5-7 business days of return approval. Reply with your Refund/Return ID.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 11,
    },
    {
        "step_key": "tech_help",
        "step_type": "message",
        "message_text": "For Technical Support: Please describe the issue or error message you are seeing, and our support team or AI will diagnose it immediately.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 12,
    },
    {
        "step_key": "account_help",
        "step_type": "message",
        "message_text": "For Account Assistance: You can reset your password from the login page or update your contact details in Account Settings. Let us know what you need help with.",
        "options": None,
        "next_step_key": None,
        "is_terminal": True,
        "sort_order": 13,
    },
]


def seed_default_bot_flow(db: Session) -> BotFlow:
    """Ensure a default published bot flow exists with standard categories and steps."""
    flow = db.query(BotFlow).filter(BotFlow.is_default == True).first()  # noqa: E712
    if not flow:
        flow = db.query(BotFlow).filter(BotFlow.status == "published").first()
    if flow:
        return flow

    admin = db.query(User).filter(User.role.in_(["admin", "super_admin"])).first()
    flow = BotFlow(
        name="Standard Customer Support Flow",
        description="Default interactive customer triage and self-service menu with quick-replies",
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
    logger.info("Seeded default bot flow with %d issues and %d steps", len(DEFAULT_ISSUES), len(DEFAULT_STEPS))
    return flow


def get_active_bot_flow_data(db: Session) -> dict:
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

    return {
        "id": flow.id,
        "name": flow.name,
        "initial_greeting": flow.initial_greeting or "Hello! Welcome to OpenChat Support. How can we help you today?",
        "issues": [
            {
                "id": i.id,
                "title": i.title,
                "description": i.description,
                "start_step_key": i.start_step_key,
                "sort_order": i.sort_order,
            }
            for i in issues
        ],
        "steps": {
            s.step_key: {
                "id": s.id,
                "step_key": s.step_key,
                "step_type": s.step_type,
                "message_text": s.message_text,
                "options": json.loads(s.options) if s.options else None,
                "next_step_key": s.next_step_key,
                "is_terminal": s.is_terminal,
            }
            for s in steps
        },
    }
