import sys
import re
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
from app.models.notification import Notification, NotificationType  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
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
        u.role = role
        db.commit()
    if role in ("agent", "admin", "super_admin"):
        profile = db.query(AgentProfile).filter(AgentProfile.user_id == u.id).first()
        if not profile:
            profile = AgentProfile(user_id=u.id, is_available=True, max_conversations=5, active_conversations=0, is_approved=True)
            db.add(profile)
            db.commit()
            db.refresh(profile)
        else:
            profile.is_available = True
            profile.is_approved = True
            db.commit()
    return u


def _login(email, password="password123"):
    r = client.post("/api/v1/auth/login", data={"username": email, "password": password})
    assert r.status_code == 200, f"Login failed for {email}: {r.text}"
    return r.json()["access_token"]


def test_unique_chat_id_generation_and_persistence():
    db = SessionLocal()
    try:
        cust = _get_or_create_user(db, "chatid.customer@test.com", "customer", "ChatID Customer")
        agent = _get_or_create_user(db, "chatid.agent@test.com", "agent", "ChatID Agent")
        c_token = _login("chatid.customer@test.com")
        a_token = _login("chatid.agent@test.com")

        # 1. Create conversation via Customer API
        res = client.post(
            "/api/v1/conversations",
            json={"subject": "Billing issue ChatID", "channel": "website", "priority": "normal"},
            headers={"Authorization": f"Bearer {c_token}"},
        )
        assert res.status_code == 201, res.text
        conv_data = res.json()
        assert "chat_id" in conv_data
        chat_id = conv_data["chat_id"]
        assert chat_id is not None
        assert re.match(r"^OC-\d{4}-\d{6}$", chat_id), f"Chat ID {chat_id} did not match OC-YYYY-XXXXXX pattern"

        conv_id = conv_data["id"]

        # 2. Verify chat_id is in conversation detail
        detail_res = client.get(f"/api/v1/agent/conversations/{conv_id}", headers={"Authorization": f"Bearer {a_token}"})
        assert detail_res.status_code == 200
        assert detail_res.json()["chat_id"] == chat_id

        # 3. Verify chat_id is in conversation list
        list_res = client.get("/api/v1/agent/conversations?queue=inbox", headers={"Authorization": f"Bearer {a_token}"})
        assert list_res.status_code == 200
        found = [c for c in list_res.json() if c["id"] == conv_id]
        assert len(found) == 1
        assert found[0]["chat_id"] == chat_id

        # 4. Take/assign and resolve - verify chat_id never changes
        client.post(f"/api/v1/agent/conversations/{conv_id}/take", headers={"Authorization": f"Bearer {a_token}"})
        db.expire_all()
        conv_db = db.query(Conversation).filter(Conversation.id == conv_id).first()
        assert conv_db.chat_id == chat_id

        client.post(f"/api/v1/agent/conversations/{conv_id}/resolve", json={"resolution_details": "Resolved"}, headers={"Authorization": f"Bearer {a_token}"})
        db.expire_all()
        conv_db = db.query(Conversation).filter(Conversation.id == conv_id).first()
        assert conv_db.chat_id == chat_id
    finally:
        db.close()


