# Indoor Maps

**Status**: Draft (future — not Phase 2)

Product context: [PRODUCT.md](../PRODUCT.md). Parent vision: [event operations platform](2026-08-22-ops-platform.md) (maps are a projection of the rooms kernel, not a second catalog). Depends on catalog **Building → Floor → Room** from [Phase 1](2026-08-11-phase-1-core-loop.md). Org-scope the catalog when [Phase 2c](2026-08-13-phase-2-accounts-orgs.md) lands; do not block a first slice on orgs or public HTTPS. Live exam overlay overlaps Phase 3 proctors. Do not implement until this spec is scheduled.

Source files (not in this repo yet): BMT Maps Spring 2026 Figma toggle maps — Dwinelle (`C` / `D` / `E`), Wheeler (`B` / `1` / `2`), VLSB (`2`). Print layouts stay in Figma; this app does not reproduce the poster.

## Problem

The allocations **grid** answers “what is in DWIN155 at 10:45.” Day-of staff and a phone browser need “where is 155, and what color is this floor in Internal vs External mode?”

Those answers today live in Figma: stacked overlays, a type legend, and icons. Figma is a good drafting tool and a bad device map (no pinch-zoom, no search, no live exam status). Re-tracing rooms by hand will not survive the next building file.

We need the catalog’s rooms to sit on a **to-scale indoor map** imported from those files, with a viewer built for touch, and a join path for capacity (already on `rooms`) and a later live-event feed (role, proctors, timers).

## Design

### Decisions (this spec)

| Topic | Decision | Why |
| ----- | -------- | --- |
| Viewer | **Option C:** Leaflet `CRS.Simple` (local pixels, not GPS) | Device pan/zoom/search. Same data as a raw SVG page; the library owns gestures. Print is not a product surface |
| Rejected | Option B (exported SVG as source of truth) | Room search, restyle, and re-import fight node ids trapped in files |
| Rejected | Option A as the *product* viewer | Fine for a kiosk poster; weak on phone. Schema is the same as C |
| Coordinate system | Figma artboard pixels (x right, y down) on each floor | Matches the files; `pixels_per_meter` optional later, not required to draw |
| Geometry store | GeoJSON `Polygon` / `MultiPolygon` in **JSONB** on vanilla Postgres 16 | No PostGIS in v1; docker-compose stays `postgres:16` |
| Author of shape | **Figma import only** | Two sources of walls will drift. Re-import is the audit trail |
| Identity | Room **code** (`155`, `22A`), never Figma node guids | Duplicate a frame and the guid changes |
| Modes | `blank` \| `internal` \| `external` as **styles on one geom** | Overlays in the files are paint, not a second building |
| Capacities | Existing `rooms.capacity` / `optimal_capacity` | Do not copy onto map polygons |
| Live exam data | Separate overlay joined by room id/code | Timers and proctors must not live in the import |
| Stack | Existing Vite SPA + FastAPI `/api/v1` + hash routes | This repo; not Next.js |
| C4 | Update diagrams **in the same commit as the code**, not this docs-only change | Specs are not as-built |

### Three stores, one join key

```
Figma .fig  --import-->  map store (geom, kind, blank/internal/external fills)
Catalog                  rooms (capacity, room_type, active)     -- already shipped
Event ops                live overlay (role, proctors, timer)    -- Phase 3 / later
```

Join is **building code + floor label + room code** (`DWIN` / `D` / `155`), plus `aliases[]` for stacked labels (`22A + 22AA`). Map spaces that are not bookable (stairs, bathrooms, courtyards) have **no** `room_id`.

```text
Browser
  static:  GET /api/v1/maps/DWIN/D?mode=external   → long cache
  facts:   space.roomId → rooms.capacity           → already on the space if joined
  live:    GET /api/v1/maps/DWIN/D/live?event=…    → short cache / poll
  join:    space.id in both map and live payloads
```

Public deploy does not merge these databases. It adds auth on the live payload.

### How this attaches to the catalog

Do **not** invent a parallel `buildings` table. Map rows hang off existing `floors`.

