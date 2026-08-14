import secrets
from typing import Any
from urllib.parse import urlencode
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.errors import unauthorized
from app.models import User
from app.schemas import AuthConfigOut, UserOut
from app.serialize import user_out
from app.sessionutil import (
    OAUTH_STATE_COOKIE,
    clear_oauth_state_cookie,
    clear_session_cookie,
    load_oauth_state,
    set_oauth_state_cookie,
    set_session_cookie,
)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class GoogleOAuthError(RuntimeError):
    pass


def normalize_email(value: str) -> str:
    return value.strip().lower()


def _frontend_redirect(hash_path: str, error: str | None = None) -> RedirectResponse:
    origin = get_settings().frontend_origin.rstrip("/")
    if error:
        return RedirectResponse(f"{origin}/?error={error}{hash_path}", status_code=302)
    return RedirectResponse(f"{origin}/{hash_path.lstrip('/')}", status_code=302)


def upsert_google_user(db: Session, *, sub: str, email: str, name: str | None, picture_url: str | None) -> User:
    user = db.scalar(select(User).where(User.google_sub == sub))
    if user is None:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(email=email, google_sub=sub, name=name, picture_url=picture_url)
            db.add(user)
        elif user.google_sub is not None and user.google_sub != sub:
            raise ValueError("email_conflict")
        else:
            user.google_sub = sub
            if name:
                user.name = name
            if picture_url:
                user.picture_url = picture_url
    else:
        user.email = email
        if name:
            user.name = name
        if picture_url:
            user.picture_url = picture_url
    db.commit()
    db.refresh(user)
    return user


def upsert_email_user(db: Session, *, email: str, name: str | None) -> User:
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, name=name or email.split("@", 1)[0], google_sub=None)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    if name and user.name != name:
        user.name = name
        db.commit()
        db.refresh(user)
    return user


@router.get("/config", response_model=AuthConfigOut)
def auth_config() -> AuthConfigOut:
    settings = get_settings()
    return AuthConfigOut(google_enabled=settings.google_enabled, dev_auth=settings.enable_dev_auth)


@router.get("/me", response_model=UserOut)
def me(request: Request, db: Session = Depends(get_db)) -> UserOut:
    user_id = getattr(request.state, "user_id", None)
    if not isinstance(user_id, UUID):
        raise unauthorized()
    user = db.get(User, user_id)
    if user is None:
        raise unauthorized()
    return user_out(user)


@router.get("/google/start")
def google_start() -> Response:
    settings = get_settings()
    if not settings.google_enabled:
        return JSONResponse({"detail": "Google sign-in is not configured"}, status_code=503)
    state = secrets.token_urlsafe(24)
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.oauth_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
        "access_type": "online",
    }
    response = RedirectResponse(f"{GOOGLE_AUTH_URL}?{urlencode(params)}", status_code=302)
    set_oauth_state_cookie(response, state)
    return response


@router.get("/google/callback")
def google_callback(request: Request, db: Session = Depends(get_db)) -> Response:
    settings = get_settings()
    if not settings.google_enabled:
        return _frontend_redirect("#/login", error="not_configured")

    code = request.query_params.get("code")
    state = request.query_params.get("state")
    cookie = request.cookies.get(OAUTH_STATE_COOKIE)
    expected = load_oauth_state(cookie) if cookie else None
    if not state or not expected or state != expected:
        response = _frontend_redirect("#/login", error="state_mismatch")
        clear_oauth_state_cookie(response)
        return response
    if not code:
        response = _frontend_redirect("#/login", error="missing_code")
        clear_oauth_state_cookie(response)
        return response

    try:
        profile = _google_profile(code)
    except (httpx.HTTPError, GoogleOAuthError, ValueError, KeyError):
        response = _frontend_redirect("#/login", error="token_failed")
        clear_oauth_state_cookie(response)
        return response

    if profile.get("email_verified") not in (True, "true"):
        response = _frontend_redirect("#/login", error="email_unverified")
        clear_oauth_state_cookie(response)
        return response

    sub = profile.get("sub")
    email_raw = profile.get("email")
    if not isinstance(sub, str) or not isinstance(email_raw, str):
        response = _frontend_redirect("#/login", error="token_failed")
        clear_oauth_state_cookie(response)
        return response

    email = normalize_email(email_raw)
    name = profile.get("name") if isinstance(profile.get("name"), str) else None
    picture = profile.get("picture") if isinstance(profile.get("picture"), str) else None

    try:
        user = upsert_google_user(db, sub=sub, email=email, name=name, picture_url=picture)
    except ValueError:
        response = _frontend_redirect("#/login", error="email_conflict")
        clear_oauth_state_cookie(response)
        return response

    response = _frontend_redirect("#/")
    clear_oauth_state_cookie(response)
    set_session_cookie(response, user.id)
    return response


@router.post("/logout", status_code=204)
def logout() -> Response:
    response = Response(status_code=204)
    clear_session_cookie(response)
    return response


def _google_profile(code: str) -> dict[str, Any]:
    settings = get_settings()
    with httpx.Client(timeout=10.0) as client:
        token_response = client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.oauth_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        token_response.raise_for_status()
        token_body = token_response.json()
        access_token = token_body.get("access_token")
        if not isinstance(access_token, str):
            raise GoogleOAuthError("missing access_token")
        userinfo = client.get(GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"})
        userinfo.raise_for_status()
        body = userinfo.json()
        if not isinstance(body, dict):
            raise GoogleOAuthError("invalid userinfo")
        return body
