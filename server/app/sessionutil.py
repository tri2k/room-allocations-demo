from uuid import UUID

from fastapi import Response
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.config import get_settings

SESSION_COOKIE = "ra_session"
OAUTH_STATE_COOKIE = "ra_oauth_state"
OAUTH_STATE_MAX_AGE = 600


def _session_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_settings().session_secret, salt="ra-session")


def _oauth_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_settings().session_secret, salt="ra-oauth-state")


def dump_session(user_id: UUID) -> str:
    return _session_serializer().dumps({"uid": str(user_id)})


def load_session(token: str) -> UUID | None:
    try:
        data = _session_serializer().loads(token, max_age=get_settings().session_max_age_seconds)
    except (BadSignature, SignatureExpired, TypeError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    raw = data.get("uid")
    if not isinstance(raw, str):
        return None
    try:
        return UUID(raw)
    except ValueError:
        return None


def dump_oauth_state(state: str) -> str:
    return _oauth_serializer().dumps(state)


def load_oauth_state(token: str) -> str | None:
    try:
        data = _oauth_serializer().loads(token, max_age=OAUTH_STATE_MAX_AGE)
    except (BadSignature, SignatureExpired, TypeError, ValueError):
        return None
    return data if isinstance(data, str) else None


def set_session_cookie(response: Response, user_id: UUID) -> None:
    settings = get_settings()
    response.set_cookie(
        key=SESSION_COOKIE,
        value=dump_session(user_id),
        max_age=settings.session_max_age_seconds,
        httponly=True,
        samesite="lax",
        secure=settings.session_secure,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=SESSION_COOKIE,
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.session_secure,
    )


def set_oauth_state_cookie(response: Response, state: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=OAUTH_STATE_COOKIE,
        value=dump_oauth_state(state),
        max_age=OAUTH_STATE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=settings.session_secure,
        path="/",
    )


def clear_oauth_state_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=OAUTH_STATE_COOKIE,
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.session_secure,
    )
