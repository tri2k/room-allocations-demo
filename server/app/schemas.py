from datetime import date, datetime, time
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class APIModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class BuildingCreate(APIModel):
    code: str
    name: str
    address: str | None = None
    tags: list[Any] = Field(default_factory=list)


class BuildingUpdate(APIModel):
    code: str | None = None
    name: str | None = None
    address: str | None = None
    tags: list[Any] | None = None
    is_active: bool | None = None


class BuildingOut(APIModel):
    id: UUID
    code: str
    name: str
    address: str | None = None
    tags: list[Any] = Field(default_factory=list)
    is_active: bool


class FloorCreate(APIModel):
    label: str
    sort_order: int


class FloorUpdate(APIModel):
    label: str | None = None
    sort_order: int | None = None


class FloorOut(APIModel):
    id: UUID
    building_id: UUID
    label: str
    sort_order: int


class RoomCreate(APIModel):
    building_id: UUID
    floor_id: UUID | None = None
    name: str
    room_type: str
    capacity: int
    optimal_capacity: int
    tags: list[Any] = Field(default_factory=list)
    sort_order: int | None = None


class RoomUpdate(APIModel):
    building_id: UUID | None = None
    floor_id: UUID | None = None
    name: str | None = None
    room_type: str | None = None
    capacity: int | None = None
    optimal_capacity: int | None = None
    tags: list[Any] | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class RoomOut(APIModel):
    id: UUID
    building_id: UUID
    floor_id: UUID | None
    name: str
    room_type: str
    capacity: int
    optimal_capacity: int
    tags: list[Any] = Field(default_factory=list)
    sort_order: int | None = None
    is_active: bool


class EventCreate(APIModel):
    name: str
    event_date: date
    timezone: str
    slot_minutes: int = 15
    grid_start: time = time(7, 0)
    grid_end: time = time(16, 15)
    included_building_ids: list[UUID] | None = None
    team_count: int | None = None


class EventUpdate(APIModel):
    name: str | None = None
    event_date: date | None = None
    timezone: str | None = None
    slot_minutes: int | None = None
    grid_start: time | None = None
    grid_end: time | None = None
    included_building_ids: list[UUID] | None = None
    team_count: int | None = None


class ActivityCreate(APIModel):
    name: str
    color: str
    default_duration_min: int
    allowed_room_types: list[str] = Field(default_factory=list)
    sort_order: int = 0


class ActivityUpdate(APIModel):
    name: str | None = None
    color: str | None = None
    default_duration_min: int | None = None
    allowed_room_types: list[str] | None = None
    sort_order: int | None = None


class ActivityOut(APIModel):
    id: UUID
    name: str
    color: str
    default_duration_min: int
    allowed_room_types: list[str] = Field(default_factory=list)
    sort_order: int = 0


class TimeBlockCreate(APIModel):
    label: str
    start_time: time
    end_time: time
    color: str | None = None
    linked_activity_id: UUID | None = None
    sort_order: int = 0


class TimeBlockUpdate(APIModel):
    label: str | None = None
    start_time: time | None = None
    end_time: time | None = None
    color: str | None = None
    linked_activity_id: UUID | None = None
    sort_order: int | None = None


class TimeBlockOut(APIModel):
    id: UUID
    label: str
    start_time: str
    end_time: str
    color: str | None = None
    linked_activity_id: UUID | None = None
    sort_order: int = 0


class EventOut(APIModel):
    id: UUID
    name: str
    event_date: date
    timezone: str
    slot_minutes: int
    grid_start: str
    grid_end: str
    included_building_ids: list[UUID] | None = None
    team_count: int | None = None


class EventDetailOut(EventOut):
    activities: list[ActivityOut]
    time_blocks: list[TimeBlockOut]


class AllocationCreate(APIModel):
    room_id: UUID
    activity_id: UUID
    start_at: datetime
    end_at: datetime
    notes: str | None = None


class AllocationUpdate(APIModel):
    room_id: UUID | None = None
    activity_id: UUID | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    notes: str | None = None


class AllocationOut(APIModel):
    id: UUID
    room_id: UUID
    activity_id: UUID
    start_at: str
    end_at: str
    notes: str | None = None


class WarningOut(APIModel):
    code: str
    message: str


class AllocationWriteOut(APIModel):
    allocation: AllocationOut
    warnings: list[WarningOut] = Field(default_factory=list)


class BulkAllocationCreate(APIModel):
    room_ids: list[UUID]
    activity_id: UUID
    start_at: datetime
    end_at: datetime
    notes: str | None = None


class BulkSkipped(APIModel):
    room_id: UUID
    reason: str


class BulkAllocationOut(APIModel):
    created: list[UUID]
    skipped: list[BulkSkipped]
    warnings: list[WarningOut] = Field(default_factory=list)


class ScheduleEventOut(APIModel):
    id: UUID
    name: str
    event_date: date
    timezone: str
    slot_minutes: int
    grid_start: str
    grid_end: str


class ScheduleOut(APIModel):
    event: ScheduleEventOut
    buildings: list[BuildingOut]
    floors: list[FloorOut]
    rooms: list[RoomOut]
    activities: list[ActivityOut]
    time_blocks: list[TimeBlockOut]
    allocations: list[AllocationOut]
