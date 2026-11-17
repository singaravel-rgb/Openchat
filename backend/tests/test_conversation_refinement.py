import time
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import SessionLocal
from app.models.user import User
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.agent_profile import AgentProfile
from app.core.enums import ConversationStatus, MessageSenderType
from app.core.security import hash_password


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _get_or_create_user(db, email, role, name, password="password123"):
    u = db.query(User).filter(User.email == email).first()
    if not u:
        u = User(email=email, full_name=name, role=role, is_active=True, password_hash=hash_password(password))
        db.add(u)
        db.commit()
        db.refresh(u)
    else:
        u.password_hash = hash_password(password)
        u.is_active = True
        db.commit()
    if role == "agent":
        profile = db.query(AgentProfile).filter(AgentProfile.user_id == u.id).first()
        if not profile:
            profile = AgentProfile(user_id=u.id, is_available=True, max_conversations=100, active_conversations=0, is_approved=True)
            db.add(profile)
            db.commit()
        else:
            profile.is_approved = True
            profile.is_available = True
            db.commit()
    return u


def _login(client, email, password="password123"):
    r = client.post("/api/v1/auth/login", data={"username": email, "password": password})
    assert r.status_code == 200, f"Login failed for {email}: {r.text}"
    token = r.json()["access_token"]
    return token


@pytest.fixture
def test_setup(client, db):
    admin = _get_or_create_user(db, "refine_admin@example.com", "admin", "Refine Admin")
    agent = _get_or_create_user(db, "refine_agent@example.com", "agent", "Refine Agent")
    customer = _get_or_create_user(db, "refine_customer@example.com", "customer", "Refine Customer")

    admin_token = _login(client, "refine_admin@example.com")
    agent_token = _login(client, "refine_agent@example.com")
    customer_token = _login(client, "refine_customer@example.com")

    return {
        "admin_token": admin_token,
        "agent_token": agent_token,
        "customer_token": customer_token,
        "admin": admin,
        "agent": agent,
        "customer": customer,
    }


