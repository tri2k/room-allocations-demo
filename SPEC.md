# Room Allocations — Implementation Spec

Derived from the [vision document](.cursor/plans/room_scheduling_vision_8c7da1f0.plan.md).

## 1. Overview

### 1.1 Problem

Event organizers schedule rooms using spreadsheets: a time × room grid with merged cells, manual copy-paste across columns, no conflict detection, and painful multi-user version control.

### 1.2 Solution

A general-purpose room scheduler with:

- Org-wide **building → floor → room** catalog
- Per-event **activity palette** and **phase timeline**
- **Drag-and-drop schedule grid** with bulk assign by floor/building
- Real-time **multi-user editing** (Phase 2+)

BmMT 2026 is the reference template, not hard-coded logic.

### 1.3 Phased delivery


| Phase                  | Goal                             | Status      | Stack                                             |
| ---------------------- | -------------------------------- | ----------- | ------------------------------------------------- |
| **v0 — Vision demo**   | Pitch to a friend; prove grid UX | **Complete** (2026-08-11) | Frontend-only, seeded JSON, optional localStorage |
| **1 — Core loop**      | Persistent single-user product   | Planned     | React + FastAPI + PostgreSQL                      |
| **2 — Collaboration**  | Multi-user live editing          | Planned     | + WebSockets, auth, roles                         |
| **3 — Power features** | Templates, proctors, export      | Planned     |                                                   |
| **4 — Polish**         | Import, mobile read-only         | Planned     |                                                   |


**v0 is complete.** Later phases extend the same data model and UI; they do not replace it. See [CHANGELOG.md](CHANGELOG.md).

### 1.4 Defaults (open questions resolved)


| Question                 | Decision                                                        | Rationale                                         |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------------- |
| Slot granularity         | **15 min default**, configurable per event (`5 | 15 | 30`)      | Matches current sheet; config deferred to Phase 1 |
| Multi-day events         | **One grid per day**, day tabs in event                         | Simpler grid; multi-day rare for BmMT             |
| v0 deployment            | **Static host** (Vercel / Netlify / `npm run preview`)          | Single URL to share                               |
| Registration integration | **Manual team count** on event (Phase 3); no external API in v1 | Capacity warnings optional later                  |


---



## 2. Domain model



### 2.1 Entity hierarchy

```
Organization (Phase 2+)
  └── Building
        └── Floor (optional grouping)
        └── Room (floor_id nullable)
  └── Event
        └── Activity
        └── TimeBlock (phase timeline)
        └── Allocation → Room + Activity
```



### 2.2 Entities



#### Building


| Field        | Type        | Required | Notes                       |
| ------------ | ----------- | -------- | --------------------------- |
| `id`         | UUID        | yes      | PK                          |
| `code`       | string(16)  | yes      | Unique per org, e.g. `DWIN` |
| `name`       | string(128) | yes      | e.g. `Dwinelle Hall`        |
| `address`    | string(256) | no       |                             |
| `tags`       | string[]    | no       |                             |
| `is_active`  | boolean     | yes      | default `true`              |
| `created_at` | timestamptz | yes      |                             |
| `updated_at` | timestamptz | yes      |                             |


**Display name for exports:** `code` in UI headers; `name` in tooltips.

#### Floor


| Field         | Type        | Required | Notes                            |
| ------------- | ----------- | -------- | -------------------------------- |
| `id`          | UUID        | yes      | PK                               |
| `building_id` | UUID        | yes      | FK → Building                    |
| `label`       | string(32)  | yes      | e.g. `1`, `Basement`, `LL`       |
| `sort_order`  | int         | yes      | Ascending in grid (basement = 0) |
| `created_at`  | timestamptz | yes      |                                  |
| `updated_at`  | timestamptz | yes      |                                  |


Unique constraint: `(building_id, label)`.

#### Room


