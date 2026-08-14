from uuid import UUID

from fastapi import Request

from app.errors import unauthorized


def current_user_id(request: Request) -> UUID:
    user_id = getattr(request.state, "user_id", None)
    if not isinstance(user_id, UUID):
        raise unauthorized()
    return user_id
