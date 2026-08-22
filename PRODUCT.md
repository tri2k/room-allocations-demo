# Room Allocations

A rooms catalog plus the tools that should share it: an event room allocator, day-of ops, proctor tools, a public map site, and volunteer tracking.

## Vision

Event organizers (BmMT and similar) still run contests from a pile of spreadsheets and forms: a classroom/capacity sheet, a dense time × room grid, a volunteer Google Form whose room list is copied by hand, printed day-of status, and guest maps that do not know about any of the above. Each copy of DWIN155 drifts.

The kernel is a **rooms catalog**. The allocator (this repo today) is the first module on that catalog, not a product that owns rooms by itself. Day-of ops, proctors, the public site, and volunteers should point at the same buildings and rooms — draft plans stay on sheets; one published plan plus a live overlay is what day-of and guests see.

BmMT 2026 is the first template, not hard-coded logic. Target platform (unbuilt beyond catalog + allocator): [specs/2026-08-22-ops-platform.md](specs/2026-08-22-ops-platform.md).

## Core Concepts

Hierarchy: **Org → Building → Floor → Room**, and **Org → Event → Sheet → Allocation**. Floor is optional on a room.

| Concept | Definition | Relationships |
| ------- | ---------- | ------------- |
| Organization | Tenant (e.g. BMT) | Owns the room catalog and Event labels; has admins and regular members |
| Building | Physical hall, e.g. Dwinelle (`DWIN`) | Belongs to one org; contains floors and rooms |
| Floor | Grouping unit for bulk assign, e.g. `1`, `Basement` | Belongs to one building; contains rooms |
| Room | Bookable space with type and capacity | Belongs to one building; optional floor |
| Event | Category for an occasion (“this plan is for BmMT 2026”) plus default clock settings for new sheets | Belongs to one org. Defaults copy onto a sheet at create; Event does not own the grid |
| Sheet | One private plan for an Event | Owned by one user. Owns grid settings, activities, time blocks, allocations |
| Activity | Named colored block (Puzzle, Indiv, …) with default duration | Belongs to a sheet |
| TimeBlock | Phase on that sheet’s timeline (Check-in, Lunch, …) | Belongs to a sheet; may hint-snap to an activity |
| Allocation | Activity occupies this room from T₁ to T₂ | One room + one activity on one sheet; no overlap in the same room **on that sheet** |

Display label: `{building.code}{room.name}` → `DWIN155`. Room number and floor are stored separately.

**Target platform (mostly unbuilt):** `Person` / `Assignment` (volunteers and proctors), a **published plan** (one sheet selected for day-of), `LiveRoomState` (timers, headcount), and `MapSpace` (Figma geometry with optional `room_id`). See [ops platform spec](specs/2026-08-22-ops-platform.md).

**Phase 2b (current code):** sheets exist and are owner-private. Event is a label plus clock defaults copied onto a sheet at create. Catalog and Events are still global (no orgs until 2c). No publish-to-ops seam yet.

As-built types for v0: [specs/2026-08-11-v0-vision-demo.md](specs/2026-08-11-v0-vision-demo.md). Persistence field lists and SQL as shipped: [specs/2026-08-11-phase-1-core-loop.md](specs/2026-08-11-phase-1-core-loop.md). Target model: [specs/2026-08-13-phase-2-accounts-orgs.md](specs/2026-08-13-phase-2-accounts-orgs.md).

## Architecture

**Current (Phase 2b):** Vite SPA in `frontend/` talks to FastAPI in `server/`. PostgreSQL is the schedule store. Google OAuth (or local `ENABLE_DEV_AUTH` login) sets an HTTP-only session cookie. Unauthenticated `/api/v1` calls return 401. Catalog and Events are still global. Allocations live on private sheets (`#/sheets/{id}`); Event edits do not rewrite existing sheets.

As-built diagrams: [docs/c4/](docs/c4/README.md). Those files match the **current commit**, not a future target.

**Phase 2 (rest):** Orgs and roles (2c), invites (2d), then public HTTPS (2e). No Share button and no live sync yet.

**Later:** invite another account onto a **sheet** (viewer / editor), then WebSockets / presence. Indoor maps, day-of ops, proctor suite, public site, and volunteers are modules on the rooms kernel — not extra room lists: [specs/2026-08-22-ops-platform.md](specs/2026-08-22-ops-platform.md), [specs/2026-08-21-indoor-maps.md](specs/2026-08-21-indoor-maps.md).

## Technology Summary

| Layer | Phase 1 | Phase 2a | Phase 2b (now) | Phase 2 (2c–2e) | Later |
| ----- | ------- | -------- | -------------- | ---------------- | ----- |
| UI | React 18, TypeScript, Vite, `@dnd-kit` | Same + `#/login` | Event list, sheet wizard, `#/sheets/{id}` grid | org/event/sheet lists | Same core; GUIDELINES extras only if we adopt them |
| State | React `useState` | Same | Same | Same | TBD if catalog/grid state gets hard to share |
| Persistence | PostgreSQL + SQLAlchemy + Alembic | Same + `users` | Same + `sheets`; plan children on sheet | orgs | Same |
| API | FastAPI `/api/v1` (unauthenticated) | Session cookie; still global catalog/events | Owner-gated sheets; catalog still global | org- and owner-gated | Same |
| Identity | None | Google OAuth (+ local dev login) | Same | Same | Sheet sharing ACL |
| Realtime | None | None | None | None | WebSockets |
| Package manager | npm | npm | npm | npm | Stay on npm until we choose otherwise |

