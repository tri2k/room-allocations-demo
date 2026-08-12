# v0 Vision Demo

**Status**: Implemented (2026-08-11)

Frontend-only prototype to pitch the room-scheduling grid. Product context: [PRODUCT.md](../PRODUCT.md).

## Problem

The BmMT spreadsheet is a time × room matrix with merged cells. Copy-pasting the same activity across a floor is slow and error-prone. There is no overlap warning. We needed something drag-and-droppable to show a friend before building persistence or collab.

## Design

Single in-memory `ScheduleState` (event, buildings, floors, rooms, activities, timeBlocks, allocations). Load seed JSON; persist to `localStorage` key `room-allocations-demo:v1`. Orientation (normal vs transposed) is a separate localStorage key.

Allocations stay one record per room. Adjacent rooms with the same activity and exact time range **render** as one merged block.

Types (no `created_at` / `is_active` in v0):

```typescript
type Building = { id: string; code: string; name: string };
type Floor = { id: string; buildingId: string; label: string; sortOrder: number };
type Room = {
  id: string;
  buildingId: string;
  floorId: string | null;
  name: string;
  roomType: "auditorium" | "small" | "large";
  capacity: number;
  optimalCapacity: number;
  sortOrder?: number;
};
type Activity = { id: string; name: string; color: string; defaultDurationMin: number };
type TimeBlock = { id: string; label: string; startTime: string; endTime: string; color?: string };
type Allocation = { id: string; roomId: string; activityId: string; startAt: string; endAt: string; notes?: string };
```

Grid (normal): time on Y (15-min slots), rooms on X grouped by building then floor. Transposed: rooms on Y, time on X, building/floor as row-spanning bands.

Bulk assign: click floor or building header → `selectedRoomIds` → drop from palette creates one allocation per selected room; skip overlaps.

## In Scope

- Seeded BmMT-style catalog and timeline
- Palette drag-create, move, resize, snap
- Floor/building/room selection and bulk create
- Overlap warning (red border)
- localStorage + Reset
- Static deploy (no server)

## Not in Scope

- Backend, auth, WebSockets
- Room/building CRUD UI
- Room-type / capacity validation beyond overlap
- Export, import, proctors
- Polished UI (demo-quality is enough)

## Implementation Plan

1. Vite + React + TypeScript scaffold
2. Seed JSON + `ScheduleState` types
3. Grid + palette + `@dnd-kit`
4. Bulk select, overlap, persist, reset
5. (Later in the same v0 line) select/delete, transpose, merged blocks

## Acceptance criteria

- [x] Page loads seed data; refresh restores from localStorage if present
- [x] Grid shows building → floor → room headers with type badge and capacity
- [x] Phase gutter aligns with time rows
- [x] Drag Puzzle from palette onto Floor 1 selection creates N non-overlapping allocations
- [x] Drag existing block to new room/time updates position with snap
- [x] Resize block changes duration in 15-min increments
- [x] Creating overlap shows red border on both blocks
- [x] Collapse building hides its room columns
- [x] Reset button restores seed and clears localStorage
- [x] Deployable as static site; no server required

## Open Questions

Resolved in [PRODUCT.md](../PRODUCT.md) (15-min slots, one day, static host).

## Post-Implementation Notes

### Deviations

- UI lives mostly in `src/App.tsx` instead of the specced `src/components/` tree
- State is `useState` in `App`, not `useReducer` + context
- localStorage writes on every state change, not a 300ms debounce
- Collapse is double-click on headers (easy to miss)
- Grid slot height / column width differ from the original 24×80 tokens
- UI is still buggy; good enough for vision/demo, not a polished product

### Additions

- Click allocation to select; `Delete` / `Backspace` or `×` to remove
- Full matrix transpose with merged building/floor bands
- Visual merge of adjacent rooms with the same activity and time range (both orientations)
- Toast on create/skip/delete/reset

Known limitation of that merge: edits apply to the leader allocation only. See [docs/known-bugs-v0.md](../docs/known-bugs-v0.md).

### Deferred

- Persistence and catalog CRUD → [phase-1 draft](2026-08-11-phase-1-core-loop.md)
- Collaboration → unsequenced; [draft spec](2026-08-11-phase-2-collaboration.md)
- Proctors, export → Phase 2; Sheets import → Phase 3

### Seed

`src/data/bmmt-2026.json`: two buildings (DWIN, VLSB), floors, ~9 rooms, activities, time blocks, a few sample allocations. Not the full Room Capacities tab.

### File layout (as built)

```
src/
  App.tsx                 # UI + handlers
  main.tsx
  styles.css
  data/bmmt-2026.json
  types/schedule.ts
  lib/grid.ts
  lib/time.ts
  lib/overlap.ts
  lib/storage.ts
```
