from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.access import owned_allocation, owned_sheet
from app.booking import get_bookable_room
from app.db import get_db
from app.deps import current_user_id
from app.errors import conflict, not_found
from app.models import Activity, Allocation, Building, Room, Sheet
from app.overlap import has_overlap, room_type_warnings
from app.schemas import (
    AllocationCreate,
    AllocationOut,
    AllocationUpdate,
    AllocationWriteOut,
    BulkAllocationCreate,
    BulkAllocationDelete,
    BulkAllocationOut,
    BulkAllocationPatch,
    BulkAllocationPatchOut,
    BulkSkipped,
    WarningOut,
)
from app.serialize import allocation_out
from app.timeutil import parse_tz_dt
from app.write import commit_or_conflict

router = APIRouter(prefix="/api/v1", tags=["allocations"])


def _activity_for_sheet(db: Session, activity_id: UUID, sheet_id: UUID) -> Activity:
    activity = db.get(Activity, activity_id)
    if activity is None or activity.sheet_id != sheet_id:
        raise not_found("Activity")
    return activity


def _sheet_room_ids(sheet: Sheet) -> set[UUID]:
    return {UUID(str(room_id)) for room_id in (sheet.included_room_ids or [])}


def _require_sheet_room(sheet: Sheet, room_id: UUID) -> None:
    if room_id not in _sheet_room_ids(sheet):
        raise conflict("Room is not on this sheet")


def _allocation(db: Session, allocation_id: UUID) -> Allocation:
    row = db.get(Allocation, allocation_id)
    if row is None:
        raise not_found("Allocation")
    return row


@router.get("/sheets/{sheet_id}/allocations", response_model=list[AllocationOut])
def list_allocations(
    sheet_id: UUID, db: Session = Depends(get_db), user_id: UUID = Depends(current_user_id)
) -> list[AllocationOut]:
    sheet = owned_sheet(db, sheet_id, user_id)
    rows = db.scalars(select(Allocation).where(Allocation.sheet_id == sheet_id)).all()
    return [allocation_out(row, sheet.timezone) for row in rows]


@router.post("/sheets/{sheet_id}/allocations", response_model=AllocationWriteOut, status_code=201)
def create_allocation(
    sheet_id: UUID, body: AllocationCreate, db: Session = Depends(get_db), user_id: UUID = Depends(current_user_id)
) -> AllocationWriteOut:
    sheet = owned_sheet(db, sheet_id, user_id)
    _require_sheet_room(sheet, body.room_id)
    room, _building = get_bookable_room(db, body.room_id)
    activity = _activity_for_sheet(db, body.activity_id, sheet_id)

    start_at = parse_tz_dt(body.start_at, sheet.timezone)
    end_at = parse_tz_dt(body.end_at, sheet.timezone)
    if end_at <= start_at:
        raise conflict("endAt must be after startAt")
    if has_overlap(db, sheet_id, body.room_id, start_at, end_at):
        raise conflict("Allocation overlaps an existing booking in this room")

    row = Allocation(
        sheet_id=sheet_id,
        room_id=body.room_id,
        activity_id=body.activity_id,
        start_at=start_at,
        end_at=end_at,
        notes=body.notes,
    )
    db.add(row)
    commit_or_conflict(db, overlap_detail="Allocation overlaps an existing booking in this room")
    db.refresh(row)
    return AllocationWriteOut(
        allocation=allocation_out(row, sheet.timezone),
        warnings=[WarningOut(**item) for item in room_type_warnings(activity, room)],
    )


