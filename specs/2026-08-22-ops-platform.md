# Event operations platform

**Status**: Draft (vision — not a build order for this week)

Product context: [PRODUCT.md](../PRODUCT.md). This spec is the parent of the allocator (this repo today), [indoor maps](2026-08-21-indoor-maps.md), [catalog history](2026-08-13-catalog-history-and-plan-pins.md), and later ops / proctor / volunteer / public modules. Do not implement the whole platform in one pass. Do **protect the kernel** so those modules do not grow a second rooms list.

## Problem

BMT-style contests are run from a pile of spreadsheets and forms that all mention the same halls:

| Today | Pain |
| ----- | ---- |
| Classroom/capacity sheet | Source of truth until someone forgets to copy a column |
| Time × room grid | The allocator this repo already targets |
| Volunteer Google Form → attached sheet → LLM cleanup → another app | Room names typed again; dropouts edited in a sheet; no semester-to-semester person |
| Day-of status | Slack, memory, a printed grid |
| Proctor timers / clarifications | Separate from the plan that said “Indiv in DWIN155” |
| Guest maps (Figma, old Dwinelle Navigator) | Geometry and room codes not joined to the capacity sheet |

The costly redesign is not “we picked FastAPI.” It is **DWIN155 existing in six places**. Going straight for an integrated product only helps if those six UIs share one catalog and one published plan. It fails if we boil the ocean and ship none of them.

## Recommendation

**One org, one Postgres, one API, several modules.** A modular monolith on this stack (FastAPI + Postgres + Vite). Not six apps with six room tables. Not microservices.

Rooms are the **kernel**. Everything else is either a rare catalog edit, a **draft plan**, a **published plan**, or a **live overlay** on that plan.

```text
Identity (Google users, roles)
        │
        ▼
Catalog  Building → Floor → Room          ← kernel (capacity, type, ADA, …)
        │                 │
        │                 └── MapSpace (Figma geom; optional room_id)
        ▼
Event (BmMT 2026)
        │
        ├── People (volunteers across semesters; org-lifetime)
        │       └── Applications (this event)
        │       └── Assignments (this event: role + optional room/building)
        │
        ├── Sheets (private allocator drafts)
        │       └── Allocations (activity × room × time)
        │
        ├── PublishedPlan (one sheet snapshot selected for day-of)
        │
        ├── LiveRoomState (timer, headcount, status — day-of only)
        │       └── Clarifications (HQ → proctors)
        │
        └── PublicContent (announcements guests may see)
```

Figma does **not** own rooms. The volunteer form does **not** own rooms. The proctor timer does **not** own rooms. They all point at `rooms.id` (and display `DWIN155`).

## Design

### Decisions (this spec)

| Topic | Decision | Why |
| ----- | -------- | --- |
| Shape | Modular monolith, this repo | Student-org turnover; one deploy; one migration to add a room field |
| Kernel | Org-owned catalog: building / floor / room | Already in Phase 1–2b; missing org-scope until 2c |
| Draft vs day-of | Sheets stay drafts; **publish** one sheet per Event as the plan | Allocator can keep experimenting; ops must not sit on “FINAL v3” filename |
| Live vs plan | Live state is a **separate** row keyed by `event_id + room_id` (and time window) | Reality diverges (late start, extra time, room closed) without rewriting history |
| People vs users | `Person` (volunteer record) ≠ `User` (can sign in) | Volunteers exist before they ever open the allocator; link later via email/Google |
| Assignments | Generic `(person, event, role, room?, building?)` | Proctors, HQ, check-in, building leads — one table, not a parallel “proctor rooms” list |
| Maps | [Indoor maps spec](2026-08-21-indoor-maps.md): geom from Figma; join by code → `room_id` | Unjoined spaces (stairs, bathrooms) still draw; they never become grid columns |
| Public vs staff | Same API; **public routes are a denylist of fields**, not a second database | Guests get maps + coarse “Indiv in progress”; never rosters, phones, HQ notes |
| Wayfinding graph | **Not** v1. Floor finder + search first | Dwinelle Navigator is a 3D hallway graph; Figma toggle maps are floor plates, not that graph |
| Custom room fields | Known columns as real SQL; `JSONB extras` for rare one-offs | Adding `has_projector` to everyone is a migration; adding “piano” to two rooms is extras |
| Realtime | Server-authoritative clocks (`starts_at` / `ends_at`); poll ops v1; push later if clarifications need it | 50 rooms is a small JSON; drifting phone timers are the actual bug |
| C4 | Update as-built diagrams only when code lands | This file is target, not current commit |

### Component map

