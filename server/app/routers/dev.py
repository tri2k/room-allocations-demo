from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.routers.auth import normalize_email, upsert_email_user
from app.schemas import DevLoginIn, EventOut, UserOut
from app.seed import reseed
from app.serialize import event_out, user_out
from app.sessionutil import set_session_cookie

router = APIRouter(prefix="/api/v1/dev", tags=["dev"])


@router.post("/reseed", response_model=EventOut)
def reseed_endpoint(db: Session = Depends(get_db)) -> EventOut:
    if not get_settings().enable_dev_reseed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    event = reseed(db)
    return event_out(event)


@router.post("/login", response_model=UserOut)
def dev_login(body: DevLoginIn, response: Response, db: Session = Depends(get_db)) -> UserOut:
    if not get_settings().enable_dev_auth:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    user = upsert_email_user(db, email=normalize_email(body.email), name=body.name)
    set_session_cookie(response, user.id)
    return user_out(user)
