from fastapi import HTTPException
from psycopg2 import errorcodes
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import conflict

CONSTRAINT_MESSAGES = {
    "buildings_code_key": "Building code already exists",
    "floors_building_id_label_key": "A floor with this label already exists in this building",
    "rooms_building_id_name_key": "A room with this name already exists in this building",
    "allocations_no_overlap": "Allocation overlaps an existing booking in this room",
    "events_slot_minutes_check": "slotMinutes must be 5, 15, or 30",
    "allocations_end_after_start": "endAt must be after startAt",
}


def conflict_from_integrity(exc: IntegrityError, *, overlap_detail: str | None = None) -> HTTPException:
    orig = exc.orig
    constraint = ""
    diag = getattr(orig, "diag", None)
    if diag is not None:
        constraint = diag.constraint_name or ""
    if constraint == "allocations_no_overlap" and overlap_detail:
        return conflict(overlap_detail)
    if constraint in CONSTRAINT_MESSAGES:
        return conflict(CONSTRAINT_MESSAGES[constraint])
    pgcode = getattr(orig, "pgcode", None)
    if pgcode == errorcodes.UNIQUE_VIOLATION:
        return conflict("Duplicate resource")
    if pgcode == errorcodes.EXCLUSION_VIOLATION:
        return conflict(overlap_detail or "Allocation overlaps an existing booking in this room")
    if pgcode == errorcodes.CHECK_VIOLATION:
        return conflict("Request failed a database check constraint")
    return conflict("Request conflicts with existing data")


def commit_or_conflict(db: Session, *, overlap_detail: str | None = None) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise conflict_from_integrity(exc, overlap_detail=overlap_detail) from exc
