# Room Allocations

A general-purpose event room scheduler: a building/floor/room catalog plus a drag-and-drop room × time grid.

## Vision

Event organizers (BmMT and similar) still plan rooms in spreadsheets: a dense time × room matrix, merged cells, copy-paste across columns, no conflict detection, and “FINAL v3” file sharing.

The product replaces that sheet with a reusable room catalog and a grid where activities snap onto rooms and time. Bulk assign by floor or building is the main win. Sharing a plan like Google Sheets, then live multi-user editing, comes later.

BmMT 2026 is the first template, not hard-coded logic.

## Core Concepts

Hierarchy: **Org → Building → Floor → Room**, and **Org → Event → Sheet → Allocation**. Floor is optional on a room.

| Concept | Definition | Relationships |
| ------- | ---------- | ------------- |
| Organization | Tenant (e.g. BMT) | Owns the room catalog and Event labels; has admins and regular members |
| Building | Physical hall, e.g. Dwinelle (`DWIN`) | Belongs to one org; contains floors and rooms |
| Floor | Grouping unit for bulk assign, e.g. `1`, `Basement` | Belongs to one building; contains rooms |
| Room | Bookable space with type and capacity | Belongs to one building; optional floor |
| Event | Category for an occasion (“this plan is for BmMT 2026”) | Belongs to one org. Name + optional date only. Does not own the grid |
| Sheet | One private plan for an Event | Owned by one user. Owns grid settings, activities, time blocks, allocations |
| Activity | Named colored block (Puzzle, Indiv, …) with default duration | Belongs to a sheet |
| TimeBlock | Phase on that sheet’s timeline (Check-in, Lunch, …) | Belongs to a sheet; may hint-snap to an activity |
| Allocation | Activity occupies this room from T₁ to T₂ | One room + one activity on one sheet; no overlap in the same room **on that sheet** |

Display label: `{building.code}{room.name}` → `DWIN155`. Room number and floor are stored separately.

**Phase 1 (current code):** there are no orgs or sheets. Event still owns activities, time blocks, and allocations. That split lands in Phase 2.

As-built types for v0: [specs/2026-08-11-v0-vision-demo.md](specs/2026-08-11-v0-vision-demo.md). Persistence field lists and SQL as shipped: [specs/2026-08-11-phase-1-core-loop.md](specs/2026-08-11-phase-1-core-loop.md). Target model: [specs/2026-08-13-phase-2-accounts-orgs.md](specs/2026-08-13-phase-2-accounts-orgs.md).

## Architecture

**Current (Phase 1):** Vite SPA in `frontend/` talks to FastAPI in `server/`. PostgreSQL is the schedule store. No auth. Catalog and Events are global.

As-built diagrams: [docs/c4/](docs/c4/README.md). Those files match the **current commit**, not a future target.

**Phase 2 (next):** Google OAuth, public HTTPS, orgs. Org owns the catalog. Event is a label. Each user owns private sheets. No Share button and no live sync yet. Rooms are still not owned by Events — sheets book rooms from the org catalog; the sheet owner picks which **rooms** appear as columns.

**Later:** invite another account onto a **sheet** (viewer / editor), then WebSockets / presence.

## Technology Summary

| Layer | Phase 1 (now) | Phase 2 | Later |
| ----- | ------------- | ------- | ----- |
| UI | React 18, TypeScript, Vite, `@dnd-kit` | Same; login + org/event/sheet lists | Same core; GUIDELINES extras only if we adopt them |
| State | React `useState` | Same | TBD if catalog/grid state gets hard to share |
| Persistence | PostgreSQL + SQLAlchemy + Alembic | Same; `users`, orgs, sheets | Same |
| API | FastAPI `/api/v1` (unauthenticated) | Session cookie; org- and owner-gated | Same |
| Identity | None | Google OAuth | Sheet sharing ACL |
| Realtime | None | None | WebSockets |
| Package manager | npm | npm | Stay on npm until we choose otherwise |

## Phased Delivery

| Phase | Goal | Status |
| ----- | ---- | ------ |
| **v0 — Vision demo** | Prove grid UX | **Complete** (2026-08-11). Spec: [specs/2026-08-11-v0-vision-demo.md](specs/2026-08-11-v0-vision-demo.md) |
| **1 — Core loop** | Persistent single-user product | **Complete** (2026-08-11). Spec: [specs/2026-08-11-phase-1-core-loop.md](specs/2026-08-11-phase-1-core-loop.md) |
| **2 — Accounts, orgs, private sheets** | Public Google sign-in; org catalog; Event labels; owner-only sheets | Planned. Spec: [specs/2026-08-13-phase-2-accounts-orgs.md](specs/2026-08-13-phase-2-accounts-orgs.md). Ship as **2a–2e** (sign-in → sheets → orgs → invites → public HTTPS) |
| **3 — Power features** | Templates, proctors, export, capacity | Planned (was Phase 2) |
| **4 — Polish** | Sheets import, mobile read-only, `team_count` | Planned (was Phase 3) |
| **Later — Collaboration** | Share a sheet like Google Sheets, then live sync | Unsequenced. Draft: [specs/2026-08-11-phase-2-collaboration.md](specs/2026-08-11-phase-2-collaboration.md) |

## Non-Functional Requirements

- Phase 1: local Docker Postgres + FastAPI; UI may still be demo-quality / buggy
- Phase 2e: public HTTPS; `ENABLE_DEV_RESEED` off in production
- Slot grid: 15 minutes default (sheet-configurable: 5 / 15 / 30)
- Overlap in one room **on one sheet**: HTTP 409; bulk create reports skipped rooms. Two sheets may book the same room at the same time
- Warnings over hard blocks for room-type and capacity exceptions
- Org admins never get a searchable list of all platform users

## Open Questions

| Question | Status |
| -------- | ------ |
| Slot granularity | **Decided:** 15 min default; per-sheet in Phase 2 (per-event in Phase 1 code) |
| Multi-day events | **Decided:** one grid per day, day tabs |
| v0 deploy | **Decided:** static host |
| Phase 1 hosted deploy | **Decided:** local-only |
| Registration / team counts | **Decided:** later (Phase 4); not on Event |
| Layout `src/` vs `frontend/` + `server/` | **Decided (Phase 1 spec):** `frontend/` + `server/` |
| Adopt GUIDELINES frontend extras (Zustand, Tailwind, pnpm, …) | **Decided (Phase 1 spec):** no; keep v0 UI stack |
| Auth vendor | **Decided (Phase 2 spec):** Google OAuth only |
| Event vs sheet | **Decided (Phase 2 spec):** Event is a category; sheet is the plan |
| Org roles | **Decided (Phase 2 spec):** admin vs regular |
| Public HTTPS | **Decided:** in Phase 2e. Host vendor TBD |
