# Phase 1 Core Loop

**Status**: Implemented

Product context: [PRODUCT.md](../PRODUCT.md). Depends on [v0](2026-08-11-v0-vision-demo.md). Known v0 merge bug stays unfixed: [docs/known-bugs-v0.md](../docs/known-bugs-v0.md).

## Problem

v0 stores the whole schedule in one browser's `localStorage`. A refresh on another machine (or a cleared profile) loses the plan. Catalog and event cannot be reused next year. Overlaps are warnings only.

Phase 1 makes the catalog and schedule **server-backed** so one planner can persist work and pick it up later. Still single-user: no auth, no live collab.

## Design

### Decisions (this spec)

| Topic | Decision | Why |
| ----- | -------- | --- |
| GUIDELINES extras (Zustand, Tailwind, pnpm, TanStack Router, test/lint suite) | **Do not adopt** | v0 UI already works; extras are unrelated to persistence |
| Repo layout | `frontend/` (move current Vite app) + `server/` | GUIDELINES: introduce `frontend/` when a server exists |
| API | FastAPI, `/api/v1` | Matches PRODUCT.md |
| DB | PostgreSQL, SQLAlchemy 2, Alembic, `psycopg2-binary`, URL form `postgresql://...` | GUIDELINES DB default; avoid psycopg3 URL form |
| Local DB | `docker-compose` Postgres 16 on port 5432 | Repeatable; no assumption of a desktop Postgres |
| Python | 3.13, venv at `server/.venv` | Align with shebang/`python` on mixed OS later |
| Frontend persist | Grid reads/writes the API. Drop schedule `localStorage`. Keep orientation key only | Server is source of truth |
| Seed | `server` script loads `frontend/src/data/bmmt-2026.json` (or a copy under `server/data/`) into empty DB | Same BmMT demo data |
| Catalog UI | Minimal HTML/React pages: list + create/edit for buildings, floors, rooms, event metadata, activities, time blocks | Spec asked for simple admin, not polish |
| Overlap | API returns **409** on create/update/bulk that overlaps. Bulk skips conflicting rooms and reports them (same as v0 toast) | Server enforces the invariant |
| Room-type mismatch | **Warning** in JSON, request still succeeds | Exceptions are intentional (auditorium check-in) |
| Merged-block edit bug | **Out of scope** | Documented v0 known bug |
| Collapse/other v0 UI bugs | **Out of scope** unless they block API wiring | Persistence first |

### Runtime

```
planner
  -> Vite SPA (frontend/, port 5173)
       -> proxied /api/v1 -> FastAPI (server/, port 8000)
            -> PostgreSQL (Docker)
```

Vite `server.proxy`: `/api` → `http://127.0.0.1:8000`.

No auth. Anyone who can reach the API can mutate. Acceptable for single-planner local/dev.

### Domain (persisted)

Same concepts as PRODUCT.md. Every row gets `id` (UUID), `created_at`, `updated_at`. Buildings/rooms: `is_active` (soft delete). Floor: hard delete only if no rooms.

**Invariant:** no two allocations share `event_id` + `room_id` with overlapping `[start_at, end_at)`. Enforce in Postgres (`btree_gist` exclusion) **and** in the API (409).

Display label remains `{building.code}{room.name}`.

### Composite schedule (grid load)

`GET /api/v1/events/{id}/schedule` is the only call the grid needs to hydrate.

Response (camelCase for the SPA):

```json
{
  "event": {
    "id": "uuid",
    "name": "BmMT 2026",
    "eventDate": "2026-03-15",
    "timezone": "America/Los_Angeles",
    "slotMinutes": 15,
    "gridStart": "07:00",
    "gridEnd": "16:15"
  },
  "buildings": [{ "id": "uuid", "code": "DWIN", "name": "Dwinelle Hall" }],
  "floors": [{ "id": "uuid", "buildingId": "uuid", "label": "1", "sortOrder": 1 }],
  "rooms": [{ "id": "uuid", "buildingId": "uuid", "floorId": "uuid", "name": "155", "roomType": "auditorium", "capacity": 481, "optimalCapacity": 400 }],
  "activities": [{ "id": "uuid", "name": "Puzzle", "color": "#ffcc80", "defaultDurationMin": 75 }],
  "timeBlocks": [{ "id": "uuid", "label": "Puzzle", "startTime": "09:15", "endTime": "10:30", "color": "#ffcc80" }],
  "allocations": [{ "id": "uuid", "roomId": "uuid", "activityId": "uuid", "startAt": "2026-03-15T09:15:00", "endAt": "2026-03-15T10:30:00", "notes": null }]
}
```

