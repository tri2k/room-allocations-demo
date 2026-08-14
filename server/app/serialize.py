from app.models import Activity, Allocation, Building, Event, Floor, Room, Sheet, TimeBlock, User
from app.schemas import (
    ActivityOut,
    AllocationOut,
    BuildingOut,
    EventDetailOut,
    EventOut,
    FloorOut,
    RoomOut,
    ScheduleEventOut,
    SheetOut,
    TimeBlockOut,
    UserOut,
)
from app.timeutil import format_hhmm, format_tz_dt


def user_out(row: User) -> UserOut:
    return UserOut.model_validate(row)


def building_out(row: Building) -> BuildingOut:
    return BuildingOut.model_validate(row)


def floor_out(row: Floor) -> FloorOut:
    return FloorOut.model_validate(row)


def room_out(row: Room) -> RoomOut:
    return RoomOut.model_validate(row)


def activity_out(row: Activity) -> ActivityOut:
    return ActivityOut.model_validate(row)


def time_block_out(row: TimeBlock) -> TimeBlockOut:
    return TimeBlockOut(
        id=row.id,
        label=row.label,
        start_time=format_hhmm(row.start_time),
        end_time=format_hhmm(row.end_time),
        color=row.color,
        linked_activity_id=row.linked_activity_id,
        sort_order=row.sort_order,
    )


def event_out(row: Event) -> EventOut:
    return EventOut(
        id=row.id,
        name=row.name,
        event_date=row.event_date,
        timezone=row.timezone,
        slot_minutes=row.slot_minutes,
        grid_start=format_hhmm(row.grid_start),
        grid_end=format_hhmm(row.grid_end),
        included_building_ids=row.included_building_ids,
        team_count=row.team_count,
    )


def event_detail_out(row: Event) -> EventDetailOut:
    return EventDetailOut.model_validate(event_out(row).model_dump())


def schedule_event_out(row: Event) -> ScheduleEventOut:
    return ScheduleEventOut(id=row.id, name=row.name, event_date=row.event_date)


def sheet_out(row: Sheet) -> SheetOut:
    return SheetOut(
        id=row.id,
        title=row.title,
        event_id=row.event_id,
        owner_id=row.owner_id,
        plan_date=row.plan_date,
        timezone=row.timezone,
        slot_minutes=row.slot_minutes,
        grid_start=format_hhmm(row.grid_start),
        grid_end=format_hhmm(row.grid_end),
        included_room_ids=list(row.included_room_ids or []),
    )


def allocation_out(row: Allocation, timezone: str) -> AllocationOut:
    return AllocationOut(
        id=row.id,
        room_id=row.room_id,
        activity_id=row.activity_id,
        start_at=format_tz_dt(row.start_at, timezone),
        end_at=format_tz_dt(row.end_at, timezone),
        notes=row.notes,
    )
