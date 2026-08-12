from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.errors import conflict, not_found
from app.models import Activity, Allocation, Building, Event, Floor, Room, TimeBlock
from app.schemas import (
    ActivityCreate,
    ActivityOut,
    ActivityUpdate,
    EventCreate,
    EventDetailOut,
    EventOut,
    EventUpdate,
    ScheduleOut,
    TimeBlockCreate,
    TimeBlockOut,
    TimeBlockUpdate,
)
from app.serialize import (
    activity_out,
    allocation_out,
    building_out,
    event_detail_out,
    event_out,
    floor_out,
    room_out,
    schedule_event_out,
    time_block_out,
)

router = APIRouter(prefix="/api/v1", tags=["events"])


def _event(db: Session, event_id: UUID) -> Event:
    row = db.get(Event, event_id)
    if row is None:
        raise not_found("Event")
    return row


def _activity(db: Session, activity_id: UUID) -> Activity:
    row = db.get(Activity, activity_id)
    if row is None:
        raise not_found("Activity")
    return row


def _time_block(db: Session, time_block_id: UUID) -> TimeBlock:
    row = db.get(TimeBlock, time_block_id)
    if row is None:
        raise not_found("Time block")
    return row


@router.get("/events", response_model=list[EventOut])
def list_events(db: Session = Depends(get_db)) -> list[EventOut]:
    rows = db.scalars(select(Event).order_by(Event.event_date, Event.name)).all()
    return [event_out(row) for row in rows]


@router.post("/events", response_model=EventOut, status_code=201)
def create_event(body: EventCreate, db: Session = Depends(get_db)) -> EventOut:
    row = Event(**body.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return event_out(row)


@router.get("/events/{event_id}", response_model=EventDetailOut)
def get_event(event_id: UUID, db: Session = Depends(get_db)) -> EventDetailOut:
    row = db.scalar(
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.activities), selectinload(Event.time_blocks))
    )
    if row is None:
        raise not_found("Event")
    return event_detail_out(row)


@router.patch("/events/{event_id}", response_model=EventOut)
def update_event(event_id: UUID, body: EventUpdate, db: Session = Depends(get_db)) -> EventOut:
    row = _event(db, event_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return event_out(row)


@router.get("/events/{event_id}/schedule", response_model=ScheduleOut)
def get_schedule(event_id: UUID, db: Session = Depends(get_db)) -> ScheduleOut:
    event = db.scalar(
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.activities), selectinload(Event.time_blocks), selectinload(Event.allocations))
    )
    if event is None:
        raise not_found("Event")

    buildings = list(db.scalars(select(Building).where(Building.is_active.is_(True)).order_by(Building.code)).all())
    if event.included_building_ids:
        allowed = set(event.included_building_ids)
        buildings = [building for building in buildings if building.id in allowed]
    building_ids = [building.id for building in buildings]

    if not building_ids:
        rooms = []
        floors = []
    else:
        rooms = list(
            db.scalars(
                select(Room)
                .where(Room.is_active.is_(True), Room.building_id.in_(building_ids))
                .order_by(Room.sort_order, Room.name)
            ).all()
        )
        floors = list(
            db.scalars(select(Floor).where(Floor.building_id.in_(building_ids)).order_by(Floor.sort_order)).all()
        )
    room_ids = {room.id for room in rooms}

    allocations = [row for row in event.allocations if row.room_id in room_ids]

    return ScheduleOut(
        event=schedule_event_out(event),
        buildings=[building_out(row) for row in buildings],
        floors=[floor_out(row) for row in floors],
        rooms=[room_out(row) for row in rooms],
        activities=[activity_out(row) for row in sorted(event.activities, key=lambda item: item.sort_order)],
        time_blocks=[time_block_out(row) for row in sorted(event.time_blocks, key=lambda item: item.sort_order)],
        allocations=[allocation_out(row, event) for row in allocations],
    )


@router.get("/events/{event_id}/activities", response_model=list[ActivityOut])
def list_activities(event_id: UUID, db: Session = Depends(get_db)) -> list[ActivityOut]:
    _event(db, event_id)
    rows = db.scalars(select(Activity).where(Activity.event_id == event_id).order_by(Activity.sort_order)).all()
    return [activity_out(row) for row in rows]


@router.post("/events/{event_id}/activities", response_model=ActivityOut, status_code=201)
def create_activity(event_id: UUID, body: ActivityCreate, db: Session = Depends(get_db)) -> ActivityOut:
    _event(db, event_id)
    row = Activity(event_id=event_id, **body.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return activity_out(row)


@router.patch("/activities/{activity_id}", response_model=ActivityOut)
def update_activity(activity_id: UUID, body: ActivityUpdate, db: Session = Depends(get_db)) -> ActivityOut:
    row = _activity(db, activity_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return activity_out(row)


@router.delete("/activities/{activity_id}", status_code=204)
def delete_activity(activity_id: UUID, db: Session = Depends(get_db)) -> None:
    row = _activity(db, activity_id)
    has_alloc = db.scalar(select(Allocation.id).where(Allocation.activity_id == activity_id))
    if has_alloc is not None:
        raise conflict("Cannot delete an activity that still has allocations")
    db.delete(row)
    db.commit()


@router.get("/events/{event_id}/time-blocks", response_model=list[TimeBlockOut])
def list_time_blocks(event_id: UUID, db: Session = Depends(get_db)) -> list[TimeBlockOut]:
    _event(db, event_id)
    rows = db.scalars(select(TimeBlock).where(TimeBlock.event_id == event_id).order_by(TimeBlock.sort_order)).all()
    return [time_block_out(row) for row in rows]


@router.post("/events/{event_id}/time-blocks", response_model=TimeBlockOut, status_code=201)
def create_time_block(event_id: UUID, body: TimeBlockCreate, db: Session = Depends(get_db)) -> TimeBlockOut:
    _event(db, event_id)
    row = TimeBlock(event_id=event_id, **body.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return time_block_out(row)


@router.patch("/time-blocks/{time_block_id}", response_model=TimeBlockOut)
def update_time_block(time_block_id: UUID, body: TimeBlockUpdate, db: Session = Depends(get_db)) -> TimeBlockOut:
    row = _time_block(db, time_block_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return time_block_out(row)


@router.delete("/time-blocks/{time_block_id}", status_code=204)
def delete_time_block(time_block_id: UUID, db: Session = Depends(get_db)) -> None:
    row = _time_block(db, time_block_id)
    db.delete(row)
    db.commit()