| Field              | Type        | Required | Notes                                            |
| ------------------ | ----------- | -------- | ------------------------------------------------ |
| `id`               | UUID        | yes      | PK                                               |
| `building_id`      | UUID        | yes      | FK → Building                                    |
| `floor_id`         | UUID        | no       | FK → Floor; nullable for outdoor / odd rooms     |
| `name`             | string(32)  | yes      | Room number within building, e.g. `155`          |
| `room_type`        | string(32)  | yes      | Org-defined, e.g. `auditorium`, `small`, `large` |
| `capacity`         | int         | yes      | Hard max seats                                   |
| `optimal_capacity` | int         | yes      | Target for warnings                              |
| `tags`             | string[]    | no       |                                                  |
| `is_active`        | boolean     | yes      | default `true`                                   |
| `sort_order`       | int         | no       | Override column order within floor               |
| `created_at`       | timestamptz | yes      |                                                  |
| `updated_at`       | timestamptz | yes      |                                                  |


**Computed display label:** `{building.code}{room.name}` → `DWIN155`.

Unique constraint: `(building_id, name)`.

#### Event


| Field                   | Type        | Required | Notes                                 |
| ----------------------- | ----------- | -------- | ------------------------------------- |
| `id`                    | UUID        | yes      | PK                                    |
| `name`                  | string(128) | yes      | e.g. `BmMT 2026`                      |
| `event_date`            | date        | yes      | Primary day for v0/Phase 1            |
| `timezone`              | string(64)  | yes      | e.g. `America/Los_Angeles`            |
| `slot_minutes`          | int         | yes      | default `15`; one of `5, 15, 30`      |
| `grid_start`            | time        | yes      | default `07:00`                       |
| `grid_end`              | time        | yes      | default `16:15`                       |
| `included_building_ids` | UUID[]      | no       | Filter grid; empty = all active rooms |
| `team_count`            | int         | no       | Phase 3 capacity warnings             |
| `created_at`            | timestamptz | yes      |                                       |
| `updated_at`            | timestamptz | yes      |                                       |




#### Activity


| Field                  | Type        | Required | Notes                                 |
| ---------------------- | ----------- | -------- | ------------------------------------- |
| `id`                   | UUID        | yes      | PK                                    |
| `event_id`             | UUID        | yes      | FK → Event                            |
| `name`                 | string(64)  | yes      | e.g. `Puzzle`                         |
| `color`                | string(7)   | yes      | Hex, e.g. `#F4A460`                   |
| `default_duration_min` | int         | yes      | Used when dragging from palette       |
| `allowed_room_types`   | string[]    | no       | Empty = any; else warning if mismatch |
| `sort_order`           | int         | yes      | Palette order                         |
| `created_at`           | timestamptz | yes      |                                       |
| `updated_at`           | timestamptz | yes      |                                       |




#### TimeBlock (phase timeline)


| Field                | Type       | Required | Notes                                         |
| -------------------- | ---------- | -------- | --------------------------------------------- |
| `id`                 | UUID       | yes      | PK                                            |
| `event_id`           | UUID       | yes      | FK → Event                                    |
| `label`              | string(64) | yes      | e.g. `Puzzle`                                 |
| `start_time`         | time       | yes      | Local to event timezone                       |
| `end_time`           | time       | yes      |                                               |
| `color`              | string(7)  | no       | Gutter band color; may mirror linked activity |
| `linked_activity_id` | UUID       | no       | Optional FK → Activity for snap hints         |
| `sort_order`         | int        | yes      |                                               |




#### Allocation


| Field         | Type        | Required | Notes                                             |
| ------------- | ----------- | -------- | ------------------------------------------------- |
| `id`          | UUID        | yes      | PK                                                |
| `event_id`    | UUID        | yes      | FK → Event                                        |
| `room_id`     | UUID        | yes      | FK → Room                                         |
| `activity_id` | UUID        | yes      | FK → Activity                                     |
| `start_at`    | timestamptz | yes      | Absolute; derived from event_date + grid position |
| `end_at`      | timestamptz | yes      | Must be > start_at                                |
| `notes`       | string(512) | no       | e.g. `Float Your Boat SPS`                        |
| `created_at`  | timestamptz | yes      |                                                   |
| `updated_at`  | timestamptz | yes      |                                                   |


