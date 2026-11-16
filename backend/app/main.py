from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.middleware.audit_log import AuditLogMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware

app = FastAPI(
    title="OpenChat API",
    description="AI-powered customer support platform with conversation lifecycle, agent assignment, SLA tracking, knowledge base, and widget integration.",
    version="1.0.0",
    contact={
        "name": "OpenChat Support",
        "email": "support@openchat.io",
    },
    license_info={
        "name": "MIT",
    },
    openapi_tags=[
        {"name": "Authentication", "description": "User registration, login, and token management"},
        {"name": "Conversation Lifecycle", "description": "Create, view, update, resolve, close, and reopen conversations"},
        {"name": "Agent Workspace", "description": "Agent inbox, assignment, and conversation management"},
        {"name": "Admin Workspace", "description": "Admin dashboard, agent management, and conversation oversight"},
        {"name": "Admin Knowledge Base", "description": "Categories, articles, and FAQs management"},
        {"name": "Admin AI", "description": "AI provider configuration, testing, and usage tracking"},
        {"name": "Admin Settings", "description": "General, notification, and assignment rule settings"},
        {"name": "Admin Widget", "description": "Widget configuration and embed snippet"},
        {"name": "Admin SLA", "description": "SLA configuration and breach monitoring"},
        {"name": "Admin Reports", "description": "Analytics, metrics, and report export"},
        {"name": "Widget", "description": "Embeddable customer-facing widget API"},
        {"name": "Notifications", "description": "In-app notification management"},
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(AuditLogMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

app.include_router(api_router, prefix="/api/v1")


@app.get("/")
def root():
    return {"message": "Welcome to OpenChat"}
