from datetime import date, datetime, time
from zoneinfo import ZoneInfo


def format_hhmm(value: time) -> str:
    return value.strftime("%H:%M")


def parse_tz_dt(value: datetime, timezone: str) -> datetime:
    tz = ZoneInfo(timezone)
    if value.tzinfo is None:
        return value.replace(tzinfo=tz)
    return value.astimezone(tz)


def format_tz_dt(value: datetime, timezone: str) -> str:
    return value.astimezone(ZoneInfo(timezone)).isoformat()


def retarget_dt(value: datetime, old_timezone: str, new_date: date, new_timezone: str) -> datetime:
    """Keep the wall-clock time, move it onto new_date in new_timezone."""
    wall = value.astimezone(ZoneInfo(old_timezone)).time()
    return datetime.combine(new_date, wall, tzinfo=ZoneInfo(new_timezone))
