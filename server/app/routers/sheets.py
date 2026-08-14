from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.access import owned_activity, owned_sheet, owned_time_block
from app.booking import get_bookable_room
from app.db import get_db
from app.deps import current_user_id
from app.errors import conflict, not_found, unprocessable
from app.models import Activity, Allocation, Building, Event, Floor, Room, Sheet, TimeBlock
from app.schemas import (
    ActivityCreate,
    ActivityOut,
    ActivityUpdate,
    ScheduleOut,
    SheetCreate,
    SheetOut,
    SheetUpdate,
    TimeBlockCreate,
    TimeBlockOut,
    TimeBlockUpdate,
)
from app.serialize import (
    activity_out,
    allocation_out,
    building_out,
    floor_out,
    room_out,
    schedule_event_out,
    sheet_out,
    time_block_out,
)
from app.timeutil import retarget_dt
from app.write import commit_or_conflict

router = APIRouter(prefix="/api/v1", tags=["sheets"])


def _event(db: Session, event_id: UUID) -> Event:
    row = db.get(Event, event_id)
    if row is None:
        raise not_found("Event")
    return row


def _assert_linked_activity(db: Session, sheet_id: UUID, linked_activity_id: UUID | None) -> None:
    if linked_activity_id is None:
        return
    activity = db.get(Activity, linked_activity_id)
    if activity is None:
        raise not_found("Activity")
    if activity.sheet_id != sheet_id:
        raise conflict("linkedActivityId must belong to this sheet")


def _require_rooms(db: Session, room_ids: list[UUID], *, existing: set[UUID] | None = None) -> None:
    keep = existing or set()
    for room_id in room_ids:
        room = db.get(Room, room_id)
        if room is None:
            raise not_found("Room")
        if room_id in keep:
            continue
        get_bookable_room(db, room_id)


@router.get("/events/{event_id}/sheets", response_model=list[SheetOut])
def list_sheets(event_id: UUID, db: Session = Depends(get_db), user_id: UUID = Depends(current_user_id)) -> list[SheetOut]:
    _event(db, event_id)
    rows = db.scalars(
        select(Sheet).where(Sheet.event_id == event_id, Sheet.owner_id == user_id).order_by(Sheet.updated_at.desc())
    ).all()
    return [sheet_out(row) for row in rows]


@router.post("/events/{event_id}/sheets", response_model=SheetOut, status_code=201)
def create_sheet(
    event_id: UUID, body: SheetCreate, db: Session = Depends(get_db), user_id: UUID = Depends(current_user_id)
) -> SheetOut:
    event = _event(db, event_id)
    plan_date = body.plan_date or event.event_date
    if plan_date is None:
        raise unprocessable("planDate is required when the event has no date")
    timezone = body.timezone or event.timezone
    slot_minutes = body.slot_minutes if body.slot_minutes is not None else event.slot_minutes
    grid_start = body.grid_start if body.grid_start is not None else event.grid_start
    grid_end = body.grid_end if body.grid_end is not None else event.grid_end
    if grid_end <= grid_start:
        raise unprocessable("gridEnd must be after gridStart")
    _require_rooms(db, body.included_room_ids)

    row = Sheet(
        title=body.title.strip() or "Untitled",
        event_id=event.id,
        owner_id=user_id,
        plan_date=plan_date,
        timezone=timezone,
        slot_minutes=slot_minutes,
        grid_start=grid_start,
        grid_end=grid_end,
        included_room_ids=body.included_room_ids,
    )
    db.add(row)
    db.flush()
    for index, item in enumerate(body.activities):
        db.add(
            Activity(
                sheet_id=row.id,
                name=item.name,
                color=item.color,
                default_duration_min=item.default_duration_min,
                allowed_room_types=item.allowed_room_types,
                sort_order=index,
            )
        )
    commit_or_conflict(db)
    db.refresh(row)
    return sheet_out(row)


@router.get("/sheets/{sheet_id}", response_model=SheetOut)
def get_sheet(sheet_id: UUID, db: Session = Depends(get_db), user_id: UUID = Depends(current_user_id)) -> SheetOut:
    return sheet_out(owned_sheet(db, sheet_id, user_id))


