from uuid import UUID

from sqlalchemy.orm import Session

from app.errors import conflict, not_found
from app.models import Building, Room


def get_active_building(db: Session, building_id: UUID) -> Building:
    building = db.get(Building, building_id)
    if building is None:
        raise not_found("Building")
    if not building.is_active:
        raise conflict("Building is inactive")
    return building


def get_bookable_room(db: Session, room_id: UUID) -> tuple[Room, Building]:
    room = db.get(Room, room_id)
    if room is None:
        raise not_found("Room")
    if not room.is_active:
        raise conflict("Room is inactive")
    building = get_active_building(db, room.building_id)
    return room, building