| Catalog today | Map |
| ------------- | --- |
| `Building.code` (`DWIN`, `VLSB`) | Same. Add `WHEE` (or agreed code) when Wheeler is imported |
| `Floor.label` | **Must match Figma floor codes** (`C`/`D`/`E`, `B`/`1`/`2`). v0 seed uses Dwinelle `1`/`2` as stand-ins; import cannot join until labels are real |
| `Room.name` | Map `code`. Display label stays `{building.code}{room.name}` → `DWIN155` |
| `Room.room_type` (`auditorium` \| `small` \| `large`) | Map **external `kind`** is a wider closed set (classroom, bathroom, stair, …). Bookable rooms keep catalog `room_type` for the grid; map `kind` is for paint and legend |
| Capacity | Catalog only |

A floor can have more **spaces** than **rooms**. Shafts, hallways, Ishi Court, VLSB courtyard, and restrooms are spaces (and sometimes POIs). Only tappable spaces with a catalog match become grid columns.

### Geometry the importer must keep

Observed in the three Figma files. Store as GeoJSON in floor-local pixels.

| Shape in Figma | Examples | Stored as |
| -------------- | -------- | --------- |
| Axis-aligned rect | Most Wheeler / VLSB classrooms | `Polygon` |
| Freeform vector | Dwinelle 155, hallways, VLSB Library / Courtyard | `Polygon` from path |
| Boolean union / subtract | Wheeler `Stage + Ventilation`, corridor; VLSB `Subtract` | `Polygon` with holes or `MultiPolygon` |
| Multi-piece room | 155 `(1)+(2)`, 142 four parts, 117 + 117A–D | **One space**, `MultiPolygon` |
| Combined label | Wheeler `22A + 22AA` | One space, `code` + `aliases[]` |
| Parent + inner rooms | Wheeler 200 → 200A, 200B | Children are spaces with `parent_id` |
| Named non-room regions | Building outline, hallway, court, catwalk, shaft | `kind` like `structure` / `circulation` / `outdoor`; usually `tappable: false` |
| Point-like icons | Elevator, stair up/down, restroom, exit, VLSB dino | `Point` POI, and/or a space polygon if the file drew a plate |

**Tap target:** hit-test the polygon, then a **minimum ~44 CSS-pixel pad** so tiny plates (shafts, Dwinelle 176) stay tappable when zoomed out.

Do **not** store three copies of geometry for blank / internal / external.

### External `kind` (public toggle)

Closed set from the shared BMT color variables (mint classroom, navy auditorium, yellow stair, cyan bathroom, red staff, greys):

`classroom` · `auditorium` · `staff` · `stair` · `elevator` · `bathroom_mw` · `bathroom_gn` · `information` · `exit` · `circulation` · `structure` · `outdoor` · `other`

**Internal** is not that enum. Wheeler internal is event/ops (`Testing Rooms`, `HQ`, `Scanning`, …). Dwinelle internal is occupancy coloring. Store as `internal_label` (nullable string) plus fill on `space_styles` for `mode=internal`.

### Persistence (map store)

New tables (names indicative). JSON is camelCase at the API; SQL is snake_case.

```text
floor_maps         floor_id UNIQUE
                   width, height              -- Figma artboard
                   source_fig, source_hash, imported_at

map_spaces         floor_map_id
                   code                       -- "155", "2070", "Mens Restroom"
                   aliases[]                  -- ["22A","22AA"]
                   kind                       -- external kind
                   geom                       -- GeoJSON Polygon / MultiPolygon
                   parent_id                  -- 200A → 200
                   room_id NULL               -- FK rooms, set when codes match
                   tappable
                   vertical_link JSONB        -- { type: stair|elevator, toFloor, toSpaceId? }

space_styles       space_id, mode             -- blank | internal | external
                   fill_hex, visible
                   internal_label             -- nullable

map_pois           floor_map_id, type, geom Point
                   label                      -- "MAIN ENTRANCE", "dino", "To Floor 1"
                   space_id NULL

map_legend_items   floor_map_id, mode, kind, label, fill_hex

map_import_overrides
                   -- keyed by building code + floor label + space code
                   aliases, kind, tappable, hidden, room_id
                   -- re-import merges by code and KEPT unless "reset from Figma"
```

`floors` may grow optional `sort_order`-only fields; artboard size lives on `floor_maps` because a building can exist in the catalog before it has a map.

No in-app polygon editor. Emergency geom fix = hide space, or re-import that floor from a new `.fig`.

### API (reads)

Session cookie like the rest of `/api/v1` for v1 (same 401 without a cookie). A later public kiosk can expose geometry + `mode=external` without live internals; that is an auth change, not a schema change.

