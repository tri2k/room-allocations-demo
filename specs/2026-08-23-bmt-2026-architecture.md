# BMT 2026 architecture (after round 2)

**Status**: Draft (enough to spec modules; a few holes called out)

Parent: [ops platform](2026-08-22-ops-platform.md). Indoor maps: [2026-08-21-indoor-maps.md](2026-08-21-indoor-maps.md). First event: **BMT 2026, Saturday 2026-11-14**. Design load: ~1800 contestants, ~50+ testing rooms, ~300 volunteers.

## Are we ready to spec details?

**Yes, for architecture.** Round 2 is enough to lock write-boundaries, login kinds, contest shape, and how the six modules share `rooms.id`. We should write per-module specs next (screens, APIs, failure modes) **without** waiting for spreadsheet dumps (73–79).

**Not yet ready to freeze UI chrome** (HQ columns, map colors, volunteer form fields, shift UI). Those can be marked “TBD in module spec” and designed against the same data model.

**Must-ship everything on Nov 14** plus printed backup is tight. Architecture should optimize for **one deploy and paper fallback**, not six vibecoded sites (last semester 4/5 broke).

## Four questions that were easy to misread

| # | You heard | What it actually asked | What we will assume unless you object |
| - | --------- | ---------------------- | ------------------------------------- |
| 14 | Unclear | Can **two people edit the same allocator grid** at once before the event? Today a sheet has one owner. | **No concurrent grid edit.** One person builds the sheet; ops **admin imports** it. Organizers **view** the day plan. |
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
| **Room (proctor suite)** | **Username = room code** (`DWIN155`), plus a **per-event secret** (PIN — room numbers are public) | Timer (start only), clarifications, **projection** of timer + clarifications. Optional roster names on the **operator** view, **not** on the projector (privacy) unless we decide otherwise |
| **Guest** | None | `live.berkeley.mt` |
| **Volunteer applicant** | Public form (no Google required to apply) | Signup only |

Proctor-as-person (the volunteer assigned to 155) is **not** the same as the room login. Assignments still point at `rooms.id`; the laptop does not need that volunteer’s Google account.

Default for the room secret: generated when the day plan is imported; printable on the HQ room sheet and on the paper backup. Reject this if you want a shared global PIN.

### Catalog kernel

- Identity: user-editable **building code** + floor label + room name. Display `DWIN155`.
- Built-in numeric: **`capacity` only**.
- **Field definitions** (org-level): name, type (number / text / yes-no). Values per room. “Guts capacity,” “optimal,” “ADA” are examples staff add — not hardcoded.
- Active/inactive is catalog (room truly gone or unused for the org). **“Not using 155 today” is not inactive.**
- Tentative Nov 14 halls: Dwinelle, Wheeler, MLK, VLSB, GPBB — codes staff edit.
- **Spaces** (food, merch, not a classroom): agreed we want a more general location type. **v1:** if it is in a room, it is a catalog room; if it is a table in a hallway, either skip it, use a dummy room, or a later `Space` row with `tappable` / no capacity. Do not block Nov 14 on a full GIS of tables.

### Contest model (grid)

Rounds a student takes: **Power**, **Individual**, **Guts**.

Individual: **two focus tests out of four**, or **one general**.

**Grid rule (locked):** one room × one time slot = **one activity**. No split rooms.

**Awareness of focus vs general (proposal — object if wrong):**

- Activities on the sheet are the units HQ and clarifications target: e.g. `Power`, `Guts`, `General`, `Algebra`, `Geometry`, … (real names TBD).
- An optional **activity group** `Individual` wraps General + the four focus activities so HQ can still say “all Individual rooms” without it being the same as Power.
- **Student choice** (2 focus vs general) lives on the **roster**, not on the room. The room does not need to know that a student in Algebra is also in Combinatorics later; that is two roster rows (already decided).

We should **not** encode “Individual vs focus” as a special case in the timer. Timers only care: this room is testing or not.

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

- **Projection** (HDMI): large timer + clarifications (text/images). No HQ notes, no full campus roster.
- **Operator** (same login, phone or laptop): start button, desync banner, optional names list.

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
- Printed plan/PIN/assignment packet after import.
- Offline timer with explicit desync, not silent drift.
- Do not make the projector depend on a second “vibecoded” host.

## Open holes (do not block the rest)

| Hole | Blocks |
| ---- | ------ |
| General **spaces** (food/merch not in a room) | Only those labels on the map, not testing |
| Exact **activity names** for four focus tests + general | Clarification presets; can rename |
| Day-plan **move room** UI | Workaround: re-import a fixed sheet (clocks kept) |
| Roster CSV headers | Mapper; import still works |
| HQ list columns / red meaning | Can ship list+map with a minimal column set |
| Public per-room detail | Flag |
| Outdoor maps | Stretch |
| Shift editor, form fields, 73–79 artifacts | Volunteer/catalog content, not kernel |
| Room-login PIN vs password | Security of room username; must decide before proctor ship |
| Projection vs operator as one URL or two | Same session either way |

## Next specs to write (no application code yet)

1. Catalog + custom fields + code mappings  
2. Allocator + bulk floor assign + import-to-ops  
3. Day plan + live overlay + HQ list/map + print backup  
4. Proctor/projection + clarifications  
5. Roster import + in-app move  
6. Volunteers (form builder, roles, check-in) — can trail 3–5 slightly  
7. `live.berkeley.mt` announcements + maps  

Object to the **assumptions in the misread table** and the **activity-group proposal** if they are wrong; everything else can be detailed in those seven write-ups.