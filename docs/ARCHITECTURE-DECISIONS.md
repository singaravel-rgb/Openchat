# OpenChat — Architecture Decision Records

**Repository:** C:\Users\SINGARAVEL\Documents\Freshchat\OpenChat  
**Date:** 2026-11-12

---

## ADR-001: Technology Stack

**Decision:** FastAPI + SQLAlchemy + PostgreSQL + Redis + Next.js 16 + TypeScript + Tailwind CSS

**Rationale:**
- FastAPI provides async support, automatic OpenAPI docs, and Python ecosystem
- SQLAlchemy 2.0 provides mature ORM with async support
- PostgreSQL provides relational data integrity, JSON support for flexible schemas
- Redis provides caching, rate limiting, and Celery broker
- Next.js 16 with App Router provides modern React framework with server components
- TypeScript provides type safety across the frontend
- Tailwind CSS provides rapid UI development

**Consequences:**
- Python backend requires Python 3.12+
- Node.js frontend requires Node.js 18+
- PostgreSQL and Redis must be running for full functionality

---

## ADR-002: Authentication Strategy

**Decision:** JWT-based authentication with Argon2 password hashing, Redis-backed rate limiting for brute-force protection

**Rationale:**
- JWT provides stateless authentication suitable for SPA + API architecture
- Argon2 is the winner of the Password Hashing Competition, resistant to GPU/ASIC attacks
- Redis provides distributed rate limiting for brute-force protection across multiple backend instances

**Consequences:**
- JWT secrets must be rotated periodically
- Refresh token rotation not yet implemented
- Token revocation not implemented (tokens valid until expiry)

---

## ADR-003: Database Design

**Decision:** Single-tenant PostgreSQL with JSON columns for flexible metadata

**Rationale:**
- Single-tenant simplifies data isolation and backup
- JSON columns (ai_metadata, assignment_history, rules, etc.) provide flexibility for evolving schemas
- Proper indexes on foreign keys and frequently queried columns

**Consequences:**
- Multi-tenancy would require significant schema changes
- JSON columns are not as queryable as normalized tables

---

## ADR-004: AI Provider Strategy

**Decision:** Provider adapter pattern with demo provider as default

**Rationale:**
- Adapter pattern allows adding new providers without changing core logic
- Demo provider enables testing without API credentials
- OpenAI/Anthropic adapters ready when credentials are available

**Consequences:**
- Demo provider responses are deterministic, not truly intelligent
- Real AI requires API key configuration

---

## ADR-005: Background Processing

**Decision:** Celery + Celery Beat + Redis for background tasks

**Rationale:**
- Celery is the standard Python task queue
- Celery Beat provides periodic task scheduling (SLA checks every 60s)
- Redis serves as both broker and result backend

**Consequences:**
- Redis must be running for background tasks
- Worker processes must be started separately from the web server

---

## ADR-006: File Storage

**Decision:** Local filesystem storage for attachments

**Rationale:**
- Simplest implementation for single-server deployment
- No external storage service required
- File paths stored in database, files stored on disk

**Consequences:**
- Not suitable for multi-server deployments without shared storage
- No built-in virus scanning
- No CDN integration

---

## ADR-007: Frontend Architecture

**Decision:** Next.js 16 App Router with TypeScript and Tailwind CSS

**Rationale:**
- App Router provides modern React patterns with server components
- TypeScript provides type safety across frontend and API contracts
- Tailwind CSS provides rapid UI development with consistent design

**Consequences:**
- Next.js 16 has breaking changes from earlier versions
- Three-panel workspace layout requires careful responsive design

---

## ADR-008: API Design

**Decision:** RESTful API under `/api/v1` with consistent resource naming

**Rationale:**
- REST is well-understood and widely supported
- Version prefix (`/api/v1`) allows future breaking changes
- Consistent resource naming (`/conversations`, `/messages`, `/agents`, etc.)

**Consequences:**
- No GraphQL support
- No real-time WebSocket API (polling used instead)

---

## ADR-009: Security Approach

**Decision:** Defense-in-depth with CORS restriction, rate limiting, security headers, audit logging

**Rationale:**
- Multiple layers of security reduce risk of single point of failure
- CORS restriction prevents unauthorized cross-origin requests
- Rate limiting prevents abuse
- Security headers protect against common web vulnerabilities
- Audit logging provides accountability

**Consequences:**
- HTTPS enforcement at load balancer level (not app level)
- No brute-force protection beyond login attempts
- No API key rotation

---

## ADR-010: Real-Time Communication

**Decision:** 3-second polling instead of WebSockets

**Rationale:**
- Polling is simpler to implement and debug
- Works without WebSocket infrastructure
- 3-second interval is acceptable for customer support use case

**Consequences:**
- Higher server load than WebSockets
- Slightly delayed message delivery (up to 3 seconds)
- More HTTP requests