**Invariant:** No two allocations for the same `room_id` may have overlapping `[start_at, end_at)` intervals within the same event.

### 2.3 v0 in-memory types (TypeScript)

v0 uses the same shapes without persistence metadata:

```typescript
type Building = {
  id: string;
  code: string;
  name: string;
};

type Floor = {
  id: string;
  buildingId: string;
  label: string;
  sortOrder: number;
};

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

type Activity = {
  id: string;
  name: string;
  color: string;
  defaultDurationMin: number;
  allowedRoomTypes?: string[];
};

type TimeBlock = {
  id: string;
  label: string;
  startTime: string; // "HH:mm"
  endTime: string;
  color?: string;
};

type Allocation = {
  id: string;
  roomId: string;
  activityId: string;
  startAt: string; // ISO 8601
  endAt: string;
  notes?: string;
};

type ScheduleState = {
  event: {
    name: string;
    eventDate: string; // "YYYY-MM-DD"
    timezone: string;
    slotMinutes: 15;
    gridStart: string;
    gridEnd: string;
  };
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  activities: Activity[];
  timeBlocks: TimeBlock[];
  allocations: Allocation[];
};
```



### 2.4 SQL schema (Phase 1+)

See Appendix A for PostgreSQL DDL.

---



## 3. v0 — Vision demo

**Status: complete** (2026-08-11). Frontend-only prototype shipped; see [CHANGELOG.md](CHANGELOG.md).



### 3.1 Scope

**In scope**

- Load `src/data/bmmt-2026.json` seed on mount
- Persist edits to `localStorage` key `room-allocations-demo:v1`
- Schedule grid: time rows × room columns
- Three-level sticky column headers: building → floor → room
- Left gutter: phase timeline (read-only TimeBlocks)
- Left sidebar: activity palette
- Drag activity from palette → create allocation on drop target room(s) + time
- Drag existing block → move (room and/or time)
- Resize block top/bottom edges → change start/end
- Snap to `slotMinutes` (15) grid
- Click floor header → select all rooms on floor; shift-click room headers → multi-select
- Drop on selection → create one allocation per selected room (same time range)
- Overlap detection → red border on conflicting allocations
- Collapse/expand building and floor sections

**Out of scope**

- Backend, auth, WebSockets
- CRUD forms for buildings/rooms/activities
- Room-type warnings, capacity warnings, phase-boundary info
- Export, import, proctors
- Inspector panel (click block → tooltip with times is enough)



