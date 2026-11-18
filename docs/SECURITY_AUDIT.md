# OpenChat Security & Access Control Audit Report

## Overview
This report documents the security posture of OpenChat v1.0.0, evaluating Role-Based Access Control (RBAC), password hashing, token validation, API key encryption, and vulnerability assessments (IDOR, XSS, CSRF, Injection).

---

## 1. Role-Based Access Control (RBAC) Architecture

OpenChat enforces strict multi-tier role authorization at the backend dependency injection layer (`require_roles`):

```
                    ┌────────────────────────┐
                    │      Super Admin       │  Full access, user provisioning, global config
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │         Admin          │  Manage operations, agents, articles, SLAs
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │         Agent          │  Operational chats, replies, private notes
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │     Customer/Guest     │  Public widget, own session chats only
                    └────────────────────────┘
```

### Hierarchy Rules Verified
1. **Super Admin Exclusivity**:
   - Only Super Admins can access `/api/v1/admin/users/invite` to create or promote other users to administrative roles.
   - Demoting or deleting the last active Super Admin is programmatically blocked with HTTP 400 Bad Request.
2. **Agent Isolation**:
   - Agents are forbidden from accessing `/api/v1/admin/*` endpoints (returns `403 Forbidden`).
   - Agents can only modify conversations assigned to them or unassigned in queue (`ensure_can_modify`).
3. **Customer & Guest Isolation**:
   - Customers and guests can never access `/api/v1/agent/*` or `/api/v1/admin/*`.
   - Customers cannot view other customers' conversations (returns `404 Not Found` or `403 Forbidden`).

---

## 2. Password Security & Cryptography

- **Algorithm**: Argon2id via `pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")`.
- **Salts**: Automatically generated cryptographically secure per-user random salts.
- **Verification**: `verify_password(plain, hash)` prevents timing attacks.
- **Legacy/Demo Credential Disablement**:
  - `admin@demo.com` and `agent@demo.com` with `demo1234` are permanently locked down in production:
  - `POST /api/v1/auth/login` explicitly rejects demo credentials with `HTTP 403 Forbidden: Demo accounts and default credentials are permanently disabled.`

---

## 3. Secret & API Key Protection

1. **Gemini API Key Encryption**:
   - Stored in the database inside `ai_configs.gemini_api_key_encrypted` encrypted using Fernet symmetric encryption (`app.core.security.encrypt_secret`).
   - The master encryption key is derived securely from `SECRET_KEY`.
   - API keys are NEVER returned in cleartext to frontend responses; masked as `******`.
2. **Git Exposure Audit**:
   - Zero `.env`, `.pem`, or credential files are tracked in Git.
   - Verified via `git ls-files | Select-String -Pattern "\.env|secret|id_rsa|pem"`.

---

## 4. Vulnerability Testing Results

| Test Category | Vulnerability Surface | Test Procedure & Finding | Status |
| :--- | :--- | :--- | :---: |
| **IDOR** | Conversation Access | Attempted cross-tenant/cross-user message retrieval | **PASS** (Protected via `ensure_can_view`) |
| **Data Leakage** | Private Notes in Widget | Customer polled conversation containing internal notes | **PASS** (Internal notes filtered at DB query layer) |
| **SQL Injection** | Search & Filter Parameters | Tested `' OR 1=1 --` against conversation and FAQ search | **PASS** (SQLAlchemy parameterized queries) |
| **XSS** | Customer Widget Messages | Tested `<script>alert(1)</script>` inside widget input | **PASS** (Shadow DOM HTML entity escaping via `esc()`) |
| **CSRF** | State-changing Actions | Evaluated JWT Bearer token headers vs ambient cookies | **PASS** (Tokens transmitted in Authorization header) |
| **Origin Whitelist**| Widget Embedding | Tested embedding from `https://evil.example.com` | **PASS** (Rejected with 403 Forbidden) |
| **Rate Limiting** | Message Flooding | Flooded 50 requests in 2 seconds from single client | **PASS** (Throttled with HTTP 429 Too Many Requests) |
