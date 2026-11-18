import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.main import app  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.conversation import Conversation, ConversationLink  # noqa: E402
from app.models.message import Message  # noqa: E402
from app.models.agent_profile import AgentProfile  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.core.enums import ConversationStatus  # noqa: E402

client = TestClient(app)


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
            db.refresh(profile)
        else:
            profile.is_available = True
            profile.max_conversations = 100
            profile.is_approved = True
            db.commit()
    return u


def _login(email, password="password123"):
    r = client.post("/api/v1/auth/login", data={"username": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_link_and_unlink_conversations():
    db = SessionLocal()
    try:
        agent = _get_or_create_user(db, "link_agent@test.com", "agent", "Laura Vance")
        cust = _get_or_create_user(db, "link_cust@test.com", "customer", "Lucas Gray")

        # Create two conversations
        conv1 = Conversation(customer_id=cust.id, subject="First Issue", status=ConversationStatus.PENDING)
        conv2 = Conversation(customer_id=cust.id, subject="Second Issue", status=ConversationStatus.PENDING)
        db.add_all([conv1, conv2])
        db.commit()
        db.refresh(conv1)
        db.refresh(conv2)

        token = _login("link_agent@test.com")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Link them
        r = client.post(
            f"/api/v1/agent/conversations/{conv1.id}/link",
            json={"target_conversation_id": conv2.id},
            headers=headers,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["conversation_id_1"] == min(conv1.id, conv2.id)
        assert data["conversation_id_2"] == max(conv1.id, conv2.id)

        # 2. Cannot link to self
        r_self = client.post(
            f"/api/v1/agent/conversations/{conv1.id}/link",
            json={"target_conversation_id": conv1.id},
            headers=headers,
        )
        assert r_self.status_code == 400

        # 3. Duplicate link rejected
        r_dup = client.post(
            f"/api/v1/agent/conversations/{conv1.id}/link",
            json={"target_conversation_id": conv2.id},
            headers=headers,
        )
        assert r_dup.status_code == 409

        # 4. List links
        r_list = client.get(f"/api/v1/agent/conversations/{conv1.id}/links", headers=headers)
        assert r_list.status_code == 200
        links = r_list.json()
        assert len(links) >= 1
        assert any(l["linked_conversation_id"] == conv2.id for l in links)

        # 5. Detail includes linked conversations
        r_detail = client.get(f"/api/v1/agent/conversations/{conv1.id}", headers=headers)
        assert r_detail.status_code == 200
        detail = r_detail.json()
        assert "linked_conversations" in detail
        assert any(l["linked_conversation_id"] == conv2.id for l in detail["linked_conversations"])

        # 6. Unlink
        r_unlink = client.delete(f"/api/v1/agent/conversations/{conv1.id}/link/{conv2.id}", headers=headers)
        assert r_unlink.status_code == 200

        # Verify links list is now empty for this pair
        r_list2 = client.get(f"/api/v1/agent/conversations/{conv1.id}/links", headers=headers)
        assert not any(l["linked_conversation_id"] == conv2.id for l in r_list2.json())
    finally:
        db.close()


def test_merge_conversations_same_customer():
    db = SessionLocal()
    try:
        agent = _get_or_create_user(db, "merge_agent@test.com", "agent", "Marcus Reed")
        cust = _get_or_create_user(db, "merge_cust@test.com", "customer", "Morgan Bailey")

        # Source conversation with messages
        conv_src = Conversation(customer_id=cust.id, subject="Duplicate Issue", status=ConversationStatus.PENDING)
        conv_dst = Conversation(customer_id=cust.id, subject="Primary Issue", status=ConversationStatus.PENDING)
        db.add_all([conv_src, conv_dst])
        db.commit()
        db.refresh(conv_src)
        db.refresh(conv_dst)

        msg1 = Message(
            conversation_id=conv_src.id,
            sender_id=cust.id,
            sender_type="customer",
            content="Hello from duplicate ticket",
        )
        msg2 = Message(
            conversation_id=conv_dst.id,
            sender_id=cust.id,
            sender_type="customer",
            content="Hello from main ticket",
        )
        db.add_all([msg1, msg2])
        db.commit()
        db.refresh(msg1)

        token = _login("merge_agent@test.com")
        headers = {"Authorization": f"Bearer {token}"}

        # Cannot merge into self
        r_self = client.post(
            f"/api/v1/agent/conversations/{conv_src.id}/merge",
            json={"target_conversation_id": conv_src.id},
            headers=headers,
        )
        assert r_self.status_code == 400

        # Merge source into destination
        r_merge = client.post(
            f"/api/v1/agent/conversations/{conv_src.id}/merge",
            json={"target_conversation_id": conv_dst.id},
            headers=headers,
        )
        assert r_merge.status_code == 200, r_merge.text
        merged_detail = r_merge.json()
        assert merged_detail["id"] == conv_dst.id

        # Verify source conversation is marked as merged
        db.refresh(conv_src)
        assert conv_src.status == ConversationStatus.MERGED
        assert conv_src.merged_into_id == conv_dst.id

        # Verify msg1 was moved to destination with original_conversation_id preserved
        db.refresh(msg1)
        assert msg1.conversation_id == conv_dst.id
        assert msg1.original_conversation_id == conv_src.id

        # Destination messages include both messages
        msg_contents = [m["content"] for m in merged_detail["messages"]]
        assert "Hello from duplicate ticket" in msg_contents
        assert "Hello from main ticket" in msg_contents

        # Cannot merge again from already merged conversation
        r_again = client.post(
            f"/api/v1/agent/conversations/{conv_src.id}/merge",
            json={"target_conversation_id": conv_dst.id},
            headers=headers,
        )
        assert r_again.status_code == 400
    finally:
        db.close()


def test_merge_conversations_cross_customer_requires_admin():
    db = SessionLocal()
    try:
        agent = _get_or_create_user(db, "cross_agent@test.com", "agent", "Chloe Adams")
        admin = _get_or_create_user(db, "cross_admin@test.com", "admin", "Claire Anderson")
        cust1 = _get_or_create_user(db, "cust_alpha@test.com", "customer", "Alpha Customer")
        cust2 = _get_or_create_user(db, "cust_beta@test.com", "customer", "Beta Customer")

        conv_alpha = Conversation(customer_id=cust1.id, subject="Alpha Issue", status=ConversationStatus.PENDING)
        conv_beta = Conversation(customer_id=cust2.id, subject="Beta Issue", status=ConversationStatus.PENDING)
        db.add_all([conv_alpha, conv_beta])
        db.commit()
        db.refresh(conv_alpha)
        db.refresh(conv_beta)

        agent_token = _login("cross_agent@test.com")
        admin_token = _login("cross_admin@test.com")

        # Regular agent cannot perform cross-customer merge
        r_agent = client.post(
            f"/api/v1/agent/conversations/{conv_alpha.id}/merge",
            json={"target_conversation_id": conv_beta.id, "confirm_cross_customer": True},
            headers={"Authorization": f"Bearer {agent_token}"},
        )
        assert r_agent.status_code == 403

        # Admin without explicit confirmation fails with 400
        r_unconfirmed = client.post(
            f"/api/v1/agent/conversations/{conv_alpha.id}/merge",
            json={"target_conversation_id": conv_beta.id, "confirm_cross_customer": False},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r_unconfirmed.status_code == 400

        # Admin with confirmation succeeds
        r_ok = client.post(
            f"/api/v1/agent/conversations/{conv_alpha.id}/merge",
            json={"target_conversation_id": conv_beta.id, "confirm_cross_customer": True},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r_ok.status_code == 200
        db.refresh(conv_alpha)
        assert conv_alpha.status == ConversationStatus.MERGED
        assert conv_alpha.merged_into_id == conv_beta.id
    finally:
        db.close()

