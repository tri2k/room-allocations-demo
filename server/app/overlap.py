from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Activity, Allocation, Room


def has_overlap(
    db: Session,
    event_id: UUID,
    room_id: UUID,
    start_at: datetime,
    end_at: datetime,
    exclude_id: UUID | None = None,
) -> bool:
    query = select(Allocation.id).where(
        Allocation.event_id == event_id,
        Allocation.room_id == room_id,
        Allocation.start_at < end_at,
        Allocation.end_at > start_at,
    )
    if exclude_id is not None:
        query = query.where(Allocation.id != exclude_id)
    return db.scalar(query) is not None


def room_type_warnings(activity: Activity, room: Room) -> list[dict[str, str]]:
    allowed = activity.allowed_room_types or []
    if not allowed or room.room_type in allowed:
        return []
    return [
        {
            "code": "ROOM_TYPE_MISMATCH",
            "message": f"{activity.name} is not recommended in {room.room_type} rooms",
        }
    ]
