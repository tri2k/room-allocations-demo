from datetime import datetime, time
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
