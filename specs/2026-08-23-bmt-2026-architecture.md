# BMT 2026 architecture (after round 2)

**Status**: Draft (assumptions 1–4 locked; module workshop starts with catalog)

Parent: [ops platform](2026-08-22-ops-platform.md). Indoor maps: [2026-08-21-indoor-maps.md](2026-08-21-indoor-maps.md). First event: **BMT 2026, Saturday 2026-11-14**. Design load: ~1800 contestants, ~50+ testing rooms, ~300 volunteers.

## Are we ready to spec details?

**Yes, for architecture.** Round 2 is enough to lock write-boundaries, login kinds, contest shape, and how the six modules share `rooms.id`. We should write per-module specs next (screens, APIs, failure modes) **without** waiting for spreadsheet dumps (73–79).

**Not yet ready to freeze UI chrome** (HQ columns, map colors, volunteer form fields, shift UI). Those can be marked “TBD in module spec” and designed against the same data model.

**Must-ship everything on Nov 14** plus printed backup is tight. Architecture should optimize for **one deploy and paper fallback**, not six vibecoded sites (last semester 4/5 broke).

## Four questions that were easy to misread

| # | You heard | What it actually asked | What we will assume unless you object |
| - | --------- | ---------------------- | ------------------------------------- |
| 14 | Unclear | Can **two people edit the same allocator grid** at once before the event? | **Decided: no live co-edit.** One person builds the sheet; ops admin imports it. Organizers view the day plan. |
| 21 | “Is a spreadsheet import required?” | “What **columns** are on the capacity sheet?” | **Manual catalog entry is fine.** Built-in `capacity` + **user-created fields** cover unknown columns. |
| 27 | “Paper??” | If Algebra must **move from 155 to 182 during Saturday**, how does software record that **without** editing the rooms catalog? | **Day-plan override in ops** (not catalog, not “print a sticky and hope”). Details of that UI are still open. |
| 31 | “??” | What **headers** does the registration CSV actually have? | **Unknown.** Spec a **column mapper** at import time (map “Room” / “Location” / … onto catalog rooms). |

## Locked architecture

### What may write what

```text
Catalog (buildings, floors, rooms, custom field defs)
  writers: Google admin only
  never: HQ day-of, proctors, public, volunteer check-in

Allocator sheets (draft grid)
  writers: sheet owner (planner)
  readers: owner; ops admin at import

Day plan (frozen copy of one sheet)
  writers: ops admin import / re-import; ops admin day-plan overrides (room closed, move round)
  never: catalog tables

Live (timers, clarifications, desync, roster seats)
  writers: room session (start timer only); Google admin (everything else); roster import + in-app student move
  never: catalog

Volunteers (people, applications, assignments, DNI)
  writers: public form (application); Google admin (assignments, DNI, check-in)

Public content (announcements)
  writers: live.berkeley.mt admin panel (Google admin)
```

Day-of tools **must not** `UPDATE rooms`. “Closed,” “campus pulled,” “moved to 182” are event rows.

### Three logins (not one)

| Who | How they sign in | What they see |
| --- | ---------------- | ------------- |
| **Admin** | Google (~3 people; building leads may share this role) | Catalog, allocator, import day plan, HQ dashboard, timers (all controls), clarifications, volunteers, roster, live-site announcements, print/export |
| **Organizer** | Google | **View only** on ops/day-plan/live (no catalog writes, no timer writes) |
| **Room (proctor suite)** | **Username = room code** (`DWIN155`) + **one shared secret for the event** | Timer (**start only**), clarifications, **projection** (timer + clarifications only). Roster **names on operator view only**, not on the projector |
| **Guest** | None | `live.berkeley.mt` |
| **Volunteer applicant** | Public form (no Google required to apply) | Signup only |

Today the suite uses a **shared password in an environment variable** (all rooms, one secret, change = redeploy). Target: same UX (**one password for every room that event**), stored on the Event/day plan (hashed), **printable** on the backup packet, rotatable by admin **without** a redeploy. Unique per-room PINs are not v1.

Proctor-as-person (the volunteer assigned to 155) is **not** the same as the room login. Assignments still point at `rooms.id`; the laptop does not need that volunteer’s Google account.

### Six UIs, not six logins

The six “platforms” are **screens on one product**, not six account databases. Last semester’s breakage came from five separate deploys, not from having too few password types.

