from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import conflict, not_found
from app.models import Floor, Room
from app.schemas import FloorOut, FloorUpdate
from app.serialize import floor_out

router = APIRouter(prefix="/api/v1", tags=["floors"])


def _floor(db: Session, floor_id: UUID) -> Floor:
    row = db.get(Floor, floor_id)
    if row is None:
        raise not_found("Floor")
    return row


@router.patch("/floors/{floor_id}", response_model=FloorOut)
def update_floor(floor_id: UUID, body: FloorUpdate, db: Session = Depends(get_db)) -> FloorOut:
    row = _floor(db, floor_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return floor_out(row)


@router.delete("/floors/{floor_id}", status_code=204)
def delete_floor(floor_id: UUID, db: Session = Depends(get_db)) -> None:
    row = _floor(db, floor_id)
    room_count = db.scalar(select(func.count()).select_from(Room).where(Room.floor_id == floor_id)) or 0
    if room_count > 0:
        raise conflict("Cannot delete a floor that still has rooms")
    db.delete(row)
    db.commit()
