# OpenChat API Audit & Endpoint Verification Report

## Overview
This document audits all REST API routes in OpenChat v1.0.0, covering input validation, authorization requirements, HTTP status codes, and test verification.

---

## 1. Authentication & Session Endpoints (`/api/v1/auth`)

| Method | Endpoint | Description | Auth Required | Status Code | Verified |
| :--- | :--- | :--- | :---: | :---: | :---: |
| `POST` | `/api/v1/auth/login` | Issues JWT bearer tokens | None | `200 OK` | Yes |
| `GET` | `/api/v1/auth/me` | Current authenticated user profile | Bearer JWT | `200 OK` | Yes |
| `POST` | `/api/v1/auth/logout` | Revokes user session via Redis blacklist | Bearer JWT | `200 OK` | Yes |
| `GET` | `/api/v1/auth/invitations/{token}` | Public inspect invitation token | None | `200 OK` | Yes |
| `POST` | `/api/v1/auth/invitations/{token}/accept` | Sets password & activates invited user | None | `200 OK` | Yes |

---

## 2. Customer Widget Endpoints (`/api/v1/widget`)

| Method | Endpoint | Description | Auth Required | Status Code | Verified |
| :--- | :--- | :--- | :---: | :---: | :---: |
| `GET` | `/api/v1/widget/config` | Public widget config & branding | Origin Check | `200 OK` | Yes |
| `POST` | `/api/v1/widget/auth/guest-session` | Generates guest session & token | None | `200 OK` | Yes |
| `POST` | `/api/v1/widget/session` | Restores existing customer/guest session | None | `200 OK` | Yes |
| `GET` | `/api/v1/widget/conversations` | Lists current visitor's conversations | Guest/User JWT | `200 OK` | Yes |
| `POST` | `/api/v1/widget/conversations` | Initiates new chat conversation | Guest/User JWT | `201 Created` | Yes |
| `GET` | `/api/v1/widget/conversations/{id}` | Gets conversation transcript (no notes) | Guest/User JWT | `200 OK` | Yes |
| `POST` | `/api/v1/widget/conversations/{id}/messages` | Sends message & triggers AI response | Guest/User JWT | `201 Created` | Yes |
| `POST` | `/api/v1/widget/conversations/{id}/request-human` | Escalates conversation to human agent | Guest/User JWT | `200 OK` | Yes |
| `GET` | `/api/v1/widget/embed.js` | Embeddable launcher loader script | None | `200 OK` | Yes |

---

## 3. Agent Operational Endpoints (`/api/v1/agent`)

| Method | Endpoint | Description | Auth Required | Status Code | Verified |
| :--- | :--- | :--- | :---: | :---: | :---: |
| `GET` | `/api/v1/agent/conversations` | Lists agent conversations by queue | Agent/Admin | `200 OK` | Yes |
| `GET` | `/api/v1/agent/conversations/{id}` | Loads full conversation & notes | Agent/Admin | `200 OK` | Yes |
| `POST` | `/api/v1/agent/conversations/{id}/messages` | Sends public reply or internal note | Agent/Admin | `200 OK` | Yes |
| `POST` | `/api/v1/agent/conversations/{id}/take` | Takes ownership of unassigned chat | Agent/Admin | `200 OK` | Yes |
| `POST` | `/api/v1/agent/conversations/{id}/resolve` | Marks conversation as resolved | Agent/Admin | `200 OK` | Yes |
| `POST` | `/api/v1/agent/conversations/{id}/reopen` | Reopens a resolved conversation | Agent/Admin | `200 OK` | Yes |
| `POST` | `/api/v1/agent/conversations/{id}/link` | Links two related conversations | Agent/Admin | `200 OK` | Yes |
| `POST` | `/api/v1/agent/conversations/{id}/merge` | Merges conversation into target | Agent/Admin | `200 OK` | Yes |
| `POST` | `/api/v1/agent/conversations/{id}/messages/{m_id}/retract` | Recalls message within 5s window | Agent/Admin | `200 OK` | Yes |
| `GET` | `/api/v1/agent/canned-responses` | Retrieves canned responses | Agent/Admin | `200 OK` | Yes |

---

## 4. Administrative Endpoints (`/api/v1/admin`)

| Method | Endpoint | Description | Auth Required | Status Code | Verified |
| :--- | :--- | :--- | :---: | :---: | :---: |
| `GET` | `/api/v1/admin/dashboard` | Aggregated metrics & stats | Admin/Super | `200 OK` | Yes |
| `GET` | `/api/v1/admin/conversations` | Lists all organization conversations | Admin/Super | `200 OK` | Yes |
| `GET` | `/api/v1/admin/users` | Lists administrative and agent users | Super Admin | `200 OK` | Yes |
| `POST` | `/api/v1/admin/users/invite` | Creates secure user invitation | Super Admin | `201 Created` | Yes |
| `GET` | `/api/v1/admin/ai/config` | Reads AI provider settings & model | Admin/Super | `200 OK` | Yes |
| `PUT` | `/api/v1/admin/ai/config` | Updates AI settings & API key | Admin/Super | `200 OK` | Yes |
| `GET` | `/api/v1/admin/knowledge/articles` | Lists knowledge base articles | Admin/Super | `200 OK` | Yes |
| `POST` | `/api/v1/admin/knowledge/articles` | Creates/publishes new article | Admin/Super | `201 Created` | Yes |
| `GET` | `/api/v1/admin/knowledge/faqs` | Lists all FAQs | Admin/Super | `200 OK` | Yes |
| `GET` | `/api/v1/admin/integrations` | Returns integration statuses | Admin/Super | `200 OK` | Yes |
| `GET` | `/api/v1/admin/audit-logs` | Reads system security audit logs | Admin/Super | `200 OK` | Yes |

---

## 5. System Health Check (`/api/v1/health`)
- **Endpoint**: `GET /api/v1/health`
- **Output**: `{"status": "ok", "app": "OpenChat API", "version": "1.0.0"}`
- **Response Time**: < 10ms
