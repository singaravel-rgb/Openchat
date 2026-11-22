import io
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_pytest.db")

from app.db.session import engine, SessionLocal
from app.db.base import Base
Base.metadata.create_all(bind=engine)

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models.user import User
from app.models.conversation import Conversation
from app.models.password_reset import PasswordResetToken
from app.models.knowledge import Article, Category
from app.core.security import hash_password, verify_password
from app.core.enums import ConversationStatus, ArticleStatus, ArticleVisibility
from app.services.bot_flow_service import seed_default_bot_flow, get_active_bot_flow_data
from app.services.report_service import export_report

client = TestClient(app)


def _ensure_user(db, email, role, name, password="Password123!"):
    u = db.query(User).filter(User.email == email).first()
    if not u:
        u = User(
            email=email,
            full_name=name,
            role=role,
            is_active=True,
            password_hash=hash_password(password),
        )
        db.add(u)
        db.commit()
        db.refresh(u)
    else:
        u.password_hash = hash_password(password)
        u.is_active = True
        db.commit()
    return u


def _login(email, password="Password123!"):
    r = client.post("/api/v1/auth/login", data={"username": email, "password": password})
    assert r.status_code == 200, f"Login failed for {email}: {r.text}"
    return r.json()["access_token"]


def test_password_management_flow():
    db = SessionLocal()
    try:
        user = _ensure_user(db, "pwd_test@example.com", "agent", "Pwd Test Agent", "OldPassword123!")
        admin = _ensure_user(db, "pwd_admin@example.com", "admin", "Pwd Admin", "AdminPassword123!")

        # 1. Forgot password request (anti-enumeration check)
        r = client.post("/api/v1/auth/forgot-password", json={"email": "pwd_test@example.com"})
        assert r.status_code == 200
        assert "If an account with that email exists" in r.json()["message"]

        # Check token created in DB
        token_record = (
            db.query(PasswordResetToken)
            .filter(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
            .order_by(PasswordResetToken.id.desc())
            .first()
        )
        assert token_record is not None
        assert token_record.token_hash is not None

        # 2. Admin-initiated password reset
        admin_token = _login("pwd_admin@example.com", "AdminPassword123!")
        r_admin = client.post(
            f"/api/v1/admin/users/{user.id}/reset-password",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r_admin.status_code == 200
        admin_resp = r_admin.json()
        assert "reset_url" in admin_resp
        raw_reset_token = admin_resp["reset_token"]
        assert raw_reset_token is not None

        # 3. Validate token
        r_val = client.get(f"/api/v1/auth/reset-password/validate?token={raw_reset_token}")
        assert r_val.status_code == 200
        assert r_val.json()["valid"] is True
        assert r_val.json()["email"] == "pw***@example.com"

        # 4. Reset password
        r_reset = client.post(
            "/api/v1/auth/reset-password",
            json={
                "token": raw_reset_token,
                "password": "NewSecurePassword456!",
                "confirm_password": "NewSecurePassword456!",
            },
        )
        assert r_reset.status_code == 200
        assert "password has been reset successfully" in r_reset.json()["message"].lower()

        # 5. Token cannot be reused
        r_val2 = client.get(f"/api/v1/auth/reset-password/validate?token={raw_reset_token}")
        assert r_val2.status_code == 200
        assert r_val2.json()["valid"] is False

        # 6. Login with new password succeeds
        new_token = _login("pwd_test@example.com", "NewSecurePassword456!")
        assert new_token is not None

        # 7. Authenticated change password
        r_change = client.post(
            "/api/v1/auth/change-password",
            headers={"Authorization": f"Bearer {new_token}"},
            json={
                "current_password": "NewSecurePassword456!",
                "new_password": "AnotherNewPassword789!",
                "confirm_password": "AnotherNewPassword789!",
            },
        )
        assert r_change.status_code == 200
        assert "Password changed successfully" in r_change.json()["message"]

        # 8. Login with latest password
        latest_token = _login("pwd_test@example.com", "AnotherNewPassword789!")
        assert latest_token is not None
    finally:
        db.close()


def test_widget_attachment_and_help_flow():
    db = SessionLocal()
    try:
        # Seed article
        admin = _ensure_user(db, "widget_admin@example.com", "admin", "Widget Admin")
        cat = db.query(Category).first()
        if not cat:
            cat = Category(name="General", slug="general-test", is_active=True)
            db.add(cat)
            db.commit()

        art = db.query(Article).filter(Article.slug == "getting-started-test").first()
        if not art:
            art = Article(
                title="Getting Started with OpenChat",
                slug="getting-started-test",
                content="This is a comprehensive guide to using OpenChat effectively.",
                excerpt="Quick start guide for support.",
                status=ArticleStatus.PUBLISHED,
                visibility=ArticleVisibility.PUBLIC,
                author_id=admin.id,
                category_id=cat.id,
            )
            db.add(art)
            db.commit()

        # Create widget session
        r_sess = client.post("/api/v1/widget/session", json={"guest_name": "Test Customer", "guest_email": "customer@example.com"})
        assert r_sess.status_code == 200
        session_token = r_sess.json()["session_token"]
        widget_headers = {"X-Widget-Session": session_token}

        # Create conversation
        r_conv = client.post("/api/v1/widget/conversations", headers=widget_headers, json={"subject": "Help with my order"})
        assert r_conv.status_code == 201
        conv_id = r_conv.json()["id"]

        # 1. Customer sends `/help`
        r_help = client.post(
            f"/api/v1/widget/conversations/{conv_id}/messages",
            headers=widget_headers,
            json={"content": "/help"},
        )
        assert r_help.status_code == 201
        help_msg = r_help.json()
        assert help_msg["sender_type"] == "ai"
        assert "Getting Started with OpenChat" in help_msg["content"] or (help_msg.get("ai_metadata") and len(help_msg["ai_metadata"].get("options", [])) > 0)

        # 2. Customer uploads an image
        fake_image_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
        files = {"file": ("screenshot.png", fake_image_bytes, "image/png")}
        r_upload = client.post(
            f"/api/v1/widget/conversations/{conv_id}/attachments",
            headers=widget_headers,
            files=files,
        )
        assert r_upload.status_code == 201
        up_data = r_upload.json()
        assert len(up_data.get("attachments", [])) > 0
        att_id = up_data["attachments"][0]["id"]

        # 3. Customer downloads image using session
        r_dl = client.get(
            f"/api/v1/widget/attachments/{att_id}/download",
            headers=widget_headers,
        )
        assert r_dl.status_code == 200
        assert r_dl.headers["content-type"] == "image/png"
        assert len(r_dl.content) > 0

        # 4. Agent views conversation detail and verifies attachment is visible
        admin_token = _login("widget_admin@example.com")
        r_agent_view = client.get(
            f"/api/v1/conversations/{conv_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r_agent_view.status_code == 200
        agent_conv = r_agent_view.json()
        image_msgs = [m for m in agent_conv["messages"] if m.get("attachments") and len(m["attachments"]) > 0]
        assert len(image_msgs) > 0
        assert image_msgs[0]["attachments"][0]["original_filename"] == "screenshot.png"
    finally:
        db.close()


def test_export_engine_and_bot_flow_dedup():
    db = SessionLocal()
    try:
        # 1. Test Bot Flow Deduplication
        seed_default_bot_flow(db)
        seed_default_bot_flow(db)  # calling seed twice must NOT duplicate topics
        data = get_active_bot_flow_data(db)
        titles = [i["title"] for i in data["issues"]]
        assert len(titles) == len(set(titles)), f"Duplicate topics found: {titles}"

        # 2. Test Report Export (CSV & XLSX)
        admin = _ensure_user(db, "export_admin@example.com", "admin", "Export Admin")
        admin_token = _login("export_admin@example.com")

        # CSV Export
        r_csv = client.post(
            "/api/v1/admin/reports/export",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "report_type": "conversations",
                "format": "csv",
                "fields": ["chat_id", "subject", "status", "customer_name"],
            },
        )
        assert r_csv.status_code == 200
        assert r_csv.headers["content-type"] == "text/csv; charset=utf-8"
        csv_text = r_csv.text
        assert "Chat ID" in csv_text
        assert "Subject" in csv_text

        # XLSX Export
        r_xlsx = client.post(
            "/api/v1/admin/reports/export",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "report_type": "conversations",
                "format": "xlsx",
                "fields": ["chat_id", "subject", "status", "priority", "created_at"],
            },
        )
        assert r_xlsx.status_code == 200
        assert "openxmlformats" in r_xlsx.headers["content-type"]
        assert len(r_xlsx.content) > 500  # valid zip archive
    finally:
        db.close()