### 3.2 UI layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  BmMT 2026 Room Schedule                                    [Reset]   │
├──────────┬──────────────────────────────────────────────────────────────┤
│          │  Building: DWIN ──────────────  Building: VLSB ────────────  │
│ Activity │  Floor 1 ──────  Floor 2 ──     Floor 2 ──────              │
│ Palette  │  155   170   179   215         2050  2060                   │
│          │  [Aud] [Sm]  [Sm]  [Sm]        [Sm]  [Sm]                   │
│  Puzzle  ├──────────────────────────────────────────────────────────────┤
│  Indiv   │ 7:00 │ Arrival (phase band in gutter)                        │
│  Team    │ 7:15 │                                                      │
│  Relay   │ ...  │     ┌──────────┐                                     │
│  ...     │9:15  │     │  Puzzle  │  ← allocation block                 │
│          │      │     └──────────┘                                     │
│          │16:00 │                                                      │
└──────────┴──────────────────────────────────────────────────────────────┘
```

**Regions**


| Region           | Component         | Behavior                               |
| ---------------- | ----------------- | -------------------------------------- |
| Top bar          | `AppHeader`       | Event name, reset-to-seed button       |
| Left 200px       | `ActivityPalette` | Draggable activity chips               |
| Left gutter 80px | `PhaseGutter`     | TimeBlock bands aligned to grid rows   |
| Top sticky       | `GridHeader`      | Building / floor / room rows           |
| Main             | `ScheduleGrid`    | Slot cells + allocation blocks overlay |
| —                | `AllocationBlock` | Positioned absolute within room column |




### 3.3 Grid coordinate system

**Constants (from seed event)**

- `slotMinutes = 15`
- `gridStart = 07:00`, `gridEnd = 16:15` → 37 slots
- Row height: `24px` per slot (configurable CSS variable)
- Column width: `80px` per room

**Positioning an allocation block**

```
rowIndex = minutesFromGridStart(startAt) / slotMinutes
rowSpan  = durationMinutes / slotMinutes
top      = rowIndex * SLOT_HEIGHT
height   = rowSpan * SLOT_HEIGHT - 2  // 2px gap
left     = roomColumnIndex * COL_WIDTH
width    = COL_WIDTH - 4
```

**Drop target resolution**

On drop, pointer `(x, y)` maps to:

1. `roomId` — column index from x
2. `startAt` — row index from y, snapped to slot boundary
3. `endAt` — `startAt + activity.defaultDurationMin`, snapped; clamp to grid end

**Phase snap (optional enhancement):** if drop row is within 1 slot of a TimeBlock boundary, snap `startAt` to that boundary.

### 3.4 Selection model

```typescript
type Selection =
  | { type: "none" }
  | { type: "rooms"; roomIds: string[] }
  | { type: "allocation"; allocationId: string };

// Click floor header  → all rooms where floorId matches
// Click building header → all rooms where buildingId matches
// Shift+click room header → toggle room in selection
// Click allocation → select single allocation
// Click grid background → clear selection
```

**Bulk create:** when `selection.type === "rooms"` and user drops activity:

```typescript
for (const roomId of selection.roomIds) {
  createAllocation({ roomId, activityId, startAt, endAt });
}
```

Skip rooms where overlap would occur; show toast: "Created 18 allocations; 2 skipped (overlap)."

### 3.5 Drag-and-drop (`@dnd-kit`)


| Drag type           | Source            | Drop target                   | Result                                 |
| ------------------- | ----------------- | ----------------------------- | -------------------------------------- |
| `palette-activity`  | `ActivityPalette` | grid cell or selected columns | `createAllocation` (bulk if selection) |
| `allocation`        | `AllocationBlock` | grid cell                     | `updateAllocation` room + times        |
| resize-n / resize-s | block handles     | vertical drag                 | adjust `startAt` / `endAt`             |


**Collision:** use `pointerWithin` for grid; blocks are not drop targets for palette drags (drop passes through to grid).

### 3.6 Validation (v0)


| Rule                 | UI                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------- |
| Overlap in same room | Red `2px` border on both allocations; persist allowed (demo shows warning, not block) |


```typescript
function overlaps(a: Allocation, b: Allocation): boolean {
  return a.roomId === b.roomId && a.startAt < b.endAt && b.startAt < a.endAt;
}
```



### 3.7 State management

- **v0:** React `useState` in `App.tsx`; no external state library
- Actions: `CREATE_ALLOCATIONS`, `UPDATE_ALLOCATION`, `DELETE_ALLOCATION`, `SET_SELECTION`, `TOGGLE_COLLAPSED`, `RESET_TO_SEED`
- **Persistence:** debounced `localStorage` write (300ms) on allocation changes



### 3.8 File structure (v0)

```
room-allocations-demo/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── SPEC.md
├── README.md
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── data/
    │   └── bmmt-2026.json          # seed ScheduleState
    ├── types/
    │   └── schedule.ts
    ├── lib/
    │   ├── time.ts                 # snap, parse, format
    │   ├── overlap.ts
    │   ├── grid.ts                 # column layout, collapse
    │   └── storage.ts              # localStorage
    ├── hooks/
    │   ├── useScheduleState.ts
    │   └── useGridLayout.ts
    └── components/
        ├── AppHeader.tsx
        ├── ActivityPalette.tsx
        ├── PhaseGutter.tsx
        ├── ScheduleGrid/
        │   ├── ScheduleGrid.tsx
        │   ├── GridHeader.tsx
        │   ├── GridBody.tsx
        │   ├── AllocationBlock.tsx
        │   └── DropOverlay.tsx
        └── ui/
            └── Toast.tsx
