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
from app.models.agent_profile import AgentProfile  # noqa: E402
from app.models.conversation import Conversation  # noqa: E402
from app.models.message import Message  # noqa: E402
from app.models.widget import WidgetConfig, WidgetSession  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.core.enums import ConversationStatus  # noqa: E402
from app.services.widget_service import rate_limit_for_request  # noqa: E402

client = TestClient(app)
EXTERNAL_ORIGIN = "https://external.example.com"
OTHER_ORIGIN = "https://evil.example.com"


def reset_rate_limits():
    from app.services.widget_service import _IN_MEMORY_BUCKETS
    _IN_MEMORY_BUCKETS.clear()
    try:
        from app.core.redis import redis_client
        for key in redis_client.scan_match("widget:*"):
            redis_client.delete(key)
    except Exception:
        pass


def _login(email, password="password123"):
    if email == "singaravel@vananam.com":
        password = "SuperAdminPassword2026!"
        db = SessionLocal()
        try:
            u = db.query(User).filter(User.email == email).first()
            if not u:
                u = User(
                    email=email,
                    full_name="Super Admin",
                    role="super_admin",
                    is_active=True,
                    password_hash=hash_password(password),
                )
                db.add(u)
                db.commit()
        finally:
            db.close()
    r = client.post("/api/v1/auth/login", data={"username": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _ensure_admin_config(allowed_domains=None, **kwargs):
    reset_rate_limits()
    admin_h = _login("singaravel@vananam.com")
    domains = list(allowed_domains) if allowed_domains is not None else []
    for d in ["http://localhost:8080", "http://127.0.0.1:8080"]:
        if d not in domains:
            domains.append(d)
    payload = {
        "widget_title": "OpenChat Test",
        "brand_name": "OpenChat",
        "primary_color": "#2563eb",
        "launcher_position": "bottom-right",
        "welcome_message": "Hi test",
        "greeting_text": "Start now",
        "widget_visibility": True,
        "allowed_domains": domains,
        "widget_availability": True,
        "hide_launcher_on_help_page": True,
        "show_agent_avatar": True,
        "require_email": False,
    }
    payload.update(kwargs)
    r = client.put("/api/v1/admin/widget/config", json=payload, headers=admin_h)
    assert r.status_code == 200, r.text
    return r.json()


def test_widget_admin_config_and_embed_snippet():
    cfg = _ensure_admin_config(allowed_domains=[EXTERNAL_ORIGIN], launcher_position="bottom-left", welcome_message="Hello from config")
    assert cfg["launcher_position"] == "bottom-left"
    assert cfg["welcome_message"] == "Hello from config"
    assert EXTERNAL_ORIGIN in cfg["allowed_domains"]
    admin_h = _login("singaravel@vananam.com")
    r = client.get("/api/v1/admin/widget/embed-snippet", headers=admin_h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "/api/v1/widget/embed.js" in data["script_url"]
    assert "<script" in data["snippet"]


def test_widget_public_config_origin_validation_and_embed_js():
    _ensure_admin_config(allowed_domains=[EXTERNAL_ORIGIN])
    # allowed origin
    r = client.get("/api/v1/widget/config", params={"page_url": EXTERNAL_ORIGIN + "/page"}, headers={"Origin": EXTERNAL_ORIGIN})
    assert r.status_code == 200, r.text
    assert r.json()["widget_title"]
    # disallowed origin
    r = client.get("/api/v1/widget/config", params={"page_url": OTHER_ORIGIN + "/page"}, headers={"Origin": OTHER_ORIGIN})
    assert r.status_code == 403
    # missing origin when configured
    r = client.get("/api/v1/widget/config")
    assert r.status_code == 403
    # embed script is served
    r = client.get("/api/v1/widget/embed.js")
    assert r.status_code == 200
    assert "application/javascript" in r.headers.get("content-type", "")
    assert "openchat_widget_session" in r.text
    assert "/api/v1/widget" in r.text


def test_widget_guest_session_create_restore_and_invalid_session():
    _ensure_admin_config(allowed_domains=[EXTERNAL_ORIGIN])
    headers = {"Origin": EXTERNAL_ORIGIN}
    r = client.post("/api/v1/widget/session", json={"guest_name": "Visitor", "page_url": EXTERNAL_ORIGIN + "/shop"}, headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["session_token"]
    assert data["is_guest"] is True
    token = data["session_token"]
    # restore/get session
    r = client.get("/api/v1/widget/session", headers={**headers, "X-Widget-Session": token})
    assert r.status_code == 200, r.text
    info = r.json()
    assert info["valid"] is True
    assert "conversations" in info
    r = client.post("/api/v1/widget/session/restore", headers={**headers, "X-Widget-Session": token})
    assert r.status_code == 200, r.text
    # invalid session rejected
    r = client.get("/api/v1/widget/session", headers={**headers, "X-Widget-Session": "bad-token"})
    assert r.status_code == 401
    # origin mismatch rejected even with token
    r = client.get("/api/v1/widget/session", headers={"Origin": OTHER_ORIGIN, "X-Widget-Session": token})
    assert r.status_code == 403


def test_widget_conversation_flow_ai_reply_handoff_idempotency_and_privacy():
    _ensure_admin_config(allowed_domains=[EXTERNAL_ORIGIN])
    # ensure an available agent exists for potential handoff assignment
    db = SessionLocal()
    try:
        agent = db.query(User).filter(User.email == "support.agent1@openchat.io").first()
        assert agent is not None
        profile = db.query(AgentProfile).filter(AgentProfile.user_id == agent.id).first()
        if profile:
            profile.is_available = True
            profile.max_conversations = 100
            profile.active_conversations = db.query(Conversation).filter(
                Conversation.assigned_agent_id == agent.id,
                Conversation.status.in_([ConversationStatus.ASSIGNED, ConversationStatus.AI_HANDLING]),
            ).count()
            profile.is_approved = True
            db.commit()
    finally:
        db.close()

    headers = {"Origin": EXTERNAL_ORIGIN}
    s = client.post("/api/v1/widget/session", json={"guest_name": "Flow User", "page_url": EXTERNAL_ORIGIN + "/"}, headers=headers).json()
    wh = {**headers, "X-Widget-Session": s["session_token"]}

    # start conversation with initial message -> AI handling/response expected
    r = client.post("/api/v1/widget/conversations", json={"subject": "Widget Help", "initial_message": "Hello, I need help", "client_message_id": "wconv-1"}, headers=wh)
    assert r.status_code == 201, r.text
    conv = r.json()
    cid = conv["id"]
    assert conv["status"] in ("ai_handling", "pending", "assigned")
    assert all(not m.get("is_internal", False) for m in conv.get("messages", []))
    senders = [m["sender_type"] for m in conv["messages"]]
    assert "customer" in senders
    assert any(st in ("ai", "system") for st in senders)

    # send message with idempotency
    payload = {"content": "More details please", "client_message_id": "wmsg-1"}
    r1 = client.post(f"/api/v1/widget/conversations/{cid}/messages", json=payload, headers=wh)
    assert r1.status_code == 201, r1.text
    r2 = client.post(f"/api/v1/widget/conversations/{cid}/messages", json=payload, headers=wh)
    assert r2.status_code == 201, r2.text
    assert r1.json()["id"] == r2.json()["id"]

    # request human handoff
    r = client.post(f"/api/v1/widget/conversations/{cid}/request-human", headers=wh)
    assert r.status_code == 200, r.text
    handoff = r.json()
    assert handoff["status"] in ("pending", "assigned")
    assert "message" in handoff

    # agent can reply; widget sees agent reply (no internals)
    agent_h = _login("support.agent1@openchat.io")
    admin_h = _login("singaravel@vananam.com")
    db = SessionLocal()
    try:
        agent_user = db.query(User).filter(User.email == "support.agent1@openchat.io").first()
        assert agent_user is not None
        agent_id = agent_user.id
    finally:
        db.close()
    # handoff may auto-assign to any available agent in shared demo data; ensure agent@demo.com owns it
    detail = client.get(f"/api/v1/agent/conversations/{cid}", headers=agent_h)
    if detail.status_code == 403:
        r = client.post(f"/api/v1/admin/conversations/{cid}/assign", json={"agent_id": agent_id}, headers=admin_h)
        assert r.status_code == 200, r.text
        detail = client.get(f"/api/v1/agent/conversations/{cid}", headers=agent_h)
    assert detail.status_code == 200, detail.text
    if detail.json().get("status") in ("pending", "ai_handling") and not detail.json().get("assigned_agent_id"):
        take = client.post(f"/api/v1/agent/conversations/{cid}/take", headers=agent_h)
        assert take.status_code == 200, take.text
    r = client.post(f"/api/v1/agent/conversations/{cid}/messages", json={"content": "public agent reply", "is_internal": False}, headers=agent_h)
    assert r.status_code == 200, r.text
    r = client.post(f"/api/v1/agent/conversations/{cid}/messages", json={"content": "secret internal", "is_internal": True}, headers=agent_h)
    assert r.status_code == 200, r.text
    internal_id = r.json()["id"]

    r = client.get(f"/api/v1/widget/conversations/{cid}", headers=wh)
    assert r.status_code == 200, r.text
    wdetail = r.json()
    contents = [m["content"] for m in wdetail["messages"]]
    ids = [m["id"] for m in wdetail["messages"]]
    assert "public agent reply" in contents
    assert "secret internal" not in contents
    assert internal_id not in ids
    assert all("sender_id" not in m for m in wdetail["messages"])

    # restore/list sees conversation
    r = client.get("/api/v1/widget/conversations", headers=wh)
    assert r.status_code == 200
    assert any(c["id"] == cid for c in r.json())


def test_widget_session_linked_to_authenticated_customer_and_help_page_data():
    _ensure_admin_config(allowed_domains=[EXTERNAL_ORIGIN])
    cust_h = _login("phase1_customer@example.com")
    # create widget session with bearer -> linked (not guest)
    r = client.post("/api/v1/widget/session", json={"page_url": EXTERNAL_ORIGIN + "/"}, headers={"Origin": EXTERNAL_ORIGIN, **cust_h})
    assert r.status_code == 200, r.text
    assert r.json()["is_guest"] is False
