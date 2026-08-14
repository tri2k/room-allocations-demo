"""private sheets; move plan children off events

Revision ID: 0004_sheets
Revises: 0003_users
Create Date: 2026-08-14
"""

from datetime import date
from typing import Sequence, Union

from alembic import op
from sqlalchemy import bindparam, text
from sqlalchemy.dialects.postgresql import ARRAY, UUID as PGUUID

from app.config import get_settings

revision: str = "0004_sheets"
down_revision: Union[str, Sequence[str], None] = "0003_users"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        text(
            """
            CREATE TABLE sheets (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              title VARCHAR(128) NOT NULL DEFAULT 'Untitled',
              event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
              owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              plan_date DATE NOT NULL,
              timezone VARCHAR(64) NOT NULL,
              slot_minutes INT NOT NULL DEFAULT 15 CHECK (slot_minutes IN (5, 15, 30)),
              grid_start TIME NOT NULL DEFAULT '07:00',
              grid_end TIME NOT NULL DEFAULT '16:15',
              included_room_ids UUID[] NOT NULL DEFAULT '{}',
              created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            """
        )
    )
    conn.execute(text("CREATE INDEX ix_sheets_event_owner ON sheets (event_id, owner_id);"))
    conn.execute(text("ALTER TABLE events ALTER COLUMN event_date DROP NOT NULL;"))
    conn.execute(text("ALTER TABLE activities ADD COLUMN sheet_id UUID REFERENCES sheets(id) ON DELETE CASCADE;"))
    conn.execute(text("ALTER TABLE time_blocks ADD COLUMN sheet_id UUID REFERENCES sheets(id) ON DELETE CASCADE;"))
    conn.execute(text("ALTER TABLE allocations ADD COLUMN sheet_id UUID REFERENCES sheets(id) ON DELETE CASCADE;"))

    email = get_settings().seed_owner_email.strip().lower()
    user = conn.execute(text("SELECT id FROM users WHERE email = :email"), {"email": email}).fetchone()
    if user is None:
        user = conn.execute(
            text(
                """
                INSERT INTO users (email, name)
                VALUES (:email, 'Seed owner')
                RETURNING id
                """
            ),
            {"email": email},
        ).fetchone()
    owner_id = user[0]

    events = conn.execute(
        text(
            """
            SELECT id, name, event_date, timezone, slot_minutes, grid_start, grid_end, included_building_ids
            FROM events
            """
        )
    ).mappings()
    for event in events:
        if event["included_building_ids"]:
            rooms = conn.execute(
                text(
                    """
                    SELECT id FROM rooms
                    WHERE is_active IS TRUE AND building_id IN :building_ids
                    ORDER BY sort_order, name
                    """
                ).bindparams(bindparam("building_ids", expanding=True)),
                {"building_ids": list(event["included_building_ids"])},
            ).fetchall()
        else:
            rooms = conn.execute(
                text("SELECT id FROM rooms WHERE is_active IS TRUE ORDER BY sort_order, name")
            ).fetchall()
        room_ids = [row[0] for row in rooms]
        sheet = conn.execute(
            text(
                """
                INSERT INTO sheets (
                  title, event_id, owner_id, plan_date, timezone, slot_minutes, grid_start, grid_end, included_room_ids
                )
                VALUES (
                  :title, :event_id, :owner_id, :plan_date, :timezone, :slot_minutes, :grid_start, :grid_end, :rooms
                )
                RETURNING id
                """
            ).bindparams(bindparam("rooms", type_=ARRAY(PGUUID(as_uuid=True)))),
            {
                "title": event["name"],
                "event_id": event["id"],
                "owner_id": owner_id,
                "plan_date": event["event_date"] or date.today(),
                "timezone": event["timezone"],
                "slot_minutes": event["slot_minutes"],
                "grid_start": event["grid_start"],
                "grid_end": event["grid_end"],
                "rooms": room_ids,
            },
        ).fetchone()
        sheet_id = sheet[0]
        conn.execute(
            text("UPDATE activities SET sheet_id = :sheet_id WHERE event_id = :event_id"),
            {"sheet_id": sheet_id, "event_id": event["id"]},
        )
        conn.execute(
            text("UPDATE time_blocks SET sheet_id = :sheet_id WHERE event_id = :event_id"),
            {"sheet_id": sheet_id, "event_id": event["id"]},
        )
        conn.execute(
            text("UPDATE allocations SET sheet_id = :sheet_id WHERE event_id = :event_id"),
            {"sheet_id": sheet_id, "event_id": event["id"]},
        )

    conn.execute(text("ALTER TABLE allocations DROP CONSTRAINT allocations_no_overlap;"))
    conn.execute(text("ALTER TABLE activities DROP COLUMN event_id;"))
    conn.execute(text("ALTER TABLE time_blocks DROP COLUMN event_id;"))
    conn.execute(text("ALTER TABLE allocations DROP COLUMN event_id;"))
    conn.execute(text("ALTER TABLE activities ALTER COLUMN sheet_id SET NOT NULL;"))
    conn.execute(text("ALTER TABLE time_blocks ALTER COLUMN sheet_id SET NOT NULL;"))
    conn.execute(text("ALTER TABLE allocations ALTER COLUMN sheet_id SET NOT NULL;"))
    conn.execute(text("CREATE INDEX ix_activities_sheet_id ON activities (sheet_id);"))
    conn.execute(text("CREATE INDEX ix_time_blocks_sheet_id ON time_blocks (sheet_id);"))
    conn.execute(text("CREATE INDEX ix_allocations_sheet_id ON allocations (sheet_id);"))
    conn.execute(
        text(
            """
            ALTER TABLE allocations ADD CONSTRAINT allocations_no_overlap
              EXCLUDE USING gist (
                sheet_id WITH =,
                room_id WITH =,
                tstzrange(start_at, end_at) WITH &&
              ) DEFERRABLE INITIALLY DEFERRED;
            """
        )
    )


def downgrade() -> None:
    raise RuntimeError("0004_sheets cannot be reversed; restore from backup")