```



### 3.9 Seed data requirements (`bmmt-2026.json`)

Minimum content to support the demo script:

- **2+ buildings** (e.g. DWIN, VLSB)
- **2+ floors** in DWIN with **4+ rooms** on Floor 1 (bulk-assign hero)
- **6+ activities** with distinct colors matching sheet phases
- **8+ timeBlocks** from 7:00–16:15
- **Pre-loaded allocations** for auditoriums (check-in) and a partial Puzzle block on 2–3 rooms (show existing state)



### 3.10 Acceptance criteria (v0)

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

Shipped beyond the original v0 list: allocation select + keyboard delete, full matrix transpose, merged adjacent blocks.

---



## 4. Phase 1 — Core loop (single user, persistent)



### 4.1 Additional scope

- FastAPI backend + PostgreSQL (SQLAlchemy + Alembic)
- REST CRUD for Building, Floor, Room, Event, Activity, TimeBlock, Allocation
- Admin pages: simple forms for catalog management (no polish required)
- Editable activity palette and phase timeline per event
- Server-side overlap validation on create/update (409 Conflict)
- Room-type mismatch warning (returned in response, shown in UI)



### 4.2 API design

Base URL: `/api/v1`

All IDs are UUID strings. Timestamps ISO 8601 UTC.

#### Buildings


| Method | Path              | Description                     |
| ------ | ----------------- | ------------------------------- |
| GET    | `/buildings`      | List active buildings           |
| POST   | `/buildings`      | Create                          |
| GET    | `/buildings/{id}` | Get one                         |
| PATCH  | `/buildings/{id}` | Update                          |
| DELETE | `/buildings/{id}` | Soft-delete (`is_active=false`) |




#### Floors


| Method | Path                              | Description        |
| ------ | --------------------------------- | ------------------ |
| GET    | `/buildings/{building_id}/floors` | List floors        |
| POST   | `/buildings/{building_id}/floors` | Create             |
| PATCH  | `/floors/{id}`                    | Update             |
| DELETE | `/floors/{id}`                    | Delete if no rooms |




#### Rooms


| Method | Path          | Description                                        |
| ------ | ------------- | -------------------------------------------------- |
| GET    | `/rooms`      | List; query `building_id`, `floor_id`, `is_active` |
| POST   | `/rooms`      | Create                                             |
| PATCH  | `/rooms/{id}` | Update                                             |
| DELETE | `/rooms/{id}` | Soft-delete                                        |




#### Events


| Method | Path                    | Description                                                   |
| ------ | ----------------------- | ------------------------------------------------------------- |
| GET    | `/events`               | List                                                          |
| POST   | `/events`               | Create                                                        |
| GET    | `/events/{id}`          | Get with nested activities, time_blocks                       |
| PATCH  | `/events/{id}`          | Update                                                        |
| GET    | `/events/{id}/schedule` | **Composite:** rooms (filtered), allocations, layout metadata |


`GET /events/{id}/schedule` response shape:

```json
{
  "event": { "...": "..." },
  "buildings": [ { "id": "...", "code": "DWIN", "floors": [...], "rooms": [...] } ],
  "activities": [ ... ],
  "timeBlocks": [ ... ],
  "allocations": [ ... ]
}
```

Rooms nested under buildings with floors as grouping metadata for the grid.

#### Activities & TimeBlocks

Nested under event:


| Method       | Path                             |
| ------------ | -------------------------------- |
| GET/POST     | `/events/{event_id}/activities`  |
| PATCH/DELETE | `/activities/{id}`               |
| GET/POST     | `/events/{event_id}/time-blocks` |
| PATCH/DELETE | `/time-blocks/{id}`              |




#### Allocations


| Method | Path                                  | Description                                                     |
| ------ | ------------------------------------- | --------------------------------------------------------------- |
| GET    | `/events/{event_id}/allocations`      | List                                                            |
| POST   | `/events/{event_id}/allocations`      | Create one                                                      |
| POST   | `/events/{event_id}/allocations/bulk` | Create many; body `{ room_ids, activity_id, start_at, end_at }` |
| PATCH  | `/allocations/{id}`                   | Update                                                          |
| DELETE | `/allocations/{id}`                   | Delete                                                          |


**Bulk response:**

```json
{
  "created": [ "uuid", ... ],
  "skipped": [ { "room_id": "uuid", "reason": "overlap" } ]
}
```

**Error codes**


| Code | When                                        |
| ---- | ------------------------------------------- |
| 409  | Overlap on create/update                    |
| 422  | Validation (end before start, outside grid) |




#### Validation response (warnings)

```json
{
  "allocation": { "...": "..." },
  "warnings": [
    { "code": "ROOM_TYPE_MISMATCH", "message": "Relay is not recommended in auditorium rooms" }
  ]
}
```



### 4.3 Phase 1 acceptance criteria

- [ ] All v0 grid behaviors work against API
- [ ] CRUD for buildings, floors, rooms, events, activities, time blocks
- [ ] Bulk allocation endpoint matches floor-select UX
- [ ] Server rejects overlapping allocations with 409
- [ ] Schedule survives server restart (Postgres)
- [ ] Alembic migration from empty DB

---



## 5. Phase 2 — Collaboration



### 5.1 Additional scope

- Organization/workspace model
- Auth (recommend Clerk or magic-link for speed)
- Roles: `viewer`, `editor`, `admin`
- WebSocket channel per event: `ws://host/ws/events/{event_id}`
- Optimistic UI with server confirmation
- Presence: connected users + optional viewport hint
- Audit log table



