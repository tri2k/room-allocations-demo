from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import not_found, unprocessable
from app.models import Event
from app.schemas import EventCreate, EventOut, EventUpdate
from app.serialize import event_out
from app.write import commit_or_conflict

router = APIRouter(prefix="/api/v1", tags=["events"])


def _event(db: Session, event_id: UUID) -> Event:
    row = db.get(Event, event_id)
    if row is None:
        raise not_found("Event")
    return row


@router.get("/events", response_model=list[EventOut])
def list_events(db: Session = Depends(get_db)) -> list[EventOut]:
    rows = db.scalars(select(Event).order_by(Event.event_date.nulls_last(), Event.name)).all()
    return [event_out(row) for row in rows]


@router.post("/events", response_model=EventOut, status_code=201)
def create_event(body: EventCreate, db: Session = Depends(get_db)) -> EventOut:
    row = Event(**body.model_dump())
    db.add(row)
    commit_or_conflict(db)
    db.refresh(row)
    return event_out(row)


@router.get("/events/{event_id}", response_model=EventOut)
def get_event(event_id: UUID, db: Session = Depends(get_db)) -> EventOut:
    return event_out(_event(db, event_id))


@router.patch("/events/{event_id}", response_model=EventOut)
def update_event(event_id: UUID, body: EventUpdate, db: Session = Depends(get_db)) -> EventOut:
    row = _event(db, event_id)
    data = body.model_dump(exclude_unset=True)
    grid_start = data.get("grid_start", row.grid_start)
    grid_end = data.get("grid_end", row.grid_end)
    if grid_end <= grid_start:
        raise unprocessable("gridEnd must be after gridStart")
    for key, value in data.items():
        setattr(row, key, value)
    commit_or_conflict(db)
    db.refresh(row)
    return event_out(row)
