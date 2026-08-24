# BMT ops platform (greenfield)

**Status**: Target design. This file is the parent for the integrated system. Workshop locks from [round 2](2026-08-23-bmt-2026-architecture.md) still apply. **The allocator prototype in this git repo is not a constraint** — ignore its tables, routes, Google login, and folder layout when designing.

Indoor maps (Figma import, Leaflet): [2026-08-21-indoor-maps.md](2026-08-21-indoor-maps.md). Catalog workshop: [2026-08-24-catalog.md](2026-08-24-catalog.md). Older “ops platform” / Phase 1–2 notes are history, not the build contract.

First event the product must run: **BMT 2026, Saturday 2026-11-14**. Design load: ~1800 contestants, ~50+ testing rooms, ~300 volunteers. Same org then runs semesterly contests (BmMT, …).

## Ground-up

We are designing **one product** that replaces the spreadsheet pile and last semester’s separate tools. We are not extending the drag-and-drop demo until it grows volunteers.

At implementation we may rewrite this repo or start a new tree. Specs describe the product. They do not have to match `server/app/models.py`.

**Thrown away as design input** (they exist only because the prototype did):

- Google OAuth “because Phase 2a shipped”
- Owner-only sheets and “non-owner gets 404”
- Hash routes (`#/catalog`), Vite proxy, FastAPI, Alembic, `roomalloc` as the database name
- Hardcoded `room_type` / `optimal_capacity` columns
- Multi-org marketplace (Phase 2c)
- As-built C4 as a picture of the target
- “Today’s room password is an env var” as the product (the *idea* of one shared room secret stays)

**Kept because we decided them in workshop**, not because code did:

- One Postgres, one database, six screens sharing `rooms.id`
- Catalog is sacred: day-of never updates rooms
- Draft grid → explicit import as frozen day plan; re-import keeps running clocks
- No live co-edit on the grid
- Room login = `{building code}{room name}` + one event password (not the staff password)
- Roster is a CSV snapshot from the registration product; students are not volunteer people
- Custom room fields; built-in `capacity` only (≥ 0)
- Building codes DWIN, WHLR, VLSB, MLK; code set at create
- `appears_on_grid` hedge; skip a Location supertype
- Timers, clarifications, projector, print backup as already locked

**Stack at build time is still open.** Architecture is: one web app, one API, one Postgres, a staff hostname and `live.berkeley.mt`, paper if the site dies. Language and UI library are not part of this design.

## What the product is

Six screens, one catalog:

| Screen | Job |
| ------ | --- |
| Catalog | Year-round rooms (capacity, custom fields). Typed by hand. |
| Allocator | Time × room draft for an event. One person builds it. |
| Day-of HQ | Frozen plan + live overlay (list and map). |
| Proctor / projector | Timer (start only) + clarifications. Laptop in the room. |
| Volunteers | People across semesters, form, assign to catalog rooms, check-in. |
| Public | `live.berkeley.mt` — announcements, maps. No public clock. |

Guests and volunteer *applicants* do not use the staff login. Projectors do not use the staff login.

## Persistence (same as workshop)

One PostgreSQL **server**, one **database**. Modules are screens plus related tables, not extra databases.

A **table group** is a cluster of related tables in that database. A **seam** is any copy (CSV, freeze a draft as the day plan, print). Keep seams when a snapshot is enough. Do not keep a catalog CSV into volunteers/maps/HQ — those need the live room list.

```text
One Postgres
  catalog      buildings, floors, rooms, custom field defs/values
  event        the occasion (BMT 2026) + clock defaults for new drafts
  draft plan   activities, time blocks, allocations  (allocator)
  day plan     frozen copy of one draft + Saturday overrides
  live         timers, clarifications, roster seats
  volunteers   people, applications, assignments
  maps         floor plates + polygons (optional room_id)
  public       announcements
  staff auth   whatever the staff-login choice needs (not the room password)
```

Join key: **`rooms.id`**. Display `DWIN155` is computed. Database name and hosting are an implementation choice.

**Not in this database as a product:** student registration/scoring (CSV in). Figma `.fig` files (import geometry). Dwinelle Navigator (not year one).

## Domain (target, not prototype)

| Concept | Meaning |
| ------- | ------- |
| Building | Hall. **Code** at create (`DWIN`), then read-only. Pretty name editable. |
| Floor | Label string (`C`, `D`, `E`, …). |
| Room | `name` (`155`) + `capacity` + `appears_on_grid` + `is_active` + custom fields. |
| Event | One contest (BMT 2026). Owns volunteers’ applications, the day plan, live state, room password. |
| Draft plan | Allocator grid. Visible to staff. Not a personal Google-owned document. |
| Day plan | Frozen import of one draft. Saturday writes overrides here, never the catalog. |
| Allocation | One activity in one room for one interval. One room × slot = one activity. |
| Person | Volunteer across semesters. Not a student, not a staff login. |
| Assignment | Person + event + role + optional room/building. |
| Roster seat | Imported student name + room + time. Two tests = two rows. Move in this app. |
| Map space | Geometry. Optional `room_id` (bathrooms have none). |

One org in product (BMT). No `org_id` required for v1.

**Draft plans** are club staff objects. The prototype’s “sheet owner” and 404-for-everyone-else go away unless we pick Google *and* want private drafts. Default: any staff who can sign in can open drafts; still **one writer at a time** (no live co-edit).

## Runtime

```text
Staff browser  →  API  →  Postgres
Room laptop    →  API  (room session)
Guest browser  →  API  (public routes only)   as live.berkeley.mt
```

Same API, different cookies. Public routes omit roster names, phones, HQ notes. Projector omits roster names.

If Postgres or the site dies: printed day plan, printed room password, assignment packet. Timers may keep ticking locally and show desync when they reconnect.

## Open (product, not leftover prototype)

- Staff sign-in: **Google** or **one staff password** (recommend staff password). Not the room password. Not catalog-only.
- Catalog room form: **checkbox** vs **kind dropdown** for “show on allocator grid.”
- HQ columns, activity names for focus tests, volunteer form fields, public per-room detail, clarification image storage, UI library / language.

## Next

Keep workshopping **catalog**, then the other screens, against this file. Do not ask whether the prototype already has a column. Slightly off details get fixed in module write-ups; do not reopen “day-of never writes catalog” or “one Postgres.”