### 5.2 WebSocket protocol

**Client → server**

```json
{ "type": "subscribe", "event_id": "uuid" }
{ "type": "allocation.create", "temp_id": "client-1", "payload": { ... } }
{ "type": "allocation.update", "payload": { "id": "uuid", ... } }
{ "type": "allocation.delete", "payload": { "id": "uuid" } }
{ "type": "presence", "payload": { "building_id": "uuid", "view_row": 12 } }
```

**Server → client**

```json
{ "type": "allocation.created", "temp_id": "client-1", "payload": { ... } }
{ "type": "allocation.updated", "payload": { ... } }
{ "type": "allocation.deleted", "payload": { "id": "uuid" } }
{ "type": "error", "payload": { "code": "OVERLAP", "message": "...", "ref": "client-1" } }
{ "type": "presence", "payload": { "user_id": "...", "name": "Alex", ... } }
```

**Conflict resolution:** last-write-wins on `updated_at`. Server is authoritative; client rolls back optimistic state on error.

### 5.3 Phase 2 acceptance criteria

- [ ] Two browser tabs see allocation changes within 500ms
- [ ] Viewer role cannot mutate
- [ ] Failed optimistic update reverts block position
- [ ] Audit log records create/update/delete with user_id

---



## 6. Phase 3+ — Deferred summary


| Feature              | Notes                                                                        |
| -------------------- | ---------------------------------------------------------------------------- |
| BmMT template import | JSON endpoint loading seed into new event                                    |
| Proctor entity       | M2M with allocations; filter grid                                            |
| Export CSV           | `room_display, start, end, activity, notes`                                  |
| Export PDF           | Print-oriented grid layout                                                   |
| Capacity dashboard   | Sum `optimal_capacity` for allocated competition rooms vs `event.team_count` |
| Google Sheets import | Phase 4; column-fuzzy mapping                                                |


---



## 7. Visual design tokens


