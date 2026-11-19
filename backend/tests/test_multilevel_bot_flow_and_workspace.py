import pytest
from app.services.ai_service import clean_customer_facing_text, get_natural_escalation_message
from app.services.bot_flow_service import DEFAULT_ISSUES, DEFAULT_STEPS, get_active_bot_flow_data
from app.db.session import SessionLocal
from app.models.user import User
from app.services.conversation_service import list_conversations_query
from app.core.enums import ConversationStatus


def test_natural_escalation_messages_cleanup():
    # Verify that internal technical classification is cleaned
    text1 = "This request involves a sensitive or account-specific action that requires human assistance. I'm connecting you with a support agent now."
    cleaned1 = clean_customer_facing_text(text1)
    assert "sensitive or account-specific action" not in cleaned1
    assert "requires human assistance" not in cleaned1
    assert "support team" in cleaned1 or "help" in cleaned1

    text2 = "I don't have enough verified information in my current knowledge base regarding orders or bookings [Source: verified knowledge context]."
    cleaned2 = clean_customer_facing_text(text2)
    assert "[Source" not in cleaned2
    assert "knowledge base" not in cleaned2


def test_multilevel_bot_flow_hierarchy():
    # Verify Level 1 issues exist
    issue_keys = {i["start_step_key"] for i in DEFAULT_ISSUES}
    assert "order_help" in issue_keys
    assert "billing_help" in issue_keys
    assert "refund_help" in issue_keys

    # Verify Level 2 Order step has Level 3 options (Track my order -> track_order)
    order_step = next(s for s in DEFAULT_STEPS if s["step_key"] == "order_help")
    assert order_step["step_type"] == "question"
    assert "track_order" in order_step["options"]

    # Verify Level 3 Track order step has Level 4 options (Enter order ID -> track_order_id)
    track_step = next(s for s in DEFAULT_STEPS if s["step_key"] == "track_order")
    assert track_step["step_type"] == "question"
    assert "track_order_id" in track_step["options"]
    assert "track_order_email" in track_step["options"]

    # Verify Level 4 input step
    track_id_step = next(s for s in DEFAULT_STEPS if s["step_key"] == "track_order_id")
    assert track_id_step["is_terminal"] is True


def test_default_conversation_view_excludes_resolved():
    db = SessionLocal()
    try:
        admin_user = db.query(User).filter(User.role.in_(["admin", "super_admin"])).first()
        if not admin_user:
            pytest.skip("No admin user in database")

        # Default query (no status_filter, no q)
        unresolved_items, _ = list_conversations_query(db, viewer=admin_user)
        for conv in unresolved_items:
            assert conv.status not in (ConversationStatus.RESOLVED, ConversationStatus.CLOSED), (
                f"Resolved/closed conversation {conv.id} should not be in default view"
            )

        # Explicit resolved query
        resolved_items, _ = list_conversations_query(db, viewer=admin_user, status_filter="resolved")
        for conv in resolved_items:
            assert conv.status in (ConversationStatus.RESOLVED, ConversationStatus.CLOSED)
    finally:
        db.close()