IDs from seed JSON may be imported as-is if they are valid UUIDs; current seed uses strings like `b-dwin`. **Seed script generates UUIDs** and does not preserve v0 string ids. The SPA must not hard-code seed ids.

Timestamps: store `timestamptz`. API returns local-naive `YYYY-MM-DDTHH:mm:ss` in the event timezone for v0 compatibility, **or** ISO-8601 with offset. **Decision:** ISO-8601 with offset (`2026-03-15T09:15:00-07:00`). Update frontend `allocationStartSlot` to parse full ISO, not `slice(11, 16)` only — that is required wiring, not a drive-by refactor.

### SPA behavior changes

- On load: `GET /events` → if none, show “seed the DB” message; if one or more, pick the first event (single-event is enough for Phase 1) and `GET /events/{id}/schedule`.
- Create allocation (palette drop / bulk): `POST /events/{id}/allocations` or `.../bulk`.
- Move: `PATCH /allocations/{id}` `{ roomId, startAt, endAt }`. On 409, revert UI + toast.
- Resize: same PATCH. On 409, revert.
- Delete: `DELETE /allocations/{id}`.
- Reset: re-run seed is a **server** action (`POST /api/v1/dev/reseed` in local/dev only) or a documented CLI. SPA Reset button calls that, then reloads schedule. Not a production endpoint long-term; fine behind an env flag `ENABLE_DEV_RESEED=true`.
- Orientation stays in `localStorage`.
- Optimistic UI is allowed; 409/5xx must roll back.

Catalog admin (minimum):

- `/catalog/buildings` — list, create, edit, soft-delete
- Nested floors and rooms
- `/catalog/events/{id}` — name, date, timezone, slot/grid fields, activities, time blocks

No need for a visual design system. Functional forms.

### API

Base: `/api/v1`. JSON. UUID path params. 422 = validation, 404 = missing, 409 = overlap or delete floor with rooms.

| Method | Path | Notes |
| ------ | ---- | ----- |
| GET, POST | `/buildings` | POST body: `code`, `name`, optional `address`, `tags` |
| GET, PATCH | `/buildings/{id}` | |
| DELETE | `/buildings/{id}` | Soft-delete |
| GET, POST | `/buildings/{buildingId}/floors` | POST: `label`, `sortOrder` |
| PATCH, DELETE | `/floors/{id}` | DELETE 409 if rooms exist |
| GET, POST | `/rooms` | GET query: `buildingId`, `floorId`, `isActive` |
| PATCH, DELETE | `/rooms/{id}` | Soft-delete |
| GET, POST | `/events` | POST: `name`, `eventDate`, `timezone`, optional grid fields |
| GET, PATCH | `/events/{id}` | GET includes nested activities + timeBlocks |
| GET | `/events/{id}/schedule` | Composite above |
| GET, POST | `/events/{eventId}/activities` | |
| PATCH, DELETE | `/activities/{id}` | DELETE restricted if allocations exist (409) |
| GET, POST | `/events/{eventId}/time-blocks` | |
| PATCH, DELETE | `/time-blocks/{id}` | |
| GET, POST | `/events/{eventId}/allocations` | POST 409 on overlap |
| POST | `/events/{eventId}/allocations/bulk` | `{ roomIds, activityId, startAt, endAt, notes? }` |
| PATCH, DELETE | `/allocations/{id}` | PATCH 409 on overlap |
| POST | `/dev/reseed` | Dev only; wipe + load BmMT seed |

Bulk response:

```json
{
  "created": ["uuid"],
  "skipped": [{ "roomId": "uuid", "reason": "overlap" }]
}
```

Success-with-warnings example:

```json
{
  "allocation": { "id": "uuid" },
  "warnings": [{ "code": "ROOM_TYPE_MISMATCH", "message": "Relay is not recommended in auditorium rooms" }]
}
```

(`allowedRoomTypes` empty = no warning.)

Field names: **camelCase in JSON**, snake_case in SQL.

### PostgreSQL

Use the DDL already in this file’s previous draft (buildings, floors, rooms, events, activities, time_blocks, allocations + `btree_gist` exclusion). Alembic revision `0001_initial` creates it.

`included_building_ids` / `team_count` on `events`: store now, unused in UI until later phases.

### Local run

```bash
docker compose up -d postgres
cd server && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
python -m scripts.seed
uvicorn app.main:app --reload --port 8000

cd frontend && npm install && npm run dev
```

`.env.example`:

```
DATABASE_URL=postgresql://roomalloc:roomalloc@127.0.0.1:5432/roomalloc
ENABLE_DEV_RESEED=true
```

## In Scope