def test_global_search_by_chat_id_and_merged_reference():
    db = SessionLocal()
    try:
        cust1 = _get_or_create_user(db, "search.cust1@test.com", "customer", "Alpha Customer")
        cust2 = _get_or_create_user(db, "search.cust2@test.com", "customer", "Beta Customer")
        admin = _get_or_create_user(db, "search.admin@test.com", "admin", "Search Admin")
        c1_token = _login("search.cust1@test.com")
        c2_token = _login("search.cust2@test.com")
        adm_token = _login("search.admin@test.com")

        # Create two conversations
        r1 = client.post("/api/v1/conversations", json={"subject": "Alpha ticket", "channel": "website"}, headers={"Authorization": f"Bearer {c1_token}"})
        c1 = r1.json()
        r2 = client.post("/api/v1/conversations", json={"subject": "Beta ticket", "channel": "website"}, headers={"Authorization": f"Bearer {c2_token}"})
        c2 = r2.json()

        # 1. Search by exact chat_id
        search_res = client.get(f"/api/v1/agent/conversations?q={c1['chat_id']}", headers={"Authorization": f"Bearer {adm_token}"})
        assert search_res.status_code == 200
        items = search_res.json()
        assert any(i["id"] == c1["id"] for i in items)

        # 2. Search by partial chat_id (e.g. sequence number)
        seq_part = c1["chat_id"].split("-")[-1]
        search_partial = client.get(f"/api/v1/agent/conversations?q={seq_part}", headers={"Authorization": f"Bearer {adm_token}"})
        assert search_partial.status_code == 200
        assert any(i["id"] == c1["id"] for i in search_partial.json())

        # 3. Search by customer email and name
        search_email = client.get("/api/v1/agent/conversations?q=search.cust1@test.com", headers={"Authorization": f"Bearer {adm_token}"})
        assert search_email.status_code == 200
        assert any(i["id"] == c1["id"] for i in search_email.json())

        search_name = client.get("/api/v1/agent/conversations?q=Beta%20Customer", headers={"Authorization": f"Bearer {adm_token}"})
        assert search_name.status_code == 200
        assert any(i["id"] == c2["id"] for i in search_name.json())

        # 4. Merge c2 into c1 (cross customer requires admin confirm)
        merge_res = client.post(
            f"/api/v1/agent/conversations/{c2['id']}/merge",
            json={"target_conversation_id": c1["id"], "confirm_cross_customer": True},
            headers={"Authorization": f"Bearer {adm_token}"},
        )
        assert merge_res.status_code == 200

        # Searching for secondary chat_id returns the primary conversation c1
        search_merged = client.get(f"/api/v1/agent/conversations?q={c2['chat_id']}", headers={"Authorization": f"Bearer {adm_token}"})
        assert search_merged.status_code == 200
        merged_results = search_merged.json()
        # Primary ticket c1 should be in the results!
        assert any(i["id"] == c1["id"] for i in merged_results), f"Primary conversation {c1['id']} not returned when searching for merged chat_id {c2['chat_id']}"
    finally:
        db.close()


def test_agent_to_agent_reassignment():
    db = SessionLocal()
    try:
        agent1 = _get_or_create_user(db, "transfer.agent1@test.com", "agent", "Agent One")
        agent2 = _get_or_create_user(db, "transfer.agent2@test.com", "agent", "Agent Two")
        cust = _get_or_create_user(db, "transfer.cust@test.com", "customer", "Transfer Customer")
        a1_token = _login("transfer.agent1@test.com")
        a2_token = _login("transfer.agent2@test.com")
        c_token = _login("transfer.cust@test.com")

        # Customer creates conversation
        r = client.post("/api/v1/conversations", json={"subject": "Transfer test ticket"}, headers={"Authorization": f"Bearer {c_token}"})
        conv_id = r.json()["id"]

        # Agent 1 takes it
        client.post(f"/api/v1/agent/conversations/{conv_id}/take", headers={"Authorization": f"Bearer {a1_token}"})

        # Agent 1 reassigns to Agent 2 with a note
        reassign_res = client.post(
            f"/api/v1/agent/conversations/{conv_id}/assign",
            json={"agent_id": agent2.id, "note": "Handling network configuration for customer"},
            headers={"Authorization": f"Bearer {a1_token}"},
        )
        assert reassign_res.status_code == 200, reassign_res.text

        # Verify DB state
        db.expire_all()
        conv_db = db.query(Conversation).filter(Conversation.id == conv_id).first()
        assert conv_db.assigned_agent_id == agent2.id

        # Verify assignment history
        history = conv_db.assignment_history
        assert len(history) >= 2
        last_h = history[-1]
        assert last_h["to_agent_id"] == agent2.id
        assert last_h["from_agent_id"] == agent1.id
        assert last_h["note"] == "Handling network configuration for customer"

        # Verify notification dispatched to agent2
        notif = (
            db.query(Notification)
            .filter(Notification.user_id == agent2.id, Notification.type == NotificationType.CONVERSATION_ASSIGNED)
            .order_by(Notification.created_at.desc())
            .first()
        )
        assert notif is not None
        assert str(conv_id) in notif.message or (conv_db.chat_id and conv_db.chat_id in notif.message)

        # Unassigned third agent cannot reassign this conversation to another agent (403)
        agent3 = _get_or_create_user(db, "transfer.agent3@test.com", "agent", "Agent Three")
        a3_token = _login("transfer.agent3@test.com")
        unauth_reassign = client.post(
            f"/api/v1/agent/conversations/{conv_id}/assign",
            json={"agent_id": agent1.id},
            headers={"Authorization": f"Bearer {a3_token}"},
        )
        assert unauth_reassign.status_code == 403

        # Nor can third agent take/self-assign a conversation already assigned to agent2 (409)
        unauth_take = client.post(
            f"/api/v1/agent/conversations/{conv_id}/assign",
            json={"agent_id": agent3.id},
            headers={"Authorization": f"Bearer {a3_token}"},
        )
        assert unauth_take.status_code == 409
    finally:
        db.close()


