import time
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.db.session import SessionLocal
from app.models.user import User
from app.models.conversation import Conversation
from app.core.enums import ConversationStatus
from app.services.conversation_service import generate_chat_id
from tests.test_phase2_widget import _ensure_admin_config, EXTERNAL_ORIGIN

client = TestClient(app)

def _login(email, password="password123"):
    if email == "singaravel@vananam.com":
        password = "SuperAdminPassword2026!"
    r = client.post("/api/v1/auth/login", data={"username": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}

def test_admin_resolve_and_reopen_endpoints():
    admin_h = _login("singaravel@vananam.com")
    db: Session = SessionLocal()
    try:
        cust = db.query(User).filter(User.role == "customer").first()
        assert cust is not None
        conv = Conversation(
            chat_id=generate_chat_id(db),
            customer_id=cust.id,
            subject="Test resolve endpoint",
            status=ConversationStatus.OPEN,
            channel="web",
            priority="normal",
        )
        db.add(conv)
        db.commit()
        db.refresh(conv)
        cid = conv.id
    finally:
        db.close()

    # Test resolve
    res = client.post(f"/api/v1/admin/conversations/{cid}/resolve", json={"resolution_details": "Issue investigated and resolved"}, headers=admin_h)
    assert res.status_code == 200, res.text
    assert res.json()["message"] == "Conversation resolved successfully"

    # Verify status in DB
    db = SessionLocal()
    try:
        updated = db.query(Conversation).filter(Conversation.id == cid).first()
        assert updated.status == ConversationStatus.RESOLVED
        assert updated.resolution_details == "Issue investigated and resolved"
    finally:
        db.close()

    # Test reopen
    reopen_res = client.post(f"/api/v1/admin/conversations/{cid}/reopen", headers=admin_h)
    assert reopen_res.status_code == 200, reopen_res.text

    db = SessionLocal()
    try:
        reopened = db.query(Conversation).filter(Conversation.id == cid).first()
        assert reopened.status in (ConversationStatus.OPEN, ConversationStatus.PENDING)
    finally:
        db.close()

    # Test close
    close_res = client.post(f"/api/v1/admin/conversations/{cid}/close", json={"resolution_details": "Ticket closed permanently"}, headers=admin_h)
    assert close_res.status_code == 200, close_res.text

    db = SessionLocal()
    try:
        closed = db.query(Conversation).filter(Conversation.id == cid).first()
        assert closed.status == ConversationStatus.CLOSED
    finally:
        db.close()

def test_widget_bot_flow_endpoint():
    _ensure_admin_config(allowed_domains=[EXTERNAL_ORIGIN])
    headers = {"Origin": EXTERNAL_ORIGIN}
    res = client.get("/api/v1/widget/bot-flow", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert "issues" in data
    assert "steps" in data
    assert len(data["issues"]) >= 5
    issue_titles = [i["title"] for i in data["issues"]]
    assert any("Order" in t for t in issue_titles)
    assert any("Billing" in t for t in issue_titles)
    assert any("Refund" in t for t in issue_titles)

def test_async_customer_message_sending_latency():
    _ensure_admin_config(allowed_domains=[EXTERNAL_ORIGIN])
    headers = {"Origin": EXTERNAL_ORIGIN}
    s = client.post("/api/v1/widget/session", json={"guest_name": "Latency Tester", "page_url": EXTERNAL_ORIGIN + "/"}, headers=headers).json()
    wh = {**headers, "X-Widget-Session": s["session_token"]}

    conv = client.post("/api/v1/widget/conversations", json={"subject": "Latency Test"}, headers=wh).json()
    cid = conv["id"]

    # Verify initial natural greeting exists
    assert any("OpenChat Support" in m.get("content", "") or "Welcome" in m.get("content", "") for m in conv["messages"])

    # Warmup
    client.post(f"/api/v1/widget/conversations/{cid}/messages", json={"content": "warmup"}, headers=wh)

    # Measure message sending latency (must be < 1.0s, compared to 10-35s previously)
    t0 = time.time()
    msg_res = client.post(
        f"/api/v1/widget/conversations/{cid}/messages",
        json={"content": "Checking message delivery speed", "client_message_id": "speed-test-1"},
        headers=wh
    )
    t1 = time.time()
    elapsed = t1 - t0

    assert msg_res.status_code == 201, msg_res.text
    msg_data = msg_res.json()
    assert msg_data["delivery_status"] == "delivered"
    assert msg_data["content"] == "Checking message delivery speed"
    assert elapsed < 1.0, f"Expected message response in <1.0s, took {elapsed:.3f}s"