## Phased Delivery

| Phase | Goal | Status |
| ----- | ---- | ------ |
| **v0 — Vision demo** | Prove grid UX | **Complete** (2026-08-11). Spec: [specs/2026-08-11-v0-vision-demo.md](specs/2026-08-11-v0-vision-demo.md) |
| **1 — Core loop** | Persistent single-user product | **Complete** (2026-08-11). Spec: [specs/2026-08-11-phase-1-core-loop.md](specs/2026-08-11-phase-1-core-loop.md) |
| **2 — Accounts, orgs, private sheets** | Public Google sign-in; org catalog; Event labels; owner-only sheets | **In progress (2a–2b).** Spec: [specs/2026-08-13-phase-2-accounts-orgs.md](specs/2026-08-13-phase-2-accounts-orgs.md). Ship as **2a–2e** (sign-in → sheets → orgs → invites → public HTTPS) |
| **3 — Power features** | Templates, proctors, export, capacity; candidate home for [catalog history + plan pins](specs/2026-08-13-catalog-history-and-plan-pins.md) | Planned (was Phase 2) |
| **4 — Polish** | Sheets import, mobile read-only, `team_count` | Planned (was Phase 3) |
| **Later — Collaboration** | Share a sheet like Google Sheets, then live sync | Unsequenced. Draft: [specs/2026-08-11-phase-2-collaboration.md](specs/2026-08-11-phase-2-collaboration.md) |
| **Later — Catalog history** | Revision timeline, per-sheet pin, optional sync to latest catalog | Draft: [specs/2026-08-13-catalog-history-and-plan-pins.md](specs/2026-08-13-catalog-history-and-plan-pins.md) |
| **Later — Indoor maps** | Figma-imported floor plans (Dwinelle / Wheeler / VLSB); device pan-zoom map; live exam overlay joins catalog rooms | Draft: [specs/2026-08-21-indoor-maps.md](specs/2026-08-21-indoor-maps.md) |
| **Later — Ops platform** | Publish a sheet as the day-of plan; live overlay; proctors; public maps; volunteers as people + assignments on the same rooms | Draft: [specs/2026-08-22-ops-platform.md](specs/2026-08-22-ops-platform.md) |

## Non-Functional Requirements

- Phase 1: local Docker Postgres + FastAPI; UI may still be demo-quality / buggy
- Phase 2e: public HTTPS; `ENABLE_DEV_RESEED` and `ENABLE_DEV_AUTH` off in production
- Slot grid: 15 minutes default (sheet-configurable: 5 / 15 / 30)
- Overlap in one room **on one sheet**: HTTP 409; bulk create reports skipped rooms. Two sheets may book the same room at the same time
- Warnings over hard blocks for room-type and capacity exceptions
- Org admins never get a searchable list of all platform users

## Open Questions

| Question | Status |
| -------- | ------ |
| Slot granularity | **Decided:** 15 min default; per-sheet (Event stores defaults copied at create) |
| v0 deploy | **Decided:** static host |
| Phase 1 hosted deploy | **Decided:** local-only |
| Registration / team counts | **Decided:** later (Phase 4); not on Event |
| Layout `src/` vs `frontend/` + `server/` | **Decided (Phase 1 spec):** `frontend/` + `server/` |
| Adopt GUIDELINES frontend extras (Zustand, Tailwind, pnpm, …) | **Decided (Phase 1 spec):** no; keep v0 UI stack |
| Auth vendor | **Decided (Phase 2 spec):** Google OAuth only |
| Event vs sheet | **Decided (Phase 2 spec):** Event is a category; sheet is the plan |
| Multi-day events | **Decided:** no plans for the foreseeable future. One sheet = one day; use another sheet on the same Event for another day |
| Org roles | **Decided (Phase 2 spec):** admin vs regular; org admins promote/demote; superuser appoints first admin only |
| Platform superuser scope | **Phase 2:** create org + first admin only. **Future:** broader superuser tooling likely (recovery, support) — not scoped yet |
| Public HTTPS | **Decided:** in Phase 2e. Host vendor TBD |
| Catalog history / plan pins | **Future.** [specs/2026-08-13-catalog-history-and-plan-pins.md](specs/2026-08-13-catalog-history-and-plan-pins.md) |
| Indoor floor maps | **Decided (architecture):** Figma import owns geometry; Leaflet `CRS.Simple` viewer; capacity stays on `rooms`; live event data is a join. [specs/2026-08-21-indoor-maps.md](specs/2026-08-21-indoor-maps.md) |
| Integrated ops platform | **Decided (direction):** modular monolith on this repo; rooms catalog is the kernel; other tools join `rooms.id`. Open questions (publish snapshot, volunteer app replacement, timers) in [specs/2026-08-22-ops-platform.md](specs/2026-08-22-ops-platform.md) |
