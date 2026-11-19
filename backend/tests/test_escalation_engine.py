import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.db.session import SessionLocal
from app.core.enums import ConversationStatus, MessageSenderType, MessageType
from app.models.agent_profile import AgentProfile
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.notification import Notification, NotificationType
from app.models.user import User
from app.services.escalation_service import check_response_deadlines_and_escalate


def test_first_response_warning_and_auto_escalation():
    db = SessionLocal()
    try:
        ts = int(datetime.now(timezone.utc).timestamp())
        agent1 = User(email=f"agent1_{ts}@test.io", password_hash="dummy", role="agent", full_name="Agent One", is_active=True)
        agent2 = User(email=f"agent2_{ts}@test.io", password_hash="dummy", role="agent", full_name="Agent Two", is_active=True)
        customer = User(email=f"cust_{ts}@test.io", password_hash="dummy", role="customer", full_name="Test Customer", is_active=True)
        db.add_all([agent1, agent2, customer])
        db.commit()

        p1 = AgentProfile(user_id=agent1.id, is_available=True, max_conversations=5, active_conversations=1)
        p2 = AgentProfile(user_id=agent2.id, is_available=True, max_conversations=5, active_conversations=0)
        db.add_all([p1, p2])
        db.commit()

        conv = Conversation(
            chat_id=f"OC-2026-{ts % 1000000:06d}",
            customer_id=customer.id,
            assigned_agent_id=agent1.id,
            status=ConversationStatus.ASSIGNED,
        )
        db.add(conv)
        db.commit()

        now = datetime.now(timezone.utc)
        msg1 = Message(
            conversation_id=conv.id,
            sender_id=customer.id,
            sender_type=MessageSenderType.CUSTOMER,
            message_type=MessageType.TEXT,
            content="Hello, I need urgent help!",
            is_internal=False,
            delivery_status="delivered",
            created_at=now - timedelta(seconds=10),
        )
        db.add(msg1)
        db.commit()

        # 1. Run escalation check (customer message 10s old -> exceeds 5s warning threshold)
        res = check_response_deadlines_and_escalate(db)
        assert res["warnings_issued"] >= 1

        notif = db.query(Notification).filter(
            Notification.user_id == agent1.id,
            Notification.type == NotificationType.SLA_WARNING,
            Notification.reference_id == conv.id,
        ).first()
        assert notif is not None
        assert "Response overdue" in notif.title

        # 2. Advance time past 30s escalation threshold (35s old)
        msg1.created_at = now - timedelta(seconds=35)
        db.commit()

        res2 = check_response_deadlines_and_escalate(db)
        assert res2["reassignments"] >= 1

        db.refresh(conv)
        assert conv.assigned_agent_id is not None
        assert conv.assigned_agent_id != agent1.id
        assert conv.status == ConversationStatus.ASSIGNED

        history = conv.assignment_history or []
        assert any(h.get("type") == "auto_escalated_reassignment" and h.get("from_agent_id") == agent1.id for h in history)
    finally:
        db.close()
