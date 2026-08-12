# Room Allocations

A general-purpose event room scheduler: a building/floor/room catalog plus a drag-and-drop room × time grid.

## Vision

Event organizers (BmMT and similar) still plan rooms in spreadsheets: a dense time × room matrix, merged cells, copy-paste across columns, no conflict detection, and “FINAL v3” file sharing.

The product replaces that sheet with a reusable room catalog and a grid where activities snap onto rooms and time. Bulk assign by floor or building is the main win. Real-time multi-user editing comes later.

BmMT 2026 is the first template, not hard-coded logic.

## Core Concepts

Hierarchy: **Building → Floor → Room → Allocation**. Floor is optional on a room.

| Concept | Definition | Relationships |
| ------- | ---------- | ------------- |
| Building | Physical hall, e.g. Dwinelle (`DWIN`) | Contains floors and rooms |
| Floor | Grouping unit for bulk assign, e.g. `1`, `Basement` | Belongs to one building; contains rooms |
| Room | Bookable space with type and capacity | Belongs to one building; optional floor |
| Event | One scheduled day (name, date, timezone, grid range) | Owns activities, time blocks, allocations |
| Activity | Named colored block (Puzzle, Indiv, …) with default duration | Many allocations per event |
| TimeBlock | Phase on the master timeline (Check-in, Lunch, …) | Belongs to an event; may hint-snap to an activity |
| Allocation | Activity occupies this room from T₁ to T₂ | One room + one activity; no overlap in the same room |

Display label: `{building.code}{room.name}` → `DWIN155`. Room number and floor are stored separately.

As-built types for v0: [specs/2026-08-11-v0-vision-demo.md](specs/2026-08-11-v0-vision-demo.md). Persistence field lists and SQL: [specs/2026-08-11-phase-1-core-loop.md](specs/2026-08-11-phase-1-core-loop.md) (draft).

## Architecture

**Current (v0):** one static React SPA. Seed JSON is bundled. Edits persist in browser `localStorage`. No server, auth, or shared DB.

As-built diagrams: [docs/c4/](docs/c4/README.md). Those files match the **current commit**, not this phased target.

**Planned:** keep the same domain; add a FastAPI + PostgreSQL API (Phase 1), then WebSocket sync and roles (Phase 2). Events do not own buildings — they use rooms across buildings, with an optional building filter.

## Technology Summary

| Layer | v0 (now) | Later (when we need it) |
| ----- | -------- | ----------------------- |
| UI | React 18, TypeScript, Vite, `@dnd-kit` | Same core; GUIDELINES defaults (router, Tailwind, etc.) only if we adopt them |
| State | React `useState` | TBD when catalog CRUD appears |
| Persistence | `localStorage` + seed JSON | PostgreSQL + SQLAlchemy + Alembic |
| API | None | FastAPI |
| Realtime | None | WebSockets |
| Package manager | npm | Stay on npm until we choose otherwise |

## Phased Delivery

| Phase | Goal | Status |
| ----- | ---- | ------ |
| **v0 — Vision demo** | Prove grid UX | **Complete** (2026-08-11). Spec: [specs/2026-08-11-v0-vision-demo.md](specs/2026-08-11-v0-vision-demo.md) |
| **1 — Core loop** | Persistent single-user product | Planned. Draft: [specs/2026-08-11-phase-1-core-loop.md](specs/2026-08-11-phase-1-core-loop.md) |
| **2 — Collaboration** | Live multi-user editing | Planned |
| **3 — Power features** | Templates, proctors, export, capacity | Planned |
| **4 — Polish** | Sheets import, mobile read-only | Planned |

## Non-Functional Requirements

- v0: static host, no server; UI may be demo-quality / buggy
- Slot grid: 15 minutes (event-configurable later: 5 / 15 / 30)
- Overlap in one room: show a warning in v0; reject on the server in Phase 1
- Warnings over hard blocks for room-type and capacity exceptions

## Open Questions

| Question | Status |
| -------- | ------ |
| Slot granularity | **Decided:** 15 min default; per-event config in Phase 1 |
| Multi-day events | **Decided:** one grid per day, day tabs |
| v0 deploy | **Decided:** static host |
| Registration / team counts | **Decided:** manual `team_count` on event in Phase 3; no external API in Phase 1 |
| Layout `src/` vs `frontend/` + `server/` | **Decided:** keep `src/` at repo root until a backend exists |
| Adopt GUIDELINES frontend extras (Zustand, Tailwind, pnpm, …) | **Open:** not in v0; decide when Phase 1 starts |
