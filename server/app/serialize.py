from app.models import Activity, Allocation, Building, Event, Floor, Room, TimeBlock
from app.schemas import (
    ActivityOut,
    AllocationOut,
    BuildingOut,
    EventDetailOut,
    EventOut,
    FloorOut,
    RoomOut,
    ScheduleEventOut,
    TimeBlockOut,
)
from app.timeutil import format_event_dt, format_hhmm


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
    base = event_out(row)
    return EventDetailOut(
        **base.model_dump(),
        activities=[activity_out(item) for item in sorted(row.activities, key=lambda a: a.sort_order)],
        time_blocks=[time_block_out(item) for item in sorted(row.time_blocks, key=lambda t: t.sort_order)],
    )


def schedule_event_out(row: Event) -> ScheduleEventOut:
    return ScheduleEventOut(
        id=row.id,
        name=row.name,
        event_date=row.event_date,
        timezone=row.timezone,
        slot_minutes=row.slot_minutes,
        grid_start=format_hhmm(row.grid_start),
        grid_end=format_hhmm(row.grid_end),
    )


def allocation_out(row: Allocation, event: Event) -> AllocationOut:
    return AllocationOut(
        id=row.id,
        room_id=row.room_id,
        activity_id=row.activity_id,
        start_at=format_event_dt(row.start_at, event),
        end_at=format_event_dt(row.end_at, event),
        notes=row.notes,
    )