| Token                 | Value       | Usage            |
| --------------------- | ----------- | ---------------- |
| `--slot-height`       | `24px`      | Grid row         |
| `--col-width`         | `80px`      | Room column      |
| `--header-building`   | `#e8f0fe`   | Building band    |
| `--header-floor`      | `#f1f3f4`   | Floor band       |
| Room type: auditorium | `#c8daf5`   | Column tint      |
| Room type: small      | `#d4edda`   | Column tint      |
| Room type: large      | `#f8d7da`   | Column tint      |
| Overlap error         | `#dc3545`   | Block border     |
| Selection             | `#0d6efd40` | Column highlight |


Activity colors come from `Activity.color` in data, not CSS.

---



## 8. BmMT seed data sketch

Illustrative excerpt for `bmmt-2026.json`:

```json
{
  "event": {
    "name": "BmMT 2026",
    "eventDate": "2026-03-15",
    "timezone": "America/Los_Angeles",
    "slotMinutes": 15,
    "gridStart": "07:00",
    "gridEnd": "16:15"
  },
  "buildings": [
    { "id": "b-dwin", "code": "DWIN", "name": "Dwinelle Hall" },
    { "id": "b-vlsb", "code": "VLSB", "name": "Valley Life Sciences Building" }
  ],
  "floors": [
    { "id": "f-dwin-1", "buildingId": "b-dwin", "label": "1", "sortOrder": 1 },
    { "id": "f-dwin-2", "buildingId": "b-dwin", "label": "2", "sortOrder": 2 }
  ],
  "rooms": [
    { "id": "r-dwin-155", "buildingId": "b-dwin", "floorId": "f-dwin-1", "name": "155", "roomType": "auditorium", "capacity": 481, "optimalCapacity": 400 },
    { "id": "r-dwin-170", "buildingId": "b-dwin", "floorId": "f-dwin-1", "name": "170", "roomType": "small", "capacity": 35, "optimalCapacity": 30 }
  ],
  "activities": [
    { "id": "a-puzzle", "name": "Puzzle", "color": "#F4A460", "defaultDurationMin": 75 },
    { "id": "a-indiv", "name": "Indiv", "color": "#FFF59D", "defaultDurationMin": 60 }
  ],
  "timeBlocks": [
    { "id": "tb-arrival", "label": "Arrival", "startTime": "07:00", "endTime": "07:45", "color": "#B3E5FC" },
    { "id": "tb-puzzle", "label": "Puzzle", "startTime": "09:15", "endTime": "10:30", "color": "#F4A460" }
  ],
  "allocations": []
}
```

Full seed should include ~30 rooms from the Room Capacities tab when available.

---



## Appendix A — PostgreSQL DDL (Phase 1)

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

-- Overlap prevention (requires btree_gist extension)
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE allocations ADD CONSTRAINT allocations_no_overlap
  EXCLUDE USING gist (
    event_id WITH =,
    room_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  );
```

---



## Appendix B — Key algorithms



### B.1 Grid column order

```typescript
function orderedColumns(
  buildings: Building[],
  floors: Floor[],
  rooms: Room[],
  collapsed: Set<string>
): GridColumn[] {
  return buildings
    .filter((b) => !collapsed.has(`building:${b.id}`))
    .flatMap((building) => {
      const buildingFloors = floors
        .filter((f) => f.buildingId === building.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      const floored = buildingFloors.flatMap((floor) => {
        if (collapsed.has(`floor:${floor.id}`)) return [];
        const floorRooms = rooms
          .filter((r) => r.buildingId === building.id && r.floorId === floor.id)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
        return floorRooms.map((room) => ({ building, floor, room }));
      });

      const unassigned = rooms
        .filter((r) => r.buildingId === building.id && !r.floorId)
        .map((room) => ({ building, floor: null, room }));

      return [...floored, ...unassigned];
    });
}
```



### B.2 Snap to slot

```typescript
function snapToSlot(iso: string, gridStart: string, slotMinutes: number, eventDate: string, tz: string): string {
  // Convert to minutes from gridStart on eventDate, round to nearest slot, convert back
}
```

---

*End of spec. v0 (Section 3) is complete. Next: Phase 1 core loop.*