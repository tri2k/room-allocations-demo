from datetime import date, datetime, time
from pathlib import Path
from uuid import uuid4
import json

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import Activity, Allocation, Building, Event, Floor, Room, TimeBlock
from app.timeutil import parse_event_dt

SEED_PATH = Path(__file__).resolve().parent.parent / "data" / "bmmt-2026.json"

TABLES = (
    "allocations",
    "time_blocks",
    "activities",
    "events",
    "rooms",
    "floors",
    "buildings",
)


def wipe(db: Session) -> None:
    db.execute(text("TRUNCATE {} RESTART IDENTITY CASCADE".format(", ".join(TABLES))))


def seed_from_json(db: Session, path: Path = SEED_PATH) -> Event:
    raw = json.loads(path.read_text())
    building_ids: dict[str, object] = {}
    floor_ids: dict[str, object] = {}
    room_ids: dict[str, object] = {}
    activity_ids: dict[str, object] = {}

    for item in raw["buildings"]:
        row = Building(id=uuid4(), code=item["code"], name=item["name"])
        db.add(row)
        building_ids[item["id"]] = row.id

    for item in raw["floors"]:
        row = Floor(
            id=uuid4(),
            building_id=building_ids[item["buildingId"]],
            label=item["label"],
            sort_order=item["sortOrder"],
        )
        db.add(row)
        floor_ids[item["id"]] = row.id

    for item in raw["rooms"]:
        row = Room(
            id=uuid4(),
            building_id=building_ids[item["buildingId"]],
            floor_id=floor_ids.get(item["floorId"]) if item.get("floorId") else None,
            name=item["name"],
            room_type=item["roomType"],
            capacity=item["capacity"],
            optimal_capacity=item["optimalCapacity"],
            sort_order=item.get("sortOrder"),
        )
        db.add(row)
        room_ids[item["id"]] = row.id

    event_raw = raw["event"]
    event = Event(
        id=uuid4(),
        name=event_raw["name"],
        event_date=date.fromisoformat(event_raw["eventDate"]),
        timezone=event_raw["timezone"],
        slot_minutes=event_raw["slotMinutes"],
        grid_start=time.fromisoformat(event_raw["gridStart"]),
        grid_end=time.fromisoformat(event_raw["gridEnd"]),
    )
    db.add(event)
    db.flush()

    for index, item in enumerate(raw["activities"]):
        row = Activity(
            id=uuid4(),
            event_id=event.id,
            name=item["name"],
            color=item["color"],
            default_duration_min=item["defaultDurationMin"],
            allowed_room_types=item.get("allowedRoomTypes", []),
            sort_order=index,
        )
        db.add(row)
        activity_ids[item["id"]] = row.id

    for index, item in enumerate(raw["timeBlocks"]):
        db.add(
            TimeBlock(
                id=uuid4(),
                event_id=event.id,
                label=item["label"],
                start_time=time.fromisoformat(item["startTime"]),
                end_time=time.fromisoformat(item["endTime"]),
                color=item.get("color"),
                sort_order=index,
            )
        )

    db.flush()

    for item in raw["allocations"]:
        start = parse_event_dt(datetime.fromisoformat(item["startAt"]), event)
        end = parse_event_dt(datetime.fromisoformat(item["endAt"]), event)
        db.add(
            Allocation(
                id=uuid4(),
                event_id=event.id,
                room_id=room_ids[item["roomId"]],
                activity_id=activity_ids[item["activityId"]],
                start_at=start,
                end_at=end,
                notes=item.get("notes"),
            )
        )

    db.flush()
    return event


def reseed(db: Session) -> Event:
    wipe(db)
    event = seed_from_json(db)
    db.commit()
    db.refresh(event)
    return event
