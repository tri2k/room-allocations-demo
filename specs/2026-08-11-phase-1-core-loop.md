# Phase 1 Core Loop

**Status**: Draft

Persistent single-user product. Lifted from the former `SPEC.md` so the API/SQL design is not lost. Product context: [PRODUCT.md](../PRODUCT.md). Depends on [v0](2026-08-11-v0-vision-demo.md).

## Problem

v0 only lives in one browser profile. Catalog and schedule cannot be reused next year or edited from another machine.

## Design

Same domain as PRODUCT.md, persisted in PostgreSQL. FastAPI REST `/api/v1`. Grid talks to `GET /events/{id}/schedule` instead of seed JSON.

Full field tables, routes, and DDL are below (from the original spec). Overlap: server 409; room-type mismatch: warning in the response.

## In Scope

- Building / Floor / Room / Event / Activity / TimeBlock / Allocation CRUD
- Bulk allocations matching floor-select UX
- Server overlap rejection
- Alembic from empty DB
- v0 grid behaviors against the API

## Not in Scope

- Auth, orgs, WebSockets (Phase 2)
- Proctors, export, capacity dashboard (Phase 3+)

## Implementation Plan

1. Postgres + SQLAlchemy + Alembic (schema below)
2. REST CRUD + composite schedule endpoint
3. Point the existing grid at the API
4. Simple catalog admin forms

## Open Questions

- Adopt GUIDELINES extras (Tailwind, Zustand, pnpm) when this starts? See PRODUCT.md.

## Acceptance criteria

- [ ] All v0 grid behaviors work against API
- [ ] CRUD for buildings, floors, rooms, events, activities, time blocks
- [ ] Bulk allocation endpoint matches floor-select UX
- [ ] Server rejects overlapping allocations with 409
- [ ] Schedule survives server restart (Postgres)
- [ ] Alembic migration from empty DB

## API (draft)

Base URL: `/api/v1`. IDs are UUID strings. Timestamps ISO 8601 UTC.

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET/POST | `/buildings` | List / create |
| GET/PATCH | `/buildings/{id}` | Get / update |
| DELETE | `/buildings/{id}` | Soft-delete (`is_active=false`) |
| GET/POST | `/buildings/{building_id}/floors` | List / create |
| PATCH/DELETE | `/floors/{id}` | Update / delete if no rooms |
| GET/POST | `/rooms` | List (query `building_id`, `floor_id`, `is_active`) / create |
| PATCH/DELETE | `/rooms/{id}` | Update / soft-delete |
| GET/POST | `/events` | List / create |
| GET/PATCH | `/events/{id}` | Get nested / update |
| GET | `/events/{id}/schedule` | Composite: buildings, rooms, activities, timeBlocks, allocations |
| GET/POST | `/events/{event_id}/activities` | |
| PATCH/DELETE | `/activities/{id}` | |
| GET/POST | `/events/{event_id}/time-blocks` | |
| PATCH/DELETE | `/time-blocks/{id}` | |
| GET/POST | `/events/{event_id}/allocations` | |
| POST | `/events/{event_id}/allocations/bulk` | `{ room_ids, activity_id, start_at, end_at }` |
| PATCH/DELETE | `/allocations/{id}` | |

Bulk response: `{ "created": [...], "skipped": [{ "room_id", "reason": "overlap" }] }`. Errors: 409 overlap, 422 invalid range.

## PostgreSQL DDL (draft)

```sql
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
```