| UI | Typical person | How they prove who they are |
| -- | -------------- | --------------------------- |
| Catalog | staff looking up a room | **Google** |
| Allocator | person who builds the grid | **Google** (same account) |
| Ops / HQ dashboard | war room | **Google** (same account; **admin** vs **organizer** role) |
| Proctor + projector | laptop in DWIN155 | **Room username + shared event password** |
| `live.berkeley.mt` | students, parents, coaches | **None** |
| Volunteer signup | volunteer | **None** (form). Managers who assign people use **Google** |

That is **two** secrets (Google, room password) plus anonymous. Which **menus** a Google user sees is a **role** on that user, not a new login for catalog vs HQ vs volunteers.

Roles we already sketched (can add more later without new password systems):

- **Admin** — write catalog, import plan, HQ controls, volunteer admin, live announcements.
- **Organizer** — view ops (and, if we want, view catalog). No writes.

Nov 14 can run with ~3 Google **admins** (building leads use admin). If volunteer-managers should not import the day plan, that is a **third Google role** later (`volunteer_admin`), still Google, not a sixth password.

Catalog Q5 (“who may **read** `#/catalog`”) is only: does **organizer** include catalog view? Interim default **yes**. Tighten to admins-only if the catalog will hold notes you do not want on a view-only staff account.

Room laptops never get `#/catalog`. Guests never get it.

### Catalog kernel

