from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from app.models import Event


def format_hhmm(value: time) -> str:
    return value.strftime("%H:%M")


def parse_event_dt(value: datetime, event: Event) -> datetime:
    tz = ZoneInfo(event.timezone)
    if value.tzinfo is None:
        return value.replace(tzinfo=tz)
    return value.astimezone(tz)


def format_event_dt(value: datetime, event: Event) -> str:
    return value.astimezone(ZoneInfo(event.timezone)).isoformat()


def retarget_dt(value: datetime, old_timezone: str, new_date: date, new_timezone: str) -> datetime:
    """Keep the wall-clock time, move it onto new_date in new_timezone."""
    wall = value.astimezone(ZoneInfo(old_timezone)).time()
    return datetime.combine(new_date, wall, tzinfo=ZoneInfo(new_timezone))