```text
GET /api/v1/maps
  → [{ buildingCode, buildingName, floors: [{ label, hasMap }] }]

GET /api/v1/maps/{buildingCode}/{floorLabel}?mode=external
  → {
      floor: { buildingCode, label, width, height },
      mode,
      spaces: [{
        id, code, aliases, kind, geom, fill, tappable,
        parentId, roomId, verticalLink, capacity, optimalCapacity
      }],
      pois:   [{ id, type, geom, label, spaceId }],
      legend: [{ kind, label, fill }]
    }

GET /api/v1/maps/spaces/{id}
  → space + building/floor + other modes’ labels + vertical neighbors
    + catalog room fields when roomId is set

GET /api/v1/search/maps?q=155&building=DWIN
  → [{ spaceId, code, buildingCode, floorLabel, kind }]
    match code, aliases, poi labels ("dino", "ishi")
```

`mode` is a query param, not a different floor. Unknown building/floor → **404**. Unknown mode → **400**.

Capacity is inlined from `rooms` when joined so the bottom sheet does not need a second round-trip. Inactive catalog rooms can still appear as map spaces; the sheet should show inactive if `rooms.is_active` is false.

**Live (later slice, not v1 of the map):**

```text
GET /api/v1/maps/{buildingCode}/{floorLabel}/live?event={eventId}
  → { asOf, spaces: [{ id, status, role, label, until, headcount, capacity }] }
```

Public view: role + timer + counts. Proctor/HQ views (authz): names, radios, rosters — **not** on a public URL. Student names never belong on the floor color layer.

Client clocks timers locally from `until` / `ends_at` (no 1 Hz polling). Poll live JSON every 5–15s or on room change. Geometry stays cacheable.

### Frontend (device)

Stay on the Vite hash router. New routes:

- `#/maps` — building pick (Dwinelle, Wheeler, VLSB when each has a `floor_map`)
- `#/maps/{buildingCode}/{floorLabel}` — main map (`?mode=` , `?space=`)

Chrome stays **outside** the map so it does not fight gestures.

```text
┌ status / safe area ─────────────────────────────────┐
│  [Building ▾]     search 🔍      [C][D][E]          │  floor chips; Wheeler [B][1][2]
│  [ Outline | Internal | External ]                  │  mode; thumb-sized
├─────────────────────────────────────────────────────┤
│              MAP (full remaining height)            │
│         pinch / pan / tap rooms                     │
│  legend chips (scroll horizontal)                   │  filter kinds, not a Figma sidebar
└─────────────────────────────────────────────────────┘
        room sheet slides up on tap
```

- Leaflet `CRS.Simple`, `viewBox` = floor `width` × `height`.
- Min zoom: entire floor fits with padding (Wheeler 1 ~564×621, VLSB 2 ~1134×1777 — **fitBounds per floor**).
- Max zoom: labels readable.
- Floor chips: swap floor. **Keep camera if footprints align** (Dwinelle C/D/E roughly); otherwise fitBounds. Wheeler B vs 1 vs 2 do **not** share a camera.
- Mode switch: restyle fills; camera unchanged. v1 may refetch `?mode=`; better: one geom payload + styles per mode so Internal/External does not reload polygons.
- Legend chips: multi-select kind filter (dim others).
- Room sheet: code, floor, building, kind, internal label, capacity, live fields if present. **Go to stair / other floor** if `verticalLink` exists. Close: swipe down or tap map.
- Search: current building or campus-wide; select → switch floor if needed, `flyTo` polygon, open sheet.
- Deep link: `#/maps/DWIN/D?mode=external&space=155`.

No print route. No stacked C+D+E poster.

#### Gestures

| Input | Behavior |
| ----- | -------- |
| One-finger drag | Pan |
| Pinch / trackpad / ctrl-wheel | Zoom toward pinch center |
| Double-tap | Zoom in one step (or fit if already in) |
| Tap space | Select, pulse fill, open sheet |
| Tap empty (hallway / court) | Deselect, close sheet |
| Tap legend chip | Toggle kind filter |
| Tap floor chip | Swap floor (camera rule above) |
| Tap mode | Restyle fills |
| Tap POI | Same as space if linked; else short tooltip |
| Browser back | Close sheet, then leave building |

