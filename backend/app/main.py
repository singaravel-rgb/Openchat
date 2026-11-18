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

class OpenChatCORSMiddleware(CORSMiddleware):
    def is_allowed_origin(self, origin: str) -> bool:
        if getattr(settings, "environment", "development") == "production":
            is_local = "localhost" in origin.lower() or "127.0.0.1" in origin.lower()
            if is_local and not getattr(settings, "allow_localhost_in_production", False):
                return False
        if super().is_allowed_origin(origin):
            return True
        try:
            from app.db.session import SessionLocal
            from app.models.widget import WidgetConfig
            from app.services.widget_service import normalize_origin
            from urllib.parse import urlparse
            db = SessionLocal()
            try:
                cfg = db.query(WidgetConfig).first()
                if cfg and cfg.allowed_domains:
                    norm_origin = normalize_origin(origin)
                    origin_netloc = urlparse(origin).netloc.lower() if "://" in origin else origin.lower()
                    for d in cfg.allowed_domains:
                        if not d or not isinstance(d, str):
                            continue
                        nd = normalize_origin(d)
                        if nd == norm_origin:
                            return True
                        d_netloc = urlparse(nd).netloc.lower() if "://" in nd else nd.lower()
                        if d_netloc and d_netloc == origin_netloc:
                            return True
            finally:
                db.close()
        except Exception:
            pass
        return False


app.add_middleware(
    OpenChatCORSMiddleware,
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


@app.get("/health")
def health_root():
    return {"status": "ok", "service": "OpenChat API"}

