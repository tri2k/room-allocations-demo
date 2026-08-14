from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.db import SessionLocal
from app.models import User
from app.sessionutil import SESSION_COOKIE, load_session

PUBLIC_EXACT = frozenset(
    {
        ("GET", "/health"),
        ("GET", "/api/v1/auth/config"),
        ("GET", "/api/v1/auth/google/start"),
        ("GET", "/api/v1/auth/google/callback"),
        ("POST", "/api/v1/auth/logout"),
        ("POST", "/api/v1/dev/login"),
    }
)


def _is_public(method: str, path: str) -> bool:
    if method == "OPTIONS":
        return True
    if not path.startswith("/api/v1"):
        return True
    return (method, path) in PUBLIC_EXACT


class SessionGateMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        if _is_public(request.method, request.url.path):
            return await call_next(request)

        token = request.cookies.get(SESSION_COOKIE)
        user_id = load_session(token) if token else None
        if user_id is None:
            return JSONResponse({"detail": "Not authenticated"}, status_code=401)

        db = SessionLocal()
        try:
            user = db.get(User, user_id)
            if user is None:
                return JSONResponse({"detail": "Not authenticated"}, status_code=401)
            request.state.user_id = user.id
        finally:
            db.close()

        return await call_next(request)
