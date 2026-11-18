import asyncio
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# ensure backend on path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.main import app  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.conversation import Conversation  # noqa: E402
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
        active = db.query(Conversation).filter(
            Conversation.assigned_agent_id == u.id,
            Conversation.status.in_([ConversationStatus.ASSIGNED, ConversationStatus.AI_HANDLING]),
        ).count()
        profile.active_conversations = active
        db.commit()
    return u


def _login(email, password="password123"):
    r = client.post("/api/v1/auth/login", data={"username": email, "password": password})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def seeded_users():
    db = SessionLocal()
    try:
        c = _get_or_create_user(db, "phase1_customer@example.com", "customer", "Phase1 Customer")
        a = _get_or_create_user(db, "phase1_agent@example.com", "agent", "Phase1 Agent")
        ad = _get_or_create_user(db, "phase1_admin@example.com", "admin", "Phase1 Admin")
        return {"customer": c, "agent": a, "admin": ad}
    finally:
        db.close()


def test_conversation_creation_and_visibility(seeded_users):
    cust_h = _login("phase1_customer@example.com")
    agent_h = _login("phase1_agent@example.com")
    admin_h = _login("phase1_admin@example.com")

    r = client.post("/api/v1/conversations", json={"subject": "Phase1 Test", "priority": "high", "tags": ["billing"]}, headers=cust_h)
    assert r.status_code == 201, r.text
    conv = r.json()
    cid = conv["id"]
    assert conv["status"] in ("ai_handling", "pending", "assigned")

    # customer can see
    r = client.get(f"/api/v1/conversations/{cid}", headers=cust_h)
    assert r.status_code == 200
    # agent/admin can see (queue/admin scope)
    r = client.get(f"/api/v1/agent/conversations/{cid}", headers=agent_h)
    assert r.status_code == 200
    r = client.get(f"/api/v1/admin/conversations/{cid}", headers=admin_h)
    assert r.status_code == 200

    # other customer cannot see
    db = SessionLocal()
    try:
        other = _get_or_create_user(db, "phase1_other@example.com", "customer", "Other")
    finally:
        db.close()
    other_h = _login("phase1_other@example.com")
    r = client.get(f"/api/v1/conversations/{cid}", headers=other_h)
    assert r.status_code in (403, 404)


def test_customer_message_and_idempotency(seeded_users):
    cust_h = _login("phase1_customer@example.com")
    r = client.post("/api/v1/conversations", json={"subject": "Idempotency"}, headers=cust_h)
    assert r.status_code == 201
    cid = r.json()["id"]
    payload = {"content": "hello there", "client_message_id": "idem-123"}
    r1 = client.post(f"/api/v1/conversations/{cid}/messages", json=payload, headers=cust_h)
    assert r1.status_code == 201, r1.text
    r2 = client.post(f"/api/v1/conversations/{cid}/messages", json=payload, headers=cust_h)
    assert r2.status_code == 201, r2.text
    assert r1.json()["id"] == r2.json()["id"]
    # conversation should have messages including AI/system possibly
    r = client.get(f"/api/v1/conversations/{cid}", headers=cust_h)
    assert r.status_code == 200
    msgs = r.json()["messages"]
    assert any(m.get("client_message_id") == "idem-123" for m in msgs)


def test_internal_note_privacy(seeded_users):
    cust_h = _login("phase1_customer@example.com")
    agent_h = _login("phase1_agent@example.com")
    r = client.post("/api/v1/conversations", json={"subject": "Internal Note"}, headers=cust_h)
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    # take as agent
    r = client.post(f"/api/v1/agent/conversations/{cid}/take", headers=agent_h)
    assert r.status_code == 200, r.text
    r = client.post(f"/api/v1/agent/conversations/{cid}/messages", json={"content": "secret note", "is_internal": True}, headers=agent_h)
    assert r.status_code == 200, r.text
    note_id = r.json()["id"]
    # agent sees
    r = client.get(f"/api/v1/agent/conversations/{cid}", headers=agent_h)
    assert any(m["id"] == note_id and m["is_internal"] for m in r.json()["messages"])
    # customer must not see
    r = client.get(f"/api/v1/conversations/{cid}", headers=cust_h)
    assert all(m["id"] != note_id for m in r.json()["messages"])


def test_resolve_reopen_and_customer_reopen(seeded_users):
    cust_h = _login("phase1_customer@example.com")
    agent_h = _login("phase1_agent@example.com")
    r = client.post("/api/v1/conversations", json={"subject": "Resolve Reopen"}, headers=cust_h)
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    r = client.post(f"/api/v1/agent/conversations/{cid}/take", headers=agent_h)
    assert r.status_code == 200, r.text
    r = client.post(f"/api/v1/agent/conversations/{cid}/resolve", json={"resolution_details": "done"}, headers=agent_h)
    assert r.status_code == 200, r.text
    r = client.get(f"/api/v1/conversations/{cid}", headers=cust_h)
    assert r.json()["status"] == "resolved"
    # customer can reopen resolved
    r = client.post(f"/api/v1/conversations/{cid}/reopen", headers=cust_h)
    assert r.status_code == 200, r.text
    r = client.get(f"/api/v1/conversations/{cid}", headers=cust_h)
    assert r.json()["status"] in ("assigned", "pending", "ai_handling")


def test_admin_update_assign_status(seeded_users):
    admin_h = _login("phase1_admin@example.com")
    cust_h = _login("phase1_customer@example.com")
    r = client.post("/api/v1/conversations", json={"subject": "Admin Ops"}, headers=cust_h)
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    # update properties
    r = client.patch(f"/api/v1/admin/conversations/{cid}", json={"priority": "urgent", "tags": ["vip", "phase1"], "subject": "Admin Ops Updated"}, headers=admin_h)
    assert r.status_code == 200, r.text
    r = client.get(f"/api/v1/admin/conversations/{cid}", headers=admin_h)
    assert r.json()["priority"] == "urgent"
    assert "vip" in (r.json().get("tags") or [])
