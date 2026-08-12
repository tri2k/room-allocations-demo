from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import conflict, not_found
from app.models import Building, Floor, Room
from app.schemas import RoomCreate, RoomOut, RoomUpdate
from app.serialize import room_out

router = APIRouter(prefix="/api/v1", tags=["rooms"])


def _room(db: Session, room_id: UUID) -> Room:
    row = db.get(Room, room_id)
    if row is None:
        raise not_found("Room")
    return row


def _assert_floor_in_building(db: Session, building_id: UUID, floor_id: UUID | None) -> None:
    if floor_id is None:
        return
    floor = db.get(Floor, floor_id)
    if floor is None:
        raise not_found("Floor")
    if floor.building_id != building_id:
        raise conflict("Floor does not belong to the selected building")


@router.get("/rooms", response_model=list[RoomOut])
def list_rooms(
    building_id: UUID | None = Query(None, alias="buildingId"),
    floor_id: UUID | None = Query(None, alias="floorId"),
    is_active: bool | None = Query(None, alias="isActive"),
    db: Session = Depends(get_db),
) -> list[RoomOut]:
    query = select(Room)
    if building_id is not None:
        query = query.where(Room.building_id == building_id)
    if floor_id is not None:
        query = query.where(Room.floor_id == floor_id)
    if is_active is not None:
        query = query.where(Room.is_active == is_active)
    rows = db.scalars(query.order_by(Room.name)).all()
    return [room_out(row) for row in rows]


@router.post("/rooms", response_model=RoomOut, status_code=201)
def create_room(body: RoomCreate, db: Session = Depends(get_db)) -> RoomOut:
    if db.get(Building, body.building_id) is None:
        raise not_found("Building")
    _assert_floor_in_building(db, body.building_id, body.floor_id)
    row = Room(
        building_id=body.building_id,
        floor_id=body.floor_id,
        name=body.name,
        room_type=body.room_type,
        capacity=body.capacity,
        optimal_capacity=body.optimal_capacity,
        tags=body.tags,
        sort_order=body.sort_order,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return room_out(row)


@router.patch("/rooms/{room_id}", response_model=RoomOut)
def update_room(room_id: UUID, body: RoomUpdate, db: Session = Depends(get_db)) -> RoomOut:
    row = _room(db, room_id)
    data = body.model_dump(exclude_unset=True)
    building_id = data.get("building_id", row.building_id)
    floor_id = data["floor_id"] if "floor_id" in data else row.floor_id
    if "building_id" in data and db.get(Building, building_id) is None:
        raise not_found("Building")
    _assert_floor_in_building(db, building_id, floor_id)
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return room_out(row)


@router.delete("/rooms/{room_id}", response_model=RoomOut)
def delete_room(room_id: UUID, db: Session = Depends(get_db)) -> RoomOut:
    row = _room(db, room_id)
    row.is_active = False
    db.commit()
    db.refresh(row)
    return room_out(row)
