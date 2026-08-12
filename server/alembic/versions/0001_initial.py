"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-08-11
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0001_initial"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE buildings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          code VARCHAR(16) NOT NULL UNIQUE,
          name VARCHAR(128) NOT NULL,
          address VARCHAR(256),
          tags JSONB NOT NULL DEFAULT '[]',
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE floors (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
          label VARCHAR(32) NOT NULL,
          sort_order INT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (building_id, label)
        );

        CREATE TABLE rooms (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
          floor_id UUID REFERENCES floors(id) ON DELETE SET NULL,
          name VARCHAR(32) NOT NULL,
          room_type VARCHAR(32) NOT NULL,
          capacity INT NOT NULL,
          optimal_capacity INT NOT NULL,
          tags JSONB NOT NULL DEFAULT '[]',
          sort_order INT,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (building_id, name)
        );

        CREATE TABLE events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(128) NOT NULL,
          event_date DATE NOT NULL,
          timezone VARCHAR(64) NOT NULL,
          slot_minutes INT NOT NULL DEFAULT 15 CHECK (slot_minutes IN (5, 15, 30)),
          grid_start TIME NOT NULL DEFAULT '07:00',
          grid_end TIME NOT NULL DEFAULT '16:15',
          included_building_ids UUID[],
          team_count INT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE activities (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          name VARCHAR(64) NOT NULL,
          color VARCHAR(7) NOT NULL,
          default_duration_min INT NOT NULL,
          allowed_room_types JSONB NOT NULL DEFAULT '[]',
          sort_order INT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE time_blocks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          label VARCHAR(64) NOT NULL,
          start_time TIME NOT NULL,
          end_time TIME NOT NULL,
          color VARCHAR(7),
          linked_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
          sort_order INT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE allocations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE RESTRICT,
          start_at TIMESTAMPTZ NOT NULL,
          end_at TIMESTAMPTZ NOT NULL,
          notes VARCHAR(512),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CHECK (end_at > start_at)
        );

        CREATE EXTENSION IF NOT EXISTS btree_gist;
        ALTER TABLE allocations ADD CONSTRAINT allocations_no_overlap
          EXCLUDE USING gist (
            event_id WITH =,
            room_id WITH =,
            tstzrange(start_at, end_at) WITH &&
          );
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS allocations CASCADE;
        DROP TABLE IF EXISTS time_blocks CASCADE;
        DROP TABLE IF EXISTS activities CASCADE;
        DROP TABLE IF EXISTS events CASCADE;
        DROP TABLE IF EXISTS rooms CASCADE;
        DROP TABLE IF EXISTS floors CASCADE;
        DROP TABLE IF EXISTS buildings CASCADE;
        """
    )
