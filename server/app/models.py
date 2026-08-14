from datetime import date, datetime, time
from uuid import UUID, uuid4

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, String, Time, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True)
    name: Mapped[str | None] = mapped_column(String(256))
    picture_url: Mapped[str | None] = mapped_column(String(1024))


class Building(TimestampMixin, Base):
    __tablename__ = "buildings"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    address: Mapped[str | None] = mapped_column(String(256))
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    floors: Mapped[list["Floor"]] = relationship(back_populates="building")
    rooms: Mapped[list["Room"]] = relationship(back_populates="building")


class Floor(TimestampMixin, Base):
    __tablename__ = "floors"
    __table_args__ = (UniqueConstraint("building_id", "label", name="floors_building_id_label_key"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    building_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("buildings.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(32), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)

    building: Mapped[Building] = relationship(back_populates="floors")
    rooms: Mapped[list["Room"]] = relationship(back_populates="floor")


class Room(TimestampMixin, Base):
    __tablename__ = "rooms"
    __table_args__ = (UniqueConstraint("building_id", "name", name="rooms_building_id_name_key"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    building_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("buildings.id", ondelete="CASCADE"), nullable=False
    )
    floor_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("floors.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(32), nullable=False)
    room_type: Mapped[str] = mapped_column(String(32), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    optimal_capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    sort_order: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    building: Mapped[Building] = relationship(back_populates="rooms")
    floor: Mapped[Floor | None] = relationship(back_populates="rooms")


class Event(TimestampMixin, Base):
    __tablename__ = "events"
    __table_args__ = (CheckConstraint("slot_minutes IN (5, 15, 30)", name="events_slot_minutes_check"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    event_date: Mapped[date] = mapped_column(Date, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    slot_minutes: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("15"))
    grid_start: Mapped[time] = mapped_column(Time, nullable=False, server_default=text("'07:00'"))
    grid_end: Mapped[time] = mapped_column(Time, nullable=False, server_default=text("'16:15'"))
    included_building_ids: Mapped[list[UUID] | None] = mapped_column(ARRAY(PGUUID(as_uuid=True)))
    team_count: Mapped[int | None] = mapped_column(Integer)

    activities: Mapped[list["Activity"]] = relationship(back_populates="event")
    time_blocks: Mapped[list["TimeBlock"]] = relationship(back_populates="event")
    allocations: Mapped[list["Allocation"]] = relationship(back_populates="event")


class Activity(TimestampMixin, Base):
    __tablename__ = "activities"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    event_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False)
    default_duration_min: Mapped[int] = mapped_column(Integer, nullable=False)
    allowed_room_types: Mapped[list] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    event: Mapped[Event] = relationship(back_populates="activities")
    allocations: Mapped[list["Allocation"]] = relationship(back_populates="activity")


class TimeBlock(TimestampMixin, Base):
    __tablename__ = "time_blocks"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    event_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    label: Mapped[str] = mapped_column(String(64), nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    color: Mapped[str | None] = mapped_column(String(7))
    linked_activity_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("activities.id", ondelete="SET NULL")
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    event: Mapped[Event] = relationship(back_populates="time_blocks")


class Allocation(TimestampMixin, Base):
    __tablename__ = "allocations"
    __table_args__ = (CheckConstraint("end_at > start_at", name="allocations_end_after_start"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    event_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    room_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    activity_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("activities.id", ondelete="RESTRICT"), nullable=False
    )
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    notes: Mapped[str | None] = mapped_column(String(512))

    event: Mapped[Event] = relationship(back_populates="allocations")
    activity: Mapped[Activity] = relationship(back_populates="allocations")
    room: Mapped[Room] = relationship()