Accessibility: every tappable space has a name; keyboard order is search → floors → mode → map; `prefers-reduced-motion` skips `flyTo`.

### Import contract (robustness)

A future `.fig` does not “look right.” It **passes a report**. The importer maps many frame titles → one **role**. Version the alias table with the importer.

| Role | Names already seen |
| ---- | ------------------ |
| Floor | `C Floor`, `First Basement`, `Floor 2`, `F1` |
| Base / outline | `Frame`, `Frames`, `Building plans` |
| Blank plates | `Blanks`, `Classroom Backgrounds`, `Not used rooms` |
| External overlay | `External`, `External rooms`, `External Coloring Overlay` |
| Internal overlay | `Internal`, `Internal-Not-Ext`, `Internal Coloring Overlay` |
| Circulation | `Stairs`, `Elevator/Stairs`, `Stairs/elevator` |
| Ignore | Labels, legend, print, `Internal Only Canvas`, foreign buildings pasted into the file (Dwinelle pages inside Wheeler/VLSB) |

Rules:

1. One **space** per named room/plate even if Figma drew it in Blank, Internal, and External.
2. Prefer Blanks / Not used + External for geom; overlays only supply `kind` + fill.
3. Flatten boolean ops to polygons **before** insert.
4. Merge `155(1)` + `155(2)` by parent frame name.
5. Keep `22A + 22AA` as one code with aliases.
6. Skip `visible=false` unless the role is an overlay you opted into.
7. POIs from icon frames even when a plate is also a space.
8. `tappable: false` for Shaft, Building Outline, Corridor, unlabeled `????` until named.
9. After insert, set `room_id` where `(building.code, floor.label, space.code)` matches a catalog room (also try aliases).

**Fail the import** (or CI) on: floor with zero tappable spaces; two tappable spaces with the same `code` on one floor; external overlay codes that do not exist on the blank layer; legend `kind` with no matching space; unknown top-level layer when `strict: true`.

**Warn** on designer junk names, `????`, hidden old overlays, catalog rooms on that floor with no space.

Dry-run prints a report, for example:

```text
building: WHEE
floors: B, 1, 2
spaces: 84  (geom ok 84, missing geom 0, duplicate code 0)
overlays: blank 84, external 31, internal 12
joined catalog rooms: 12
unmapped layers: "lowk unsure (stairs??)"
skipped: Print View, Page 2 (foreign: dwinelle)
warnings: "22A + 22AA" has no aliases split
```

**Golden files:** commit canonical import JSON (codes + kind + geom hash), not raw kiwi. On every importer change, import Dwinelle / Wheeler / VLSB and diff. Optional PNG render + image-diff. New `.fig` → same job; green or a reviewed snapshot update.

Fragile (do not scrape): exact page names, z-order, View 1 vs View 2, whether color lives on the overlay frame vs child vector, Print View as source, fig-kiwi version (that is an `openfig-core` upgrade + goldens).

Over time, Figma can meet the importer: Room/Stair/Restroom components with `code` / `kind` / `tappable`, or pluginData `{ role, code }`, and one **Import me** page per building. Until then, aliases + strict report are enough.

Treat each `.fig` as untrusted input:

```text
.fig → parse → assign roles (aliases) → merge by room code
    → validate (report) → write map DB → join catalog rooms
```

### Who may edit what

| Layer | Who | How |
| ----- | --- | --- |
| Polygons, floors, holes, multi-part rooms | Map maintainer | Figma → import |
| Hide / unhide space, “not a floor”, kind override, aliases | Map maintainer | Overrides table; import report shows them |
| Capacity, ADA notes, catalog `room_type` | Catalog editors (today: anyone signed in; later org members) | Existing `#/catalog` — not the map |
| Event role, proctors, timers, headcount | Event HQ (Phase 3) | Live overlay UI / event DB |
| Public / students | Read map + public live fields | No writes |

If it would still be true after BMT weekend, it is either Figma (shape) or the catalog (capacity). If it is only true for this session, it is the live overlay.

### Example payload (Dwinelle D, external)

Illustrative, not from a committed fixture:

