from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.redis import redis_client


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Distributed rate limiting per user/IP using Redis sliding window.

    Limits: 100 requests per minute per authenticated user, 30 per minute per IP for anonymous.

    Notes:
    - CORS preflight requests (``OPTIONS``) are not counted: every cross-origin call
      would otherwise consume two slots and fail in the browser as "Failed to fetch".
    - Unauthenticated auth entry points get their own, larger bucket because a login
      attempt must not be blocked by unrelated anonymous traffic from the same IP.
    """

    #: Paths exempt from the global limit (docs/health/widget already exempt below).
    AUTH_PATHS = (
        "/api/v1/auth/login",
        "/api/v1/auth/register",
    )

    def __init__(
        self,
        app,
        user_limit: int = 300,
        anon_limit: int = 60,
        auth_limit: int = 60,
        window_seconds: int = 60,
    ):
        super().__init__(app)
        self.user_limit = user_limit
        self.anon_limit = anon_limit
        self.auth_limit = auth_limit
        self.window_seconds = window_seconds

    async def dispatch(self, request: Request, call_next):
        # Never rate limit CORS preflight requests.
        if request.method == "OPTIONS":
            return await call_next(request)

        # Skip rate limiting for docs, openapi, health, and widget endpoints (they have their own)
        path = request.url.path
        if path in ("/docs", "/openapi.json", "/health", "/api/v1/health") or path.startswith("/api/v1/widget"):
            return await call_next(request)

        # Determine rate limit key
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

        ip = request.client.host if request.client else "unknown"
        is_auth_path = path in self.AUTH_PATHS
        if user_id:
            key = f"ratelimit:user:{user_id}"
            limit = self.user_limit
        elif is_auth_path:
            key = f"ratelimit:auth:{ip}"
            limit = self.auth_limit
        else:
            key = f"ratelimit:ip:{ip}"
            limit = self.anon_limit

        # Check rate limit using Redis sliding window
        try:
            now = __import__("time").time()
            pipeline = redis_client.pipeline()
            pipeline.zadd(key, {str(now): now})
            pipeline.zremrangebyscore(key, 0, now - self.window_seconds)
            pipeline.zcard(key)
            pipeline.expire(key, self.window_seconds)
            results = pipeline.execute()
            count = results[2]
            if count > limit:
                return Response(
                    content='{"detail":"Too many requests. Please try again later."}',
                    status_code=429,
                    media_type="application/json",
                    headers={"Retry-After": str(self.window_seconds)},
                )
        except Exception:
            # Redis unavailable: allow request to proceed (fail open)
            pass

        return await call_next(request)