#### 1. Rooms catalog (kernel)

Replace the capacity spreadsheet. Edits to existing classrooms are rare; **adding a building** and **adding a column** are the two growth moves.

| Move | How |
| ---- | --- |
| New building + rooms | Catalog UI already: insert `buildings`, `floors`, `rooms` |
| New field on every room | Alembic column + form control (e.g. `accessible`, `seat_rows`) |
| One-off facts | `rooms.extras` JSONB, or tags you already have |
| Wrong capacity last year vs this year | [Catalog history / pins](2026-08-13-catalog-history-and-plan-pins.md) when scheduled — do not snapshot-copy rooms into volunteer or map tables |

**Do not** store polygons, timers, or proctor names here.

Identity: UUID plus stable display `{building.code}{room.name}`. Floor `label` must be the real code (`C`/`D`/`E`, not v0 `1`/`2`) before maps or volunteers can join without a translation table.

#### 2. Event room allocator (this repo)

Time × room grid. Allocations reference `room_id`. Many private sheets per Event (Phase 2b).

**New seam (not built):** `POST /events/{id}/publish` (or “Select for ops”) copies or **pins** one sheet as `events.published_sheet_id` (or a frozen snapshot — see open questions). Day-of tools read **only** the published plan. Planners can keep a backup sheet.

Until something is published, ops/public/proctor have no schedule. That is intentional.

#### 3. Day-of operations dashboard

Input: published plan. Output: list + later map of **plan vs live**.

Per room, HQ might see: assigned activity, assigned proctors (from Assignments), headcount vs capacity, timer, flags (late, extra time, closed).

Views are **projections** of the same rows:

- List: rooms as a table (closest to the spreadsheet they already stare at)
- Map: same `LiveRoomState` joined to [map spaces](2026-08-21-indoor-maps.md)
- (Later) building / floor filters

Ops **writes live fields**. It does not move Puzzle from 155 to 182 — that is an allocator edit + republish, or a deliberate “live override” flagged as diverged from plan.

#### 4. Proctor suite

Timer + clarifications for 50+ rooms. Attached to **this event’s assignment + published allocation**, not to the catalog forever.

- Timer: HQ starts/pauses an activity (or a room). Devices display remaining time from server timestamps.
- Clarifications: HQ posts “Q3: read n as n≥2” to all rooms with activity Indiv, or to one room. Proctors acknowledge.

Proctors are `Person`s with role `proctor` (or similar) on an `Assignment` with `room_id`. If they can sign in, `User` links to `Person`. The suite should work on a phone with a magic link or Google; it should not require the allocator UI.

Pulling the rooms catalog: **yes, by id**, so we never type “Dwinelle 155” into a fourth sheet.

#### 5. Public live site (guests)

Primary: contest status (“Indiv in progress”, lunch, delays). Secondary: useful maps.

Same map viewer as ops, **different live payload**:

| Show publicly | Hide |
| ------------- | ---- |
| Building/floor maps, room codes, bathrooms, exits | Proctor names, radios |
| Coarse activity (“Team round”) and maybe a shared countdown | Student names, seat maps, scores |
| Announcements HQ marked public | Internal HQ notes, volunteer emails |

Figma toggle maps (Dwinelle C/D/E, Wheeler B/1/2, VLSB 2) are the right **floor plates**. They relate to the catalog as: **one `MapSpace` per named plate → optional `room_id`**. Public “155 is Team” is `published allocation` + `live state` on that room, painted onto the polygon.

