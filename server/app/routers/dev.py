from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.schemas import EventOut
from app.seed import reseed
from app.serialize import event_out

router = APIRouter(prefix="/api/v1/dev", tags=["dev"])


@router.post("/reseed", response_model=EventOut)
def reseed_endpoint(db: Session = Depends(get_db)) -> EventOut:
    if not get_settings().enable_dev_reseed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    event = reseed(db)
    return event_out(event)