def test_status_dropdown_transitions_and_persistence(client, test_setup, db):
    admin_token = test_setup["admin_token"]
    customer = test_setup["customer"]

    # Create a conversation
    conv = Conversation(
        customer_id=customer.id,
        subject="Status transition test",
        status=ConversationStatus.OPEN,
        channel="website",
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)

    statuses_to_test = ["waiting_on_customer", "on_hold", "pending", "open", "resolved"]
    for st in statuses_to_test:
        res = client.post(
            f"/api/v1/admin/conversations/{conv.id}/status",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"status": st},
        )
        assert res.status_code == 200, f"Failed to set status {st}: {res.text}"

        # Fetch detail and verify persistence
        detail_res = client.get(
            f"/api/v1/admin/conversations/{conv.id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert detail_res.status_code == 200
        assert detail_res.json()["status"] == st


def test_private_note_create_edit_and_privacy(client, test_setup, db):
    agent_token = test_setup["agent_token"]
    customer_token = test_setup["customer_token"]
    agent = test_setup["agent"]
    customer = test_setup["customer"]

    conv = Conversation(
        customer_id=customer.id,
        assigned_agent_id=agent.id,
        subject="Private note test",
        status=ConversationStatus.OPEN,
        channel="website",
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)

    # 1. Agent creates private note
    res = client.post(
        f"/api/v1/agent/conversations/{conv.id}/messages",
        headers={"Authorization": f"Bearer {agent_token}"},
        json={"content": "Internal note initial text", "is_internal": True},
    )
    assert res.status_code == 200, res.text
    msg = res.json()
    assert msg["is_internal"] is True
    msg_id = msg["id"]

    # 2. Customer views conversation - private note must NOT be visible
    cust_res = client.get(
        f"/api/v1/conversations/{conv.id}",
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert cust_res.status_code == 200
    cust_messages = cust_res.json()["messages"]
    assert all(m["id"] != msg_id for m in cust_messages), "Private note leaked to customer!"

    # 3. Agent edits the private note
    edit_res = client.patch(
        f"/api/v1/conversations/{conv.id}/messages/{msg_id}",
        headers={"Authorization": f"Bearer {agent_token}"},
        json={"content": "Internal note updated text"},
    )
    assert edit_res.status_code == 200, edit_res.text
    edited_msg = edit_res.json()
    assert edited_msg["content"] == "Internal note updated text"
    assert edited_msg["edited_at"] is not None
    assert edited_msg["edited_by_id"] == agent.id

    # 4. Check edit history stored in database
    db.expire_all()
    db_msg = db.query(Message).filter(Message.id == msg_id).first()
    assert db_msg.content == "Internal note updated text"
    assert len(db_msg.edit_history) == 1
    assert db_msg.edit_history[0]["content"] == "Internal note initial text"

    # 5. Customer cannot edit private note
    cust_edit_res = client.patch(
        f"/api/v1/conversations/{conv.id}/messages/{msg_id}",
        headers={"Authorization": f"Bearer {customer_token}"},
        json={"content": "Hacked edit"},
    )
    assert cust_edit_res.status_code == 403


def test_agent_message_undo_within_5_seconds_and_expiration(client, test_setup, db):
    agent_token = test_setup["agent_token"]
    customer_token = test_setup["customer_token"]
    agent = test_setup["agent"]
    customer = test_setup["customer"]

    conv = Conversation(
        customer_id=customer.id,
        assigned_agent_id=agent.id,
        subject="Undo test",
        status=ConversationStatus.OPEN,
        channel="website",
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)

    # 1. Agent sends a customer-facing message
    res = client.post(
        f"/api/v1/agent/conversations/{conv.id}/messages",
        headers={"Authorization": f"Bearer {agent_token}"},
        json={"content": "Quick typo message to retract", "is_internal": False},
    )
    assert res.status_code == 200, res.text
    msg = res.json()
    msg_id = msg["id"]

    # 2. Retract within 5s window
    retract_res = client.post(
        f"/api/v1/conversations/{conv.id}/messages/{msg_id}/retract",
        headers={"Authorization": f"Bearer {agent_token}"},
        json={},
    )
    assert retract_res.status_code == 200, retract_res.text
    assert retract_res.json()["message"] == "Message retracted successfully"

    # 3. Customer views conversation - retracted message MUST NOT be present
    cust_res = client.get(
        f"/api/v1/conversations/{conv.id}",
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert cust_res.status_code == 200
    cust_msgs = cust_res.json()["messages"]
    assert all(m["id"] != msg_id for m in cust_msgs), "Retracted message leaked to customer!"

    # 4. Agent views conversation - message is marked retracted
    agent_res = client.get(
        f"/api/v1/agent/conversations/{conv.id}",
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    assert agent_res.status_code == 200
    agent_msgs = agent_res.json()["messages"]
    retracted_m = next(m for m in agent_msgs if m["id"] == msg_id)
    assert retracted_m["is_retracted"] is True
    assert retracted_m["retracted_at"] is not None

    # 5. Cannot retract twice
    again_res = client.post(
        f"/api/v1/conversations/{conv.id}/messages/{msg_id}/retract",
        headers={"Authorization": f"Bearer {agent_token}"},
        json={},
    )
    assert again_res.status_code == 400
    assert "already been retracted" in again_res.json()["detail"]

    # 6. Test expiration (> 5 seconds)
    old_msg = Message(
        conversation_id=conv.id,
        sender_id=agent.id,
        sender_type=MessageSenderType.AGENT,
        content="Old message sent earlier",
        is_internal=False,
        created_at=datetime.now(timezone.utc) - timedelta(seconds=10),
    )
    db.add(old_msg)
    db.commit()
    db.refresh(old_msg)

    expired_res = client.post(
        f"/api/v1/conversations/{conv.id}/messages/{old_msg.id}/retract",
        headers={"Authorization": f"Bearer {agent_token}"},
        json={},
    )
    assert expired_res.status_code == 400
    assert "Undo window has expired" in expired_res.json()["detail"]