**Dwinelle Navigator** ([dkess.me/dwinelle](https://dkess.me/dwinelle), graph under ODbL) is a different artifact: a **3D hallway graph** with turn-by-turn. Recreating that for every hall is a later project (import a graph, or draw connectors). Do not pretend Figma room rectangles are a routing mesh. v1 public maps: pick a building, pick a floor, search a room, pinch-zoom, “you are at entrance X” as a POI — not first-person flythrough.

#### 6. Volunteer check-in (across semesters)

Replace: Google Form → attached sheet → hand edits → LLM-shaped import into a separate volunteer app that has its own room list.

| Object | Lifetime | Owns |
| ------ | -------- | ---- |
| `Person` | Org, many semesters | Name, email, phone, notes, “do not contact” |
| `Application` | One Event | Availability, shirt, dietary, this-year answers |
| `Assignment` | One Event | Role + room and/or building |

Admin UI: ingest or replace the form, edit dropouts **in the app**, assign people to rooms **picked from the catalog**. The volunteer app’s “list of rooms and buildings” **is** `GET /buildings` + `GET /rooms`, not a cleaned CSV.

“Its own platform” in product terms (a place you open to manage people). In engineering terms it is a **module**, not a second database. If an older volunteer tool must survive a semester, it should **consume** this catalog/assignments API rather than keep a shadow copy.

### How the pieces share a room

```text
rooms.id  =  9c2e…     code display DWIN155
    ▲
    │  allocations.room_id          (draft + published plan)
    │  assignments.room_id          (proctor, building lead)
    │  live_room_states.room_id     (timer, headcount)
    │  map_spaces.room_id           (nullable; bathrooms have none)
```

Never join on free-text `"Dwinelle 155"` in production paths. Import/search may fuzzy-match once, then store the UUID.

### AuthZ sketch

| Actor | Catalog | Sheets | Published + live | Volunteer PII | Public site |
| ----- | ------- | ------ | ---------------- | ------------- | ----------- |
| Guest | — | — | Coarse public live + maps | — | Yes |
| Volunteer / proctor | — | — | Own room + timer + clarifications | Own record | Yes |
| Ops HQ | Read | Read published | Read/write live | Read assignments | Yes |
| Planner | Edit | Own drafts; maybe publish | — | — | Yes |
| Volunteer admin | Read | — | — | Full | Yes |
| Org admin | Full | Policy | Publish rights | Full | Yes |

Exact roles can wait for Phase 2c, but **do not** invent a new permission system per module.

### What to build first (avoid the redesign without boiling the ocean)

Protect the kernel, then cut **vertical slices** that reuse it:

1. **Catalog quality** — real floor labels, enough fields for the capacity sheet, add-building flow you trust. (Mostly productizing what exists.)
2. **Allocator + publish** — finish the grid; add “this sheet is the plan.” Without publish, every later tool will scrape a spreadsheet again.
3. **People + assignments** — kills the volunteer room-list copy; gives proctor suite a join key.
4. **Ops list view** — published allocations + empty live fields. Map view when indoor maps land.
5. **Proctor timer / clarifications** — writes the same `LiveRoomState`.
6. **Public site** — maps + public live subset.
7. **Wayfinding graph** — only if guests still get lost after floor search.

Maps can be prototyped in parallel **as soon as room codes match Figma**, because geometry does not depend on volunteers. Do not block the catalog on Leaflet.

Phase 2c orgs still matter: catalog and people are org-scoped; Events belong to an org. Public HTTPS (2e) is required for guests and proctor phones.

## In Scope (as a vision doc)

- Kernel vs overlay split
- Publish-plan seam
- How Figma spaces, ops, proctors, and volunteers attach to `rooms.id`
- Build order that avoids a second rooms database
- Honest bound on Dwinelle Navigator vs Figma maps

## Not in Scope

- Implementing all six products now
- Microservices, extra Postgres instances, or a “rooms microservice”
- Student contest registration / scoring (join later if it exists; do not invent it here)
- Recreating Kessler’s 3D navigator in v1
- Replacing Figma as the drafting tool for walls

## Open Questions

These actually change the design. Defaults in parentheses are what to use if we need to proceed.

| Question | Why it matters | Tentative default |
| -------- | -------------- | ----------------- |
| One org (BMT) with many Events, or a multi-org product **this year**? | Phase 2c complexity vs “just BMT” | One org, many Events (BmMT, BMT, …) |
| Is there a student registration system to join, or is “students” headcount / a roster CSV? | Whether `Person` includes contestants | Headcount + optional imported roster; not a full student SIS |
| Replace the current volunteer app, or feed it rooms via API for one more semester? | Module now vs anti-corruption layer | Replace the room list immediately; full volunteer UI can follow |
| Publish = pointer to a live sheet, or frozen snapshot? | Edits after “we published” | Frozen snapshot (or pin + explicit republish) so day-of cannot drift from an accidental grid edit |
| Timer: one clock per activity (all Indiv rooms) vs per-room extra time? | Live schema | Activity clock + per-room **override** |
| Clarifications: broadcast to an activity vs per-room thread vs both? | Proctor UX | Broadcast to activity; optional room-only note |
| Public site same deploy as staff app? | Leakage vs ops cost | Same API; separate public origin or route prefix when 2e lands |
| Volunteer login: Google-only like planners? | Phase 2 auth | Google for staff/proctors; email magic link only if many volunteers have no Google |
| First event that must run on this? | What “v1” means | Name the contest + date |
| Room custom fields: do you add columns every year, or is the capacity sheet’s column set stable? | SQL columns vs JSONB extras | Stable columns + `extras` |
| Indoor routing in year one, or floor-finder is enough? | Maps scope | Floor-finder + search; Navigator-class graph later |
