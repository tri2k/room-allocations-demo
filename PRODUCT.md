# BMT ops platform

A rooms catalog plus the screens that share it: event room allocator, day-of HQ, proctor tools, a public map site, and volunteer tracking.

## Vision

Event organizers (BmMT and similar) still run contests from a pile of spreadsheets and forms: a classroom/capacity sheet, a dense time × room grid, a volunteer Google Form whose room list is copied by hand, printed day-of status, and guest maps that do not know about any of the above. Each copy of DWIN155 drifts.

The kernel is a **rooms catalog**. The allocator, day-of HQ, proctors, public maps, and volunteers are screens on that catalog — not extra room lists. Draft plans stay editable; one imported day plan plus a live overlay is what Saturday and guests see.

**Target design (greenfield):** [specs/2026-08-24-integrated-system.md](specs/2026-08-24-integrated-system.md). First production event: **BMT 2026 (2026-11-14)**. The drag-and-drop app in this git repo is a prototype we can discard at implementation. Workshop locks: [architecture after round 2](specs/2026-08-23-bmt-2026-architecture.md).

## Core Concepts

Hierarchy: **Building → Floor → Room**, and **Event → Draft plan → Allocation**. Floor is optional on a room. One org in product (BMT); no tenant table required for v1.

| Concept | Definition | Relationships |
| ------- | ---------- | ------------- |
| Organization | BMT as the only tenant in v1 | No marketplace. Skip `org_id` until a second club uses the tool |
| Building | Physical hall, e.g. Dwinelle (`DWIN`) | Contains floors and rooms |
| Floor | Grouping unit for bulk assign, e.g. `D`, `Basement` | Belongs to one building; contains rooms |
| Room | Space with capacity and custom fields | Belongs to one building; optional floor |
| Event | One contest (“BMT 2026”) plus default clock settings for new drafts | Owns applications, day plan, live state, room password |
| Draft plan | Allocator grid for an Event | Staff-visible. One writer at a time (no live co-edit). Not a personal Google document |
| Activity | Named colored block (Power, Algebra, …) with default duration | Belongs to a draft (then copied onto the day plan) |
| TimeBlock | Phase on that draft’s timeline (Check-in, Lunch, …) | Belongs to a draft; may hint-snap to an activity |
| Allocation | Activity occupies this room from T₁ to T₂ | One room + one activity on one draft; no overlap in the same room **on that draft** |

Display label: `{building.code}{room.name}` → `DWIN155`. Room number and floor are stored separately.

**Target:** `Person` / `Assignment`, a **day plan** (imported draft), `LiveRoomState`, `MapSpace`. See [integrated system](specs/2026-08-24-integrated-system.md).

The v0–2b allocator in this repo is **not** the target model. Historical notes: [v0](specs/2026-08-11-v0-vision-demo.md), [Phase 1](specs/2026-08-11-phase-1-core-loop.md), [Phase 2 accounts](specs/2026-08-13-phase-2-accounts-orgs.md).

## Architecture

**Target:** **one API**, one Postgres. **`ops.berkeley.mt`** = officer HQ (+ volunteer *admin*). **`volunteers.berkeley.mt`** = volunteer people (returning accounts). **`swire.berkeley.mt`** = room timers (`/admin` redirects to ops). **`live.berkeley.mt`** = guests. Spec: [integrated system](specs/2026-08-24-integrated-system.md).

Language, UI library, and folder layout are chosen at implementation. `docs/c4/` describes whatever code is in the current commit, not this target.

## Technology Summary

| Layer | Target |
| ----- | ------ |
| UI | Browser app (staff, projector, public). Library TBD |
| Persistence | One PostgreSQL database |
| API | One HTTP API |
| Identity | **Google** → `people.id`. Ops if `can_open_ops`. Rooms: username + event password. Guests: none |
| Realtime | Server-authoritative timers; poll or push for clarifications |

## Phased Delivery

Design first (this PR), then implement the six screens against the greenfield spec. Historical allocator phases (v0–2b) stay in git as a prototype, not a roadmap.

## Non-Functional Requirements

- One Postgres; one API; public HTTPS when we deploy
- Slot grid: 15 minutes default (draft-configurable: 5 / 15 / 30)
- Overlap in one room **on one draft**: reject. Two drafts may book the same room at the same time until one is imported as the day plan
- Warnings over hard blocks for room-type and capacity exceptions
- Printed day plan if the site dies
- Day-of tools never update catalog rooms

## Open Questions

| Question | Status |
| -------- | ------ |
| Staff / volunteer login | **Decided:** Google only for Person accounts. Ops = `can_open_ops`. Swire = room password. Live = none |
| Auth | **Decided:** Google for people. Publish the OAuth client (Testing cap is too small for ~300 volunteers) |
| Slot granularity | **Decided:** 15 min default; per draft |
| Registration / scoring | **Decided:** other product; roster CSV into this database |
| Draft vs day plan | **Decided:** Event is the contest; draft is the grid; day plan is a frozen import |
| Multi-day events | **Decided:** one draft = one day; another draft on the same Event for another day |
| Catalog history / plan pins | **Later.** [draft](specs/2026-08-13-catalog-history-and-plan-pins.md) |
| Indoor floor maps | **Decided:** Figma import; Leaflet `CRS.Simple`; live data is a join. [spec](specs/2026-08-21-indoor-maps.md) |
| Integrated ops platform | **Round 2 locked** plus [greenfield parent](specs/2026-08-24-integrated-system.md) |
