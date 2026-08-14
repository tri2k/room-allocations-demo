from uuid import UUID

from sqlalchemy.orm import Session

from app.errors import not_found
from app.models import Activity, Allocation, Sheet, TimeBlock


def owned_sheet(db: Session, sheet_id: UUID, user_id: UUID) -> Sheet:
    row = db.get(Sheet, sheet_id)
    if row is None or row.owner_id != user_id:
        raise not_found("Sheet")
    return row


def _owned_parent(db: Session, sheet_id: UUID, user_id: UUID, entity: str) -> Sheet:
    sheet = db.get(Sheet, sheet_id)
    if sheet is None or sheet.owner_id != user_id:
        raise not_found(entity)
    return sheet


def owned_activity(db: Session, activity_id: UUID, user_id: UUID) -> tuple[Activity, Sheet]:
    row = db.get(Activity, activity_id)
    if row is None:
        raise not_found("Activity")
    return row, _owned_parent(db, row.sheet_id, user_id, "Activity")


def owned_time_block(db: Session, time_block_id: UUID, user_id: UUID) -> tuple[TimeBlock, Sheet]:
    row = db.get(TimeBlock, time_block_id)
    if row is None:
        raise not_found("Time block")
    return row, _owned_parent(db, row.sheet_id, user_id, "Time block")


def owned_allocation(db: Session, allocation_id: UUID, user_id: UUID) -> tuple[Allocation, Sheet]:
    row = db.get(Allocation, allocation_id)
    if row is None:
        raise not_found("Allocation")
    return row, _owned_parent(db, row.sheet_id, user_id, "Allocation")
