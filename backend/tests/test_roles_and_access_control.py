import sys
from pathlib import Path
import pytest
import time
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.main import app
from app.db.session import SessionLocal
from app.models.user import User
from app.models.invitation import UserInvitation
from app.core.security import hash_password, create_access_token

client = TestClient(app)

@pytest.fixture(scope="module")
def setup_roles_data():
    db = SessionLocal()
    # 1. Ensure Super Admin
    super_admin = db.query(User).filter(User.email == "test_super@example.com").first()
    if not super_admin:
        super_admin = User(
            email="test_super@example.com",
            full_name="Test Super Admin",
            password_hash=hash_password("password123"),
            role="super_admin",
            is_active=True,
        )
        db.add(super_admin)

    # 2. Ensure Admin
    admin = db.query(User).filter(User.email == "test_admin@example.com").first()
    if not admin:
        admin = User(
            email="test_admin@example.com",
            full_name="Test Admin User",
            password_hash=hash_password("password123"),
            role="admin",
            is_active=True,
        )
        db.add(admin)

    # 3. Ensure Agent
    agent = db.query(User).filter(User.email == "test_agent@example.com").first()
    if not agent:
        agent = User(
            email="test_agent@example.com",
            full_name="Test Agent User",
            password_hash=hash_password("password123"),
            role="agent",
            is_active=True,
        )
        db.add(agent)

    # 4. Inactive Admin
    inactive_admin = db.query(User).filter(User.email == "inactive_admin@example.com").first()
    if not inactive_admin:
        inactive_admin = User(
            email="inactive_admin@example.com",
            full_name="Inactive Admin",
            password_hash=hash_password("password123"),
            role="admin",
            is_active=False,
        )
        db.add(inactive_admin)

    db.commit()
    db.refresh(super_admin)
    db.refresh(admin)
    db.refresh(agent)
    db.refresh(inactive_admin)

    super_token = create_access_token(str(super_admin.id), role="super_admin")
    admin_token = create_access_token(str(admin.id), role="admin")
    agent_token = create_access_token(str(agent.id), role="agent")
    inactive_token = create_access_token(str(inactive_admin.id), role="admin")

    data = {
        "super_admin": super_admin,
        "admin": admin,
        "agent": agent,
        "inactive_admin": inactive_admin,
        "super_token": super_token,
        "admin_token": admin_token,
        "agent_token": agent_token,
        "inactive_token": inactive_token,
    }
    yield data

    # Cleanup test users
    db.query(UserInvitation).filter(UserInvitation.email.in_([
        "invited_agent@example.com", "invited_admin@example.com", "invited_super@example.com"
    ])).delete()
    db.query(User).filter(User.email.in_([
        "test_super@example.com", "test_admin@example.com", "test_agent@example.com",
        "inactive_admin@example.com", "promoted_test@example.com"
    ])).delete()
    db.commit()
    db.close()


def test_agent_cannot_access_admin_endpoints(setup_roles_data):
    """Verify an agent receives 403 Forbidden on administrative endpoints."""
    headers = {"Authorization": f"Bearer {setup_roles_data['agent_token']}"}
    res = client.get("/api/v1/admin/users", headers=headers)
    assert res.status_code == 403
    assert "permission" in res.json()["detail"].lower()


def test_admin_cannot_grant_super_admin_invitation(setup_roles_data):
    """Verify an ordinary Admin cannot invite or create a Super Admin (HTTP 403)."""
    headers = {"Authorization": f"Bearer {setup_roles_data['admin_token']}"}
    payload = {
        "email": "invited_super@example.com",
        "role": "super_admin",
        "full_name": "Should Fail",
    }
    res = client.post("/api/v1/admin/users/invite", json=payload, headers=headers)
    assert res.status_code == 403
    assert "super admin" in res.json()["detail"].lower()


def test_super_admin_can_invite_any_role(setup_roles_data):
    """Verify Super Admin can invite agents, admins, and other super admins."""
    headers = {"Authorization": f"Bearer {setup_roles_data['super_token']}"}
    payload = {
        "email": "invited_agent@example.com",
        "role": "agent",
        "full_name": "Invited Agent",
    }
    res = client.post("/api/v1/admin/users/invite", json=payload, headers=headers)
    assert res.status_code == 201
    data = res.json()
    assert data["email"] == "invited_agent@example.com"
    assert data["role"] == "agent"
    assert data["token"] is not None


def test_invitation_acceptance_workflow(setup_roles_data):
    """Verify user can inspect and accept invitation to setup their account and password."""
    # 1. Invite an admin
    unique_email = f"invited_admin_{time.time_ns()}@example.com"
    headers = {"Authorization": f"Bearer {setup_roles_data['super_token']}"}
    res = client.post("/api/v1/admin/users/invite", json={
        "email": unique_email,
        "role": "admin",
    }, headers=headers)
    assert res.status_code == 201
    token = res.json()["token"]

    # 2. Inspect invitation publicly
    res_inspect = client.get(f"/api/v1/auth/invitations/{token}")
    assert res_inspect.status_code == 200
    inspect_data = res_inspect.json()
    assert inspect_data["email"] == unique_email
    assert inspect_data["role"] == "admin"
    assert inspect_data["is_expired"] is False

    # 3. Accept invitation
    res_accept = client.post("/api/v1/auth/invitations/accept", json={
        "token": token,
        "full_name": "Accepted Admin",
        "password": "SecurePassword123!",
    })
    assert res_accept.status_code == 201
    accept_data = res_accept.json()
    assert "access_token" in accept_data

    # 4. Login with newly created credentials
    res_login = client.post("/api/v1/auth/login", data={
        "username": "invited_admin@example.com",
        "password": "SecurePassword123!",
    })
    assert res_login.status_code == 200


def test_admin_cannot_modify_super_admin(setup_roles_data):
    """Verify an ordinary Admin cannot edit or deactivate a Super Admin (HTTP 403)."""
    headers = {"Authorization": f"Bearer {setup_roles_data['admin_token']}"}
    super_admin_id = setup_roles_data["super_admin"].id
    res = client.patch(f"/api/v1/admin/users/{super_admin_id}", json={
        "is_active": False,
    }, headers=headers)
    assert res.status_code == 403
    assert "super admin" in res.json()["detail"].lower()


def test_last_super_admin_protection(setup_roles_data):
    """Verify the last active Super Admin cannot be deactivated or demoted (HTTP 400)."""
    db = SessionLocal()
    # Check total active super admins in test environment
    active_supers = db.query(User).filter(User.role == "super_admin", User.is_active == True).all()
    # Ensure singaravel@vananam.com remains active, but if we target the only super admin in test, test restriction
    target_super = setup_roles_data["super_admin"]
    # Deactivate other super admin temporarily to test last-super protection
    db.query(User).filter(User.role == "super_admin", User.id != target_super.id).update({"is_active": False})
    db.commit()

    headers = {"Authorization": f"Bearer {setup_roles_data['super_token']}"}
    # Try demoting self when sole super admin
    res = client.patch(f"/api/v1/admin/users/{target_super.id}", json={
        "role": "admin",
    }, headers=headers)
    assert res.status_code == 400
    assert "last active super admin" in res.json()["detail"].lower()

    # Restore other super admins
    db.query(User).filter(User.email == "singaravel@vananam.com").update({"is_active": True})
    db.commit()
    db.close()


def test_inactive_user_cannot_access_apis(setup_roles_data):
    """Verify inactive user's token is immediately rejected with 401."""
    headers = {"Authorization": f"Bearer {setup_roles_data['inactive_token']}"}
    res = client.get("/api/v1/admin/users", headers=headers)
    assert res.status_code == 401