```json
{
  "floor": { "buildingCode": "DWIN", "label": "D", "width": 955, "height": 692 },
  "mode": "external",
  "spaces": [
    {
      "id": "uuid",
      "code": "155",
      "aliases": [],
      "kind": "auditorium",
      "geom": { "type": "MultiPolygon", "coordinates": [] },
      "fill": "#2735e4",
      "tappable": true,
      "parentId": null,
      "roomId": "uuid-or-null",
      "verticalLink": null,
      "capacity": 481,
      "optimalCapacity": 400
    }
  ],
  "pois": [{ "id": "uuid", "type": "elevator", "geom": { "type": "Point", "coordinates": [120, 80] }, "label": "Elevator", "spaceId": null }],
  "legend": [
    { "kind": "classroom", "label": "Classroom", "fill": "#bbedc3" },
    { "kind": "auditorium", "label": "Auditorium", "fill": "#2735e4" }
  ]
}
```

Legend is the distinct `kind` values present on that floor in that mode (C’s legend includes Bathroom; D’s Figma copy said “Bathroom on Floor C”).

## In Scope (when scheduled)

- `floor_maps` / `map_spaces` / styles / POIs / legend / overrides
- Importer + role alias table + fail-loud report
- Golden JSON fixtures once `.fig` files are in `server/data/maps/` (or a private fixture path)
- Read APIs above; search
- Leaflet map route, floor/mode chrome, bottom sheet, kind filters
- Join to catalog rooms for capacity and `roomId`
- Catalog floor **labels** aligned with Figma for buildings we import

## Not in Scope

- Print View / poster layout (print from Figma)
- In-app polygon drawing or boolean ops
- PostGIS, GPS, campus lat/lng, turn-by-turn routing
- Full stair/elevator graph beyond explicit `vertical_link`
- WebSockets (poll is enough for timers + headcount)
- Named student rosters or per-student timers on the map
- Indoor location of people (beacons / Wi-Fi)
- Crowd heatmaps
- Next.js, Zustand, Tailwind, pnpm (not this repo’s stack)
- Updating [docs/c4/](../docs/c4/README.md) until code exists
- Phase 2c orgs, 2e public HTTPS, or Phase 3 proctor product — only the join shape for when they exist

## Implementation Plan

Each step is shippable without the later ones.

1. **Catalog labels** — Dwinelle floors become C/D/E (or whatever the files use); add Wheeler building when we have a code. Grid seed rooms must sit on the correct floor (155 is not “floor 1” if the map says C).
2. **Schema + empty read API** — tables and `GET /maps/...` returning `[]` / 404.
3. **Importer** — parse `.fig`, contract + report, write spaces; golden tests on Dwinelle D first, then Wheeler B/1/2 (boolean corridors), then VLSB 2 (tall courtyard).
4. **Viewer** — Leaflet page, mode toggle, tap sheet, kind chips.
5. **Search + deep links** — `q=155`, `?space=`.
6. **Live overlay** — `/live` + restyle; public vs HQ views; reuse Wheeler internal legend strings as event roles.
7. **Optional public GET** — geometry + external mode without a session, after 2e auth story is explicit.

First interactive slice: **Dwinelle D** on this API. Wheeler proves numbered floors + holes. VLSB proves a tall footprint and landmark POIs.

## Open Questions

| Question | Status |
| -------- | ------ |
| Leaflet vs MapLibre | **Decided for v1:** Leaflet `CRS.Simple`. Revisit if label collision or vector styling becomes painful |
| PostGIS | **Decided for v1:** JSONB GeoJSON. Add PostGIS only if we need area / intersects queries |
| Dwinelle floor labels vs v0 `1`/`2` | **Open:** exact mapping of current seed rooms (155, 182, …) onto C/D/E before first import |
| Wheeler building `code` | **Open:** `WHEE` vs `WHEELER` vs registrar code — must be unique like `DWIN` / `VLSB` |
| Unauthenticated map GET | **Open:** v1 stays session-gated; public kiosk is a later auth decision |
| `room_type` vs map `kind` | **Decided:** both exist. Grid keeps `auditorium`/`small`/`large`. Map paint uses `kind` |
| Internal taxonomy | **Decided:** per-building `internal_label` strings, not a global event enum |
| When to schedule vs Phase 2c–2e / Phase 3 | **Open:** geometry viewer can ship on 2b catalog; live overlay wants Event + roles |
| Where `.fig` files live | **Open:** git LFS / `server/data/maps/` vs CI-only secrets. Canonical JSON goldens must be in git |
| Figma components / pluginData | **Later:** nice; not a v1 blocker |