@router.post("/sheets/{sheet_id}/allocations/bulk", response_model=BulkAllocationOut)
def bulk_create_allocations(
    sheet_id: UUID, body: BulkAllocationCreate, db: Session = Depends(get_db), user_id: UUID = Depends(current_user_id)
) -> BulkAllocationOut:
    sheet = owned_sheet(db, sheet_id, user_id)
    activity = _activity_for_sheet(db, body.activity_id, sheet_id)

    start_at = parse_tz_dt(body.start_at, sheet.timezone)
    end_at = parse_tz_dt(body.end_at, sheet.timezone)
    if end_at <= start_at:
        raise conflict("endAt must be after startAt")

    created: list[UUID] = []
    skipped: list[BulkSkipped] = []
    warnings: list[WarningOut] = []

    included = _sheet_room_ids(sheet)
    for room_id in body.room_ids:
        if room_id not in included:
            skipped.append(BulkSkipped(room_id=room_id, reason="not_on_sheet"))
            continue
        room = db.get(Room, room_id)
        if room is None:
            skipped.append(BulkSkipped(room_id=room_id, reason="not_found"))
            continue
        building = db.get(Building, room.building_id)
        if not room.is_active or building is None or not building.is_active:
            skipped.append(BulkSkipped(room_id=room_id, reason="inactive"))
            continue
        if has_overlap(db, sheet_id, room_id, start_at, end_at):
            skipped.append(BulkSkipped(room_id=room_id, reason="overlap"))
            continue
        row = Allocation(
            sheet_id=sheet_id,
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

    commit_or_conflict(db, overlap_detail="Bulk create hit an overlapping allocation")
    return BulkAllocationOut(created=created, skipped=skipped, warnings=warnings)


@router.post("/sheets/{sheet_id}/allocations/bulk-patch", response_model=BulkAllocationPatchOut)
def bulk_patch_allocations(
    sheet_id: UUID, body: BulkAllocationPatch, db: Session = Depends(get_db), user_id: UUID = Depends(current_user_id)
) -> BulkAllocationPatchOut:
    sheet = owned_sheet(db, sheet_id, user_id)
    ids = [item.id for item in body.items]
    if len(ids) != len(set(ids)):
        raise conflict("Duplicate allocation id in bulk patch")

    planned: list[tuple[Allocation, dict]] = []
    for item in body.items:
        row = _allocation(db, item.id)
        if row.sheet_id != sheet_id:
            raise not_found("Allocation")
        data = item.model_dump(exclude_unset=True)
        data.pop("id", None)
        room_id = data.get("room_id", row.room_id)
        activity_id = data.get("activity_id", row.activity_id)
        start_at = parse_tz_dt(data["start_at"], sheet.timezone) if "start_at" in data else row.start_at
        end_at = parse_tz_dt(data["end_at"], sheet.timezone) if "end_at" in data else row.end_at
        if end_at <= start_at:
            raise conflict("endAt must be after startAt")
        _require_sheet_room(sheet, room_id)
        room, _building = get_bookable_room(db, room_id)
        activity = _activity_for_sheet(db, activity_id, sheet_id)
        planned.append(
            (
                row,
                {
                    "room": room,
                    "activity": activity,
                    "room_id": room_id,
                    "activity_id": activity_id,
                    "start_at": start_at,
                    "end_at": end_at,
                    "notes_set": "notes" in data,
                    "notes": data.get("notes"),
                },
            )
        )

    for index, (_row_a, a) in enumerate(planned):
        for _row_b, b in planned[index + 1 :]:
            if a["room_id"] == b["room_id"] and a["start_at"] < b["end_at"] and b["start_at"] < a["end_at"]:
                raise conflict("Allocation overlaps an existing booking in this room")

    exclude = {row.id for row, _item in planned}
    for _row, item in planned:
        if has_overlap(db, sheet_id, item["room_id"], item["start_at"], item["end_at"], exclude_ids=exclude):
            raise conflict("Allocation overlaps an existing booking in this room")

    warnings: list[WarningOut] = []
    for row, item in planned:
        row.room_id = item["room_id"]
        row.activity_id = item["activity_id"]
        row.start_at = item["start_at"]
        row.end_at = item["end_at"]
        if item["notes_set"]:
            row.notes = item["notes"]
        warnings.extend(WarningOut(**entry) for entry in room_type_warnings(item["activity"], item["room"]))

    commit_or_conflict(db, overlap_detail="Allocation overlaps an existing booking in this room")
    for row, _item in planned:
        db.refresh(row)
    return BulkAllocationPatchOut(
        allocations=[allocation_out(row, sheet.timezone) for row, _item in planned],
        warnings=warnings,
    )


@router.post("/sheets/{sheet_id}/allocations/bulk-delete", status_code=204)
def bulk_delete_allocations(
    sheet_id: UUID, body: BulkAllocationDelete, db: Session = Depends(get_db), user_id: UUID = Depends(current_user_id)
) -> None:
    owned_sheet(db, sheet_id, user_id)
    seen: set[UUID] = set()
    rows: list[Allocation] = []
    for allocation_id in body.ids:
        if allocation_id in seen:
            continue
        seen.add(allocation_id)
        row = db.get(Allocation, allocation_id)
        if row is None or row.sheet_id != sheet_id:
            raise not_found("Allocation")
        rows.append(row)
    for row in rows:
        db.delete(row)
    db.commit()


@router.patch("/allocations/{allocation_id}", response_model=AllocationWriteOut)
def update_allocation(
    allocation_id: UUID, body: AllocationUpdate, db: Session = Depends(get_db), user_id: UUID = Depends(current_user_id)
) -> AllocationWriteOut:
    row, sheet = owned_allocation(db, allocation_id, user_id)
    data = body.model_dump(exclude_unset=True)
    room_id = data.get("room_id", row.room_id)
    activity_id = data.get("activity_id", row.activity_id)
    start_at = parse_tz_dt(data["start_at"], sheet.timezone) if "start_at" in data else row.start_at
    end_at = parse_tz_dt(data["end_at"], sheet.timezone) if "end_at" in data else row.end_at
    if end_at <= start_at:
        raise conflict("endAt must be after startAt")

    _require_sheet_room(sheet, room_id)
    room, _building = get_bookable_room(db, room_id)
    activity = _activity_for_sheet(db, activity_id, sheet.id)
    if has_overlap(db, sheet.id, room_id, start_at, end_at, exclude_id=row.id):
        raise conflict("Allocation overlaps an existing booking in this room")

    row.room_id = room_id
    row.activity_id = activity_id
    row.start_at = start_at
    row.end_at = end_at
    if "notes" in data:
        row.notes = data["notes"]

    commit_or_conflict(db, overlap_detail="Allocation overlaps an existing booking in this room")
    db.refresh(row)
    return AllocationWriteOut(
        allocation=allocation_out(row, sheet.timezone),
        warnings=[WarningOut(**item) for item in room_type_warnings(activity, room)],
    )


@router.delete("/allocations/{allocation_id}", status_code=204)
def delete_allocation(
    allocation_id: UUID, db: Session = Depends(get_db), user_id: UUID = Depends(current_user_id)
) -> None:
    row, _sheet = owned_allocation(db, allocation_id, user_id)
    db.delete(row)
    db.commit()