def test_delete_conversation_cascade_and_rbac():
    db = SessionLocal()
    try:
        cust = _get_or_create_user(db, "del.cust@test.com", "customer", "Delete Cust")
        agent = _get_or_create_user(db, "del.agent@test.com", "agent", "Delete Agent")
        admin = _get_or_create_user(db, "del.admin@test.com", "admin", "Delete Admin")
        superadmin = _get_or_create_user(db, "del.superadmin@test.com", "super_admin", "Delete SuperAdmin")

        c_token = _login("del.cust@test.com")
        a_token = _login("del.agent@test.com")
        adm_token = _login("del.admin@test.com")
        sa_token = _login("del.superadmin@test.com")

        # 1. Create conversation with messages and notes
        r = client.post("/api/v1/conversations", json={"subject": "Delete test conversation"}, headers={"Authorization": f"Bearer {c_token}"})
        conv_id = r.json()["id"]
        chat_id = r.json()["chat_id"]

        # Add message & internal note
        client.post(f"/api/v1/conversations/{conv_id}/messages", json={"content": "Help me!"}, headers={"Authorization": f"Bearer {c_token}"})
        client.post(f"/api/v1/agent/conversations/{conv_id}/messages", json={"content": "Agent note", "is_internal": True}, headers={"Authorization": f"Bearer {a_token}"})

        # 2. Agent tries to delete -> 403 Forbidden
        del_agent = client.delete(f"/api/v1/conversations/{conv_id}", headers={"Authorization": f"Bearer {a_token}"})
        assert del_agent.status_code == 403

        # Customer tries to delete -> 403 Forbidden
        del_cust = client.delete(f"/api/v1/conversations/{conv_id}", headers={"Authorization": f"Bearer {c_token}"})
        assert del_cust.status_code == 403

        # 3. Super Admin deletes conversation -> 200 OK
        del_sa = client.delete(f"/api/v1/admin/conversations/{conv_id}", headers={"Authorization": f"Bearer {sa_token}"})
        assert del_sa.status_code == 200, del_sa.text

        # 4. Verify DB: Conversation, messages are deleted
        db.expire_all()
        assert db.query(Conversation).filter(Conversation.id == conv_id).first() is None
        assert db.query(Message).filter(Message.conversation_id == conv_id).count() == 0

        # 5. Verify audit log entry exists
        audit = db.query(AuditLog).filter(AuditLog.action == "conversation.delete", AuditLog.resource_id == conv_id).first()
        assert audit is not None
        assert audit.user_id == superadmin.id
        assert chat_id in audit.details
    finally:
        db.close()
