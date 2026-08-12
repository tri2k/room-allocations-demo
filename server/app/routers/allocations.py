from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import conflict, not_found
from app.models import Activity, Allocation, Event, Room
from app.overlap import has_overlap, room_type_warnings
from app.schemas import (
    AllocationCreate,
    AllocationOut,
    AllocationUpdate,
    AllocationWriteOut,
    BulkAllocationCreate,
    BulkAllocationOut,
    BulkSkipped,
    WarningOut,
)
from app.serialize import allocation_out
from app.timeutil import parse_event_dt

router = APIRouter(prefix="/api/v1", tags=["allocations"])


def _event(db: Session, event_id: UUID) -> Event:
    row = db.get(Event, event_id)
    if row is None:
        raise not_found("Event")
    return row


def _allocation(db: Session, allocation_id: UUID) -> Allocation:
    row = db.get(Allocation, allocation_id)
    if row is None:
        raise not_found("Allocation")
    return row


@router.get("/events/{event_id}/allocations", response_model=list[AllocationOut])
def list_allocations(event_id: UUID, db: Session = Depends(get_db)) -> list[AllocationOut]:
    event = _event(db, event_id)
    rows = db.scalars(select(Allocation).where(Allocation.event_id == event_id)).all()
    return [allocation_out(row, event) for row in rows]


@router.post("/events/{event_id}/allocations", response_model=AllocationWriteOut, status_code=201)
def create_allocation(event_id: UUID, body: AllocationCreate, db: Session = Depends(get_db)) -> AllocationWriteOut:
    event = _event(db, event_id)
    room = db.get(Room, body.room_id)
    activity = db.get(Activity, body.activity_id)
    if room is None:
        raise not_found("Room")
    if activity is None or activity.event_id != event_id:
        raise not_found("Activity")

    start_at = parse_event_dt(body.start_at, event)
    end_at = parse_event_dt(body.end_at, event)
    if end_at <= start_at:
        raise conflict("endAt must be after startAt")
    if has_overlap(db, event_id, body.room_id, start_at, end_at):
        raise conflict("Allocation overlaps an existing booking in this room")

    row = Allocation(
        event_id=event_id,
        room_id=body.room_id,
        activity_id=body.activity_id,
        start_at=start_at,
        end_at=end_at,
        notes=body.notes,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise conflict("Allocation overlaps an existing booking in this room") from exc
    db.refresh(row)
    return AllocationWriteOut(
        allocation=allocation_out(row, event),
        warnings=[WarningOut(**item) for item in room_type_warnings(activity, room)],
    )


@router.post("/events/{event_id}/allocations/bulk", response_model=BulkAllocationOut)
def bulk_create_allocations(
    event_id: UUID, body: BulkAllocationCreate, db: Session = Depends(get_db)
) -> BulkAllocationOut:
    event = _event(db, event_id)
    activity = db.get(Activity, body.activity_id)
    if activity is None or activity.event_id != event_id:
        raise not_found("Activity")

    start_at = parse_event_dt(body.start_at, event)
    end_at = parse_event_dt(body.end_at, event)
    if end_at <= start_at:
        raise conflict("endAt must be after startAt")

    created: list[UUID] = []
    skipped: list[BulkSkipped] = []
    warnings: list[WarningOut] = []

    for room_id in body.room_ids:
        room = db.get(Room, room_id)
        if room is None:
            skipped.append(BulkSkipped(room_id=room_id, reason="not_found"))
            continue
        if has_overlap(db, event_id, room_id, start_at, end_at):
            skipped.append(BulkSkipped(room_id=room_id, reason="overlap"))
            continue
        row = Allocation(
            event_id=event_id,
            room_id=room_id,
            activity_id=body.activity_id,
            start_at=start_at,
            end_at=end_at,
            notes=body.notes,
        )
        db.add(row)
        db.flush()
        created.append(row.id)
        warnings.extend(WarningOut(**item) for item in room_type_warnings(activity, room))

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise conflict("Bulk create hit an overlapping allocation") from exc

    return BulkAllocationOut(created=created, skipped=skipped, warnings=warnings)


@router.patch("/allocations/{allocation_id}", response_model=AllocationWriteOut)
def update_allocation(
    allocation_id: UUID, body: AllocationUpdate, db: Session = Depends(get_db)
) -> AllocationWriteOut:
    row = _allocation(db, allocation_id)
    event = _event(db, row.event_id)
    data = body.model_dump(exclude_unset=True)
    room_id = data.get("room_id", row.room_id)
    activity_id = data.get("activity_id", row.activity_id)
    start_at = parse_event_dt(data["start_at"], event) if "start_at" in data else row.start_at
    end_at = parse_event_dt(data["end_at"], event) if "end_at" in data else row.end_at
    if end_at <= start_at:
        raise conflict("endAt must be after startAt")
    if has_overlap(db, row.event_id, room_id, start_at, end_at, exclude_id=row.id):
        raise conflict("Allocation overlaps an existing booking in this room")

    room = db.get(Room, room_id)
    activity = db.get(Activity, activity_id)
    if room is None:
        raise not_found("Room")
    if activity is None:
        raise not_found("Activity")

    row.room_id = room_id
    row.activity_id = activity_id
    row.start_at = start_at
    row.end_at = end_at
    if "notes" in data:
        row.notes = data["notes"]

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise conflict("Allocation overlaps an existing booking in this room") from exc
    db.refresh(row)
    return AllocationWriteOut(
        allocation=allocation_out(row, event),
        warnings=[WarningOut(**item) for item in room_type_warnings(activity, room)],
    )


@router.delete("/allocations/{allocation_id}", status_code=204)
def delete_allocation(allocation_id: UUID, db: Session = Depends(get_db)) -> None:
    row = _allocation(db, allocation_id)
    db.delete(row)
    db.commit()
