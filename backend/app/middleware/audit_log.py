from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.db.session import SessionLocal
from app.models.audit_log import AuditLog
from app.models.user import User


class AuditLogMiddleware(BaseHTTPMiddleware):
    """Middleware that logs admin API actions to the audit_logs table."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Only log admin API mutations
        if not request.url.path.startswith("/api/v1/admin/"):
            return response
        if request.method not in ("POST", "PUT", "PATCH", "DELETE"):
            return response

        # Extract user from auth header
        user_id = None
        auth = request.headers.get("authorization")
        if auth and auth.lower().startswith("bearer "):
            try:
                import jwt
                from app.core.config import settings
                token = auth.split(" ", 1)[1]
                payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
                user_id = int(payload.get("sub"))
            except Exception:
                pass

        # Extract resource info from path
        path = request.url.path
        parts = path.strip("/").split("/")
        # /api/v1/admin/{resource}/{id}/...
        resource_type = parts[3] if len(parts) > 3 else None
        resource_id = None
        if len(parts) > 4:
            try:
                resource_id = int(parts[4])
            except ValueError:
                pass

        action = f"{request.method.lower()}:{resource_type or 'unknown'}"

        # Get request body for details (limited size)
        details = None
        try:
            body = await request.body()
            if body:
                details = body.decode("utf-8", errors="replace")[:2000]
        except Exception:
            pass

        db = SessionLocal()
        try:
            log = AuditLog(
                user_id=user_id,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                details=details,
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
            )
            db.add(log)
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()

        return response