- Move Vite app to `frontend/`; add `server/` FastAPI app
- Docker Compose Postgres + Alembic `0001_initial`
- CRUD APIs listed above
- Composite schedule endpoint
- Bulk allocations with skip/overlap
- 409 on overlap; room-type warning payload
- Seed script + dev reseed
- SPA: load/save/delete/move/resize via API; Vite proxy
- Minimal catalog forms
- Update [docs/c4/](../docs/c4/README.md) in the same commit as the new containers
- Update AGENTS.md commands and PRODUCT.md Phase 1 status when shipping

## Not in Scope

- Auth, orgs, roles, WebSockets ([collaboration spec](2026-08-11-phase-2-collaboration.md), unsequenced)
- Proctors, CSV/PDF export, capacity dashboard (Phase 2); Sheets import (Phase 3)
- Fixing v0 merged-block leader-only edits
- Fixing v0 collapse/sticky-header/selection bugs (unless a bug makes API wiring impossible)
- Tailwind, Zustand, pnpm, TanStack Router, Vitest/Playwright, ESLint/Prettier
- Multi-event picker UX beyond “use the first event”
- Production deploy / hosted Postgres

## Implementation Plan

Each step should leave the repo runnable.

1. **Layout + Compose** — `frontend/` move, `server/` skeleton, `docker-compose.yml`, `.env.example`. Enables local Postgres.
2. **Schema** — SQLAlchemy models + Alembic `0001_initial`. Empty DB migrates.
3. **Read APIs** — buildings/floors/rooms/events + `GET schedule`. Enables a read-only grid against the DB after seed.
4. **Seed** — CLI + `POST /dev/reseed`. Demo data in Postgres.
5. **Write APIs** — allocation create/bulk/patch/delete with 409; remaining CRUD. Enables persist.
6. **SPA wiring** — replace localStorage schedule with API; keep v0 grid. Enables the product loop.
7. **Catalog forms** — enough to add a room without SQL. Enables non-seed catalog edits.
8. **Docs** — C4, AGENTS commands, PRODUCT Phase 1 → Implemented (or in-progress), CHANGELOG, spec post-implementation notes.

## Acceptance criteria

- [x] `alembic upgrade head` on empty Postgres succeeds
- [x] Seed creates one event whose `GET /events/{id}/schedule` matches v0 seed content (not v0 string ids)
- [x] Grid loads from that endpoint (no schedule in `localStorage`)
- [x] Palette drop, bulk floor assign, move, resize, delete persist and survive server + browser restart
- [x] Overlapping create/update returns 409; bulk reports `skipped`
- [x] Soft-deleted building/room omitted from schedule
- [x] Cannot delete a floor that still has rooms (409)
- [x] Cannot delete an activity that still has allocations (409)
- [x] Dev reseed restores the BmMT demo
- [x] C4 container diagram shows SPA, API, Postgres (no localStorage as schedule store)
- [x] Catalog: create a room and see it as a new grid column after reload

## Open Questions

- [x] GUIDELINES frontend extras this phase? **Decided: no**
- [x] `src/` vs `frontend/` + `server/`? **Decided: move to `frontend/` + `server/`**
- [x] ISO timestamp format? **Decided: offset ISO; fix SPA time parsing**
- [x] Hosted deploy target for Phase 1, or local-only until later? **Decided: local-only**
- [x] Should catalog live as routes inside the Vite app or a separate lightweight FastAPI Jinja admin? **Decided: Vite hash route `#/catalog`**

## Post-Implementation Notes

### Deviations
- Verified against the Homebrew Postgres already bound to `127.0.0.1:5432` (Docker Desktop was not running). `docker-compose.yml` remains the documented default; same `DATABASE_URL` works for either.
- Schedule rooms/buildings include `isActive` / `tags` in the JSON even though the grid ignores them.

### Additions
- `GET /health` on the API.
- Catalog is `#/catalog` (buildings, floors, rooms). Event setup moved to `#/event` after shipping: events are planned objects, not catalog rows.

### Deferred
- Hosted deploy
- Merged-block leader-only edits ([docs/known-bugs-v0.md](../docs/known-bugs-v0.md))
- Soft-delete ghost allocations (inactive rooms with lingering bookings that block overlaps)
- GUIDELINES extras (Zustand, Tailwind, pnpm, TanStack, tests)

### Post-ship UI fixes (2026-08-12)
- Collapse expand/collapse and transpose collapse parity
- Sticky headers and time gutter; transpose merge stacking over grid lines
- Drag/resize interaction polish; Reset failure handling; catalog reactivate; room floor scoping; clear selection

---

## PostgreSQL DDL

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