@router.patch("/sheets/{sheet_id}", response_model=SheetOut)
def update_sheet(
    sheet_id: UUID, body: SheetUpdate, db: Session = Depends(get_db), user_id: UUID = Depends(current_user_id)
) -> SheetOut:
    row = db.scalar(select(Sheet).where(Sheet.id == sheet_id).options(selectinload(Sheet.allocations)))
    if row is None or row.owner_id != user_id:
        raise not_found("Sheet")
    data = body.model_dump(exclude_unset=True)
    old_date = row.plan_date
    old_tz = row.timezone
    if "included_room_ids" in data:
        next_ids: list[UUID] = data["included_room_ids"]
        previous = set(row.included_room_ids or [])
        removed = previous - set(next_ids)
        if removed:
            has_alloc = db.scalar(
                select(Allocation.id).where(Allocation.sheet_id == row.id, Allocation.room_id.in_(removed))
            )
            if has_alloc is not None:
                raise conflict("Cannot remove a room that still has allocations")
        _require_rooms(db, next_ids, existing=previous)
    if "title" in data:
        data["title"] = (data["title"] or "").strip() or "Untitled"
    grid_start = data.get("grid_start", row.grid_start)
    grid_end = data.get("grid_end", row.grid_end)
    if grid_end <= grid_start:
        raise unprocessable("gridEnd must be after gridStart")
    for key, value in data.items():
        setattr(row, key, value)
    if row.plan_date != old_date or row.timezone != old_tz:
        for allocation in row.allocations:
            allocation.start_at = retarget_dt(allocation.start_at, old_tz, row.plan_date, row.timezone)
            allocation.end_at = retarget_dt(allocation.end_at, old_tz, row.plan_date, row.timezone)
    commit_or_conflict(db)
    db.refresh(row)
    return sheet_out(row)


@router.delete("/sheets/{sheet_id}", status_code=204)
def delete_sheet(sheet_id: UUID, db: Session = Depends(get_db), user_id: UUID = Depends(current_user_id)) -> None:
    row = owned_sheet(db, sheet_id, user_id)
    db.delete(row)
    db.commit()


@router.get("/sheets/{sheet_id}/schedule", response_model=ScheduleOut)
def get_schedule(sheet_id: UUID, db: Session = Depends(get_db), user_id: UUID = Depends(current_user_id)) -> ScheduleOut:
    sheet = db.scalar(
        select(Sheet)
        .where(Sheet.id == sheet_id)
        .options(
            selectinload(Sheet.event),
            selectinload(Sheet.activities),
            selectinload(Sheet.time_blocks),
            selectinload(Sheet.allocations),
        )
    )
    if sheet is None or sheet.owner_id != user_id:
        raise not_found("Sheet")

    included = list(sheet.included_room_ids or [])
    if included:
        rooms = list(
            db.scalars(select(Room).where(Room.id.in_(included)).order_by(Room.sort_order, Room.name)).all()
        )
        by_id = {room.id: room for room in rooms}
        rooms = [by_id[room_id] for room_id in included if room_id in by_id]
    else:
        rooms = []
    building_ids = list({room.building_id for room in rooms})
    buildings = (
        list(db.scalars(select(Building).where(Building.id.in_(building_ids)).order_by(Building.code)).all())
        if building_ids
        else []
    )
    floors = (
        list(db.scalars(select(Floor).where(Floor.building_id.in_(building_ids)).order_by(Floor.sort_order)).all())
        if building_ids
        else []
    )
    room_ids = {room.id for room in rooms}
    allocations = [row for row in sheet.allocations if row.room_id in room_ids]

    return ScheduleOut(
        event=schedule_event_out(sheet.event),
        sheet=sheet_out(sheet),
        buildings=[building_out(row) for row in buildings],
        floors=[floor_out(row) for row in floors],
        rooms=[room_out(row) for row in rooms],
        activities=[activity_out(row) for row in sorted(sheet.activities, key=lambda item: item.sort_order)],
        time_blocks=[time_block_out(row) for row in sorted(sheet.time_blocks, key=lambda item: item.sort_order)],
        allocations=[allocation_out(row, sheet.timezone) for row in allocations],
    )


