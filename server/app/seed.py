from datetime import date, datetime, time
from pathlib import Path
from uuid import uuid4
import json

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Activity, Allocation, Building, Event, Floor, Room, Sheet, TimeBlock, User
from app.timeutil import parse_tz_dt

SEED_PATH = Path(__file__).resolve().parent.parent / "data" / "bmmt-2026.json"

TABLES = (
    "allocations",
    "time_blocks",
    "activities",
    "sheets",
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
    event_date = date.fromisoformat(event_raw["eventDate"])
    event = Event(
        id=uuid4(),
        name=event_raw["name"],
        event_date=event_date,
        timezone=event_raw["timezone"],
        slot_minutes=event_raw["slotMinutes"],
        grid_start=time.fromisoformat(event_raw["gridStart"]),
        grid_end=time.fromisoformat(event_raw["gridEnd"]),
    )
    db.add(event)
    db.flush()

    owner = ensure_seed_owner(db)
    included = [room_ids[item["id"]] for item in raw["rooms"]]
    sheet = Sheet(
        title=event_raw["name"],
        event_id=event.id,
        owner_id=owner.id,
        plan_date=event_date,
        timezone=event.timezone,
        slot_minutes=event.slot_minutes,
        grid_start=event.grid_start,
        grid_end=event.grid_end,
        included_room_ids=included,
    )
    db.add(sheet)
    db.flush()

    for index, item in enumerate(raw["activities"]):
        row = Activity(
            id=uuid4(),
            sheet_id=sheet.id,
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
                sheet_id=sheet.id,
                label=item["label"],
                start_time=time.fromisoformat(item["startTime"]),
                end_time=time.fromisoformat(item["endTime"]),
                color=item.get("color"),
                sort_order=index,
            )
        )

    db.flush()

    for item in raw["allocations"]:
        start = parse_tz_dt(datetime.fromisoformat(item["startAt"]), event.timezone)
        end = parse_tz_dt(datetime.fromisoformat(item["endAt"]), event.timezone)
        db.add(
            Allocation(
                id=uuid4(),
                sheet_id=sheet.id,
                room_id=room_ids[item["roomId"]],
                activity_id=activity_ids[item["activityId"]],
                start_at=start,
                end_at=end,
                notes=item.get("notes"),
            )
        )

    db.flush()
    return event


def ensure_seed_owner(db: Session) -> User:
    email = get_settings().seed_owner_email.strip().lower()
    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        return existing
    user = User(email=email, name="Seed owner", google_sub=None)
    db.add(user)
    db.flush()
    return user


def reseed(db: Session) -> Event:
    wipe(db)
    event = seed_from_json(db)
    db.commit()
    db.refresh(event)
    return event