- Identity: user-editable **building code** + floor label + room name. Display `DWIN155`.
- Built-in numeric: **`capacity` only**.
- **Field definitions** (org-level): name, type (number / text / yes-no). Values per room. “Guts capacity,” “optimal,” “ADA” are examples staff add — not hardcoded.
- Active/inactive is catalog (room truly gone or unused for the org). **“Not using 155 today” is not inactive.**
- Tentative Nov 14 halls: Dwinelle **DWIN**, Wheeler **WHLR**, VLSB **VLSB**; MLK and GPBB codes still open.
- **Spaces** (food, merch, not a classroom): **v1 does not need a new type.** See [Spaces later](#spaces-food--merch--difficulty-of-adding-later) for how to keep the door open.

### Contest model (grid)

Rounds a student takes: **Power**, **Individual**, **Guts**.

Individual: **two focus tests out of four**, or **one general**.

**Grid rule (locked):** one room × one time slot = **one activity**. No split rooms.

**Awareness of focus vs general (locked):**

- Activities on the sheet are the units HQ and clarifications target: e.g. `Power`, `Guts`, `General`, `Algebra`, `Geometry`, … (exact labels TBD).
- An **activity group** `Individual` wraps General + the four focus activities so HQ can still say “all Individual rooms.”
- **Student choice** (2 focus vs general) lives on the **roster**, not on the room. Two tests = two roster rows.
- Timers do **not** special-case Individual. A room is testing or it is not.

### Day plan import

1. Planner builds a sheet in the allocator (rebuild in-app; bulk assign “all of Dwinelle D …” is in scope).
2. Ops **admin** picks that sheet → **Import as today’s plan** (frozen copy of activities + allocations + included rooms).
3. Re-import replaces allocations that have not started; **running clocks stay**.
4. Day-plan **overrides** (close room, move Algebra 155→182) write override rows, never catalog.

Printed backup: PDF/CSV of the imported plan + room PINs + volunteer assignments, regenerable after import. This is a **product feature**, not an afterthought.

### Live overlay

Per testing room (and only testing rooms for timers):

- Clock: `starts_at`, `ends_at`, `paused`, `source` (server | local-desync)
- Clarification feed for that room
- Roster lines currently seated (names)
- Closed / unused-today flag

HQ dashboard: **list ↔ map toggle**. Column set, red rules, filters: later, same data.

### Proctor suite + projection

Same live data, **two presentations**:

- **Projection** (HDMI): large timer + clarifications (text/images). No roster names, no HQ notes.
- **Operator** (same login, phone or laptop): start button, desync banner, **names list**.

5-minute remaining banner on both.

HQ admin can pause/add time on any room from the ops dashboard. Add-time increments: include 1 and 5 minutes and “set end to clock time”; exact chrome can wait for a prototype (question 47).

Clarification composer (admin): pick target set (activity, building, floor, multi-select, “all with running timer”) → send. One-way. No ack. Algebra does not learn that Geometry got a message.

### Roster

- Import CSV **morning-of**, shortly after check-in.
- Column **mapper** (we do not know headers yet).
- Match room via building code mapping + room name; unmatched rows go to a review queue.
- Two tests → two rows → two `(student, room, time)` seats.
- **Move in-app** (wrong room) updates the event roster only.
- Students are **not** volunteer `Person`s.

### Volunteers (shape only)

- Form **builder** (admin), not a hardcoded Google Form clone.
- Roles **customizable**.
- **Shifts** exist (schema: assignment has a time window); UI details later.
- Default proctor count from a **capacity heuristic**, override per room.
- Check-in: **name search**.
- Returning: prefill application; **do not invite** list.
- ~300 volunteers. Shirt/dietary/etc stored; visible to managers; field list later.

### Public (`live.berkeley.mt`)

- Announcements: admin panel, English.
- **No** public countdown (room clocks differ).
- Indoor maps when Figma is imported; outdoor later.
- What a guest sees **per room**: still **undecided** — spec the payload with a flag `publicRoomDetail: none | activityLabel`.

### Reliability

Because last semester’s tools died:

- One API, one database, one staff origin + `live.berkeley.mt`.
- Printed plan / shared room-password / assignment packet after import.
- Offline timer with explicit desync, not silent drift.
- Do not make the projector depend on a second “vibecoded” host.

## Spaces (food / merch) — difficulty of adding later

v1: if pickup is **in a named room**, it is a catalog **room**. If it is a table in a hallway or Ishi Court, it is **not** on the grid. Maps can still draw unlabeled plates from Figma with **no** `room_id`.

**Cheap hedge now (recommended):** one boolean on `rooms`, e.g. `appears_on_grid` (default true). HQ, merch-in-a-classroom, and “dummy” locations can exist in the catalog for volunteers/maps/public **without** becoming allocator columns. Cost: one column + a filter on the sheet picker. This is the difference between “we stuffed food into DWIN155” and “Food pickup is a catalog row that the grid ignores.”

**What stays easy later (if we add `appears_on_grid` now):**

| Consumer | Later `Space` / area row |
| -------- | ------------------------ |
| Indoor map | Already has map-only polygons; join is optional `room_id` |
| Public site | Label + POI; no timer |
| Volunteer assignment | Point at `room_id` **or** later `location_id`; nullable room is enough if areas are rooms-with-grid-false |
| Day-of live / timers | Filter `testing` via activity, not via “is a room” |
| Roster | Testing rooms only |

**What gets expensive if we skip the hedge and only have grid rooms:**

- Volunteer “assigned to merch” has nowhere to point except a fake classroom that then shows up as a grid column (or a free-text building name — a second rooms list).
- Public “food is here” cannot share the same id as volunteer assignment.
- Retrofitting `location_id` onto assignments, maps, and announcements after Nov 14 is a migration across every module.

**What is still hard either way (do not pretend otherwise):**

- Figma geometry for a **table** that is not a room plate (new import roles, not just a boolean).
- Outdoor / MLK plaza without a floor artboard (separate map, stretch).
- Capacity, timers, clarifications on a non-room — we should **never** put those on merch. Spaces are not testing.

**Full `Location` supertype** (Room + Area share an id): cleaner long-term, extra tables now. **Not worth it before Nov 14** if `appears_on_grid` exists. Promoting “grid-false rooms” into `areas` later is a one-table rename/split, not a platform rewrite.

**Workshop ask:** confirm `appears_on_grid` (or equivalent `kind`: classroom | ops | other) on the catalog spec. Default true. Food/merch in a hallway can wait until someone is willing to put a catalog row (grid-false, no capacity required) or a Figma POI only.

## Open holes (do not block the rest)

| Hole | Blocks |
| ---- | ------ |
| General **spaces** (food/merch not in a room) | Only those labels; **hedge:** `appears_on_grid` — see above |
| Exact **activity names** for four focus tests + general | Clarification presets; can rename |
| Day-plan **move room** UI | Workaround: re-import a fixed sheet (clocks kept) |
| Roster CSV headers | Mapper; import still works |
| HQ list columns / red meaning | Can ship list+map with a minimal column set |
| Public per-room detail | Flag |
| Outdoor maps | Stretch |
| Shift editor, form fields, 73–79 artifacts | Volunteer/catalog content, not kernel |
| Projection vs operator as one URL or two | Same session either way |

## Next specs to write (workshop; no application code yet)

1. **Catalog** (in progress): [2026-08-24-catalog.md](2026-08-24-catalog.md) — custom fields, code mappings, `appears_on_grid`  
2. Allocator + bulk floor assign + import-to-ops  
3. Day plan + live overlay + HQ list/map + print backup  
4. Proctor/projection + clarifications + event room-password  
5. Roster import + in-app move  
6. Volunteers (form builder, roles, check-in)  
7. `live.berkeley.mt` announcements + maps  

Slightly off details get corrected in these write-ups, not by reopening the kernel.