@router.get("/sheets/{sheet_id}/activities", response_model=list[ActivityOut])
def list_activities(
    sheet_id: UUID, db: Session = Depends(get_db), user_id: UUID = Depends(current_user_id)
) -> list[ActivityOut]:
    owned_sheet(db, sheet_id, user_id)
    rows = db.scalars(select(Activity).where(Activity.sheet_id == sheet_id).order_by(Activity.sort_order)).all()
    return [activity_out(row) for row in rows]


@router.post("/sheets/{sheet_id}/activities", response_model=ActivityOut, status_code=201)
def create_activity(
    sheet_id: UUID, body: ActivityCreate, db: Session = Depends(get_db), user_id: UUID = Depends(current_user_id)
) -> ActivityOut:
    owned_sheet(db, sheet_id, user_id)
    row = Activity(sheet_id=sheet_id, **body.model_dump())
    db.add(row)
    commit_or_conflict(db)
    db.refresh(row)
    return activity_out(row)


@router.patch("/activities/{activity_id}", response_model=ActivityOut)
def update_activity(
    activity_id: UUID, body: ActivityUpdate, db: Session = Depends(get_db), user_id: UUID = Depends(current_user_id)
) -> ActivityOut:
    row, _sheet = owned_activity(db, activity_id, user_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    commit_or_conflict(db)
    db.refresh(row)
    return activity_out(row)


@router.delete("/activities/{activity_id}", status_code=204)
def delete_activity(activity_id: UUID, db: Session = Depends(get_db), user_id: UUID = Depends(current_user_id)) -> None:
    row, _sheet = owned_activity(db, activity_id, user_id)
    has_alloc = db.scalar(select(Allocation.id).where(Allocation.activity_id == activity_id))
    if has_alloc is not None:
        raise conflict("Cannot delete an activity that still has allocations")
    db.delete(row)
    db.commit()


@router.get("/sheets/{sheet_id}/time-blocks", response_model=list[TimeBlockOut])
def list_time_blocks(
    sheet_id: UUID, db: Session = Depends(get_db), user_id: UUID = Depends(current_user_id)
) -> list[TimeBlockOut]:
    owned_sheet(db, sheet_id, user_id)
    rows = db.scalars(select(TimeBlock).where(TimeBlock.sheet_id == sheet_id).order_by(TimeBlock.sort_order)).all()
    return [time_block_out(row) for row in rows]


@router.post("/sheets/{sheet_id}/time-blocks", response_model=TimeBlockOut, status_code=201)
def create_time_block(
    sheet_id: UUID, body: TimeBlockCreate, db: Session = Depends(get_db), user_id: UUID = Depends(current_user_id)
) -> TimeBlockOut:
    owned_sheet(db, sheet_id, user_id)
    _assert_linked_activity(db, sheet_id, body.linked_activity_id)
    row = TimeBlock(sheet_id=sheet_id, **body.model_dump())
    db.add(row)
    commit_or_conflict(db)
    db.refresh(row)
    return time_block_out(row)


@router.patch("/time-blocks/{time_block_id}", response_model=TimeBlockOut)
def update_time_block(
    time_block_id: UUID, body: TimeBlockUpdate, db: Session = Depends(get_db), user_id: UUID = Depends(current_user_id)
) -> TimeBlockOut:
    row, sheet = owned_time_block(db, time_block_id, user_id)
    data = body.model_dump(exclude_unset=True)
    start_time = data.get("start_time", row.start_time)
    end_time = data.get("end_time", row.end_time)
    if end_time <= start_time:
        raise unprocessable("endTime must be after startTime")
    if "linked_activity_id" in data:
        _assert_linked_activity(db, sheet.id, data["linked_activity_id"])
    for key, value in data.items():
        setattr(row, key, value)
    commit_or_conflict(db)
    db.refresh(row)
    return time_block_out(row)


@router.delete("/time-blocks/{time_block_id}", status_code=204)
def delete_time_block(
    time_block_id: UUID, db: Session = Depends(get_db), user_id: UUID = Depends(current_user_id)
) -> None:
    row, _sheet = owned_time_block(db, time_block_id, user_id)
    db.delete(row)
    db.commit()
