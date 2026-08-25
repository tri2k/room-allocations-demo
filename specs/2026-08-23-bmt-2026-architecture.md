# BMT 2026 architecture (after round 2)

**Status**: Draft — workshop locks. **Target parent:** [greenfield integrated system](2026-08-24-integrated-system.md). The allocator prototype in this repo is not a constraint.

Parent notes: [ops platform](2026-08-22-ops-platform.md). Indoor maps: [2026-08-21-indoor-maps.md](2026-08-21-indoor-maps.md). First event: **BMT 2026, Saturday 2026-11-14**. Design load: ~1800 contestants, ~50+ testing rooms, ~300 volunteers.

## Are we ready to spec details?

**Yes, for architecture.** Round 2 is enough to lock write-boundaries, login kinds, contest shape, and how the six modules share `rooms.id`. We should write per-module specs next (screens, APIs, failure modes) **without** waiting for spreadsheet dumps (73–79). Design as if there is no existing app.

**Not yet ready to freeze visual details** (HQ columns, map colors, volunteer form fields, shift UI). Those can be marked “TBD in module spec” and designed against the same data model.

**Must-ship everything on Nov 14** plus printed backup is tight. Architecture should optimize for **one deploy and paper fallback**, not six vibecoded sites (last semester 4/5 broke).

## Four questions that were easy to misread

| # | You heard | What it actually asked | What we will assume unless you object |
| - | --------- | ---------------------- | ------------------------------------- |
| 14 | Unclear | Can **two people edit the same allocator grid** at once before the event? | **Decided: no live co-edit.** One person builds the sheet; ops admin imports it. Organizers view the day plan. |
| 21 | “Is a spreadsheet import required?” | “What **columns** are on the capacity sheet?” | **Manual catalog entry is fine.** Built-in `capacity` + **user-created fields** cover unknown columns. |
| 27 | “Paper??” | If Algebra must **move from 155 to 182 during Saturday**, how does software record that **without** editing the rooms catalog? | **Day-plan override in ops** (not catalog, not “print a sticky and hope”). Details of that UI are still open. |
| 31 | “??” | What **headers** does the registration CSV actually have? | **Unknown.** Spec a **column mapper** at import time (map “Room” / “Location” / … onto catalog rooms). |

## Locked architecture

### Persistence: one Postgres, not six databases

**There is one PostgreSQL server and one database.** Hosting and the database name are chosen at implementation. A **module** is a screen (catalog, grid, HQ, …) plus the tables it reads and writes — not its own server.

**Jargon used below:**

- **Table group** — a cluster of related tables inside that one database. Catalog is `buildings` / `floors` / `rooms`. Allocator is `sheets` / `allocations` / …. They can point at each other with foreign keys. This is a naming convenience, not a second database.
- **Seam** — any **copy** from one list to another (CSV, “import this sheet as the day plan,” retyping rooms into a volunteer app). After a copy, the two sides can disagree until you copy again. Catalog → six tools by CSV **is** a seam. It is just a bad one if those tools need the same rooms all semester.

When earlier docs say “the rooms database,” they mean the **catalog tables** (`buildings` / `floors` / `rooms`), not a second Postgres.

```text
One Postgres
  catalog     buildings, floors, rooms, later custom field defs
  allocator   events, draft plans, activities, time blocks, allocations
  identity    staff login (Google *or* staff password — open)
  day plan    frozen copy of one draft + day-of overrides (closed, moved)
  live        timers, clarifications, roster seats  (join rooms.id)
  volunteers  people, applications, assignments     (assignments.room_id)
  maps        floor plates + GeoJSON polygons in JSONB  (optional room_id)
  public      announcements
```

Join key for almost everything that is “about a classroom”: **`rooms.id`** (UUID). Display string `DWIN155` is computed from catalog columns. Do not keep a second copy of Dwinelle 155 in a volunteer list or a map list.

**Not in this Postgres as a product:**

| Thing | Where it lives |
| ----- | -------------- |
| Student registration / scoring | Separate platform. We may **import a CSV** into roster tables here. We do not replicate that product’s DB |
| Figma `.fig` files | Officers’ laptops / Figma. An **importer** writes polygons into map tables here |
| Dwinelle Navigator graph | Kessler’s site. Not year one; would be more tables here if we ever import it |
| Session cookie | Signed cookie on the browser, not a sessions table |
| Clarification images | Not designed. Files or object storage if needed — still not a second Postgres |

**Also not in the plan:** Redis, a rooms microservice, one database per module, PostGIS (maps: JSONB on vanilla Postgres). `live.berkeley.mt` is another **hostname** in front of the same API, not another database.

Indoor maps docs used to say “three stores.” That means three **kinds of row** (geometry, catalog facts, live overlay) in this one database, joined by room id.

**Why not multiple databases?** Alternatives exist; they are worse for this product.

| Split | What it actually is | Cost here |
| ----- | ------------------- | --------- |
| One DB per module (catalog DB, volunteer DB, maps DB, …) | Separate sources of truth | You cannot `FOREIGN KEY` to `rooms.id` across databases. You copy DWIN155 again. That is last semester. |
| Two Postgres **instances** (staff vs public) | Two servers to run, backup, and fail | 50 rooms + 1800 roster rows will not saturate one instance. You still need the rooms list on both sides or public maps lie. |
| Postgres **schemas** (`catalog`, `ops`, `maps` inside `roomalloc`) | Folders of tables, still one database | Fine later for cleanliness. Does not buy isolation or scale. Skip until the table list is annoying. |
| Read **replica** | Same data, extra copy for reads / failover | A hosting option later if `live.berkeley.mt` should survive a primary blip. Still one source of truth. |
| Static **export** (print packet, JSON dump of the day plan) | Paper / file fallback | Already required. This is how you survive the DB dying, not a second database. |

A second database is a seam you have to keep feeding. Use it when a **snapshot** is enough and you do not own the other product.

| Copy | Keep the seam? | Why |
| ---- | -------------- | --- |
| Registration CSV → Saturday roster | **Yes** | Snapshot is enough. We do not rebuild signup/scoring. Morning-of import is the inconvenience we accept. |
| Allocator sheet → frozen day plan | **Yes** (inside this same database) | Saturday should not rewrite the draft grid. Re-import is explicit. |
| Print packet / JSON dump | **Yes** | Postgres may die. Paper is the copy. |
| Catalog CSV → volunteer app, maps app, HQ app, … | **No — share `rooms` instead** | Those tools need the **same** rooms all semester, not a file from last Tuesday. Re-export when someone adds 182 is the inconvenience you named. Last semester that copy went stale. |

Figma → map polygons is a seam we **do** keep (draft in Figma, import geometry). Capacity and “what is in 155 at 10:45” still join `rooms.id` in this database, not a second rooms spreadsheet.

**Why registration stays a separate product** (not “students cannot live in Postgres”). Roster **rows** — name, room, time for that Saturday — **are** in this database after CSV import. What we are not building is the contestant platform: signup, payment, school/team, test choice, scoring. That already exists. A live join would mean owning or syncing that whole product. Volunteers are the opposite: replacing that app is in scope, and its only join to ops is `rooms.id`.

Reliability if Postgres dies: printed plan + offline timers, not “maps still have yesterday’s rooms in another DB.” Isolation of **writes** is table permissions and app rules (day-of never `UPDATE rooms`), not extra servers.

### What may write what

```text
Catalog (buildings, floors, rooms, custom field defs)
  writers: staff-with-write (same login as HQ — see staff auth)
  never: HQ day-of, proctors, public, volunteer check-in

Allocator drafts (grid)
  writers: staff (one person at a time; no live co-edit)
  readers: staff; ops at day-plan import

Day plan (frozen copy of one sheet)
  writers: ops admin import / re-import; ops admin day-plan overrides (room closed, move round)
  never: catalog tables

Live (timers, clarifications, desync, roster seats)
  writers: room session (start timer only); staff-with-write (everything else); roster import + in-app student move
  never: catalog

Volunteers (people, applications, assignments, DNI)
  writers: volunteer account (own person + this-event application); staff-with-write (assignments, DNI, check-in, form)

Public content (announcements)
  writers: live.berkeley.mt admin panel (staff-with-write)
```

Day-of tools **must not** `UPDATE rooms`. “Closed,” “campus pulled,” “moved to 182” are event rows.

## Account structure (officers are also volunteers)

**Locked fact:** day-of, everyone is a volunteer. Internal staff fill the same volunteer form. So an officer is a **Person** (assignment, shirt, check-in) and also someone who opens **ops**. The room laptop is still not a person.

Do **not** invent three named accounts for the same human (volunteer + ops + HQ). HQ is ops. Swire is the laptop.

**Always separate:** `DWIN155` + room password. Never tie that to a Person login.

**Options for the human:**

| | A. Two doors, one Person | B. One login, staff flag | C. Two named accounts, linked | D. Google as the only human login |
| - | ------------------------ | ------------------------ | ----------------------------- | -------------------------------- |
| What exists | `Person` + **staff password** for ops (no staff user row) | `Person` with `can_open_ops` | `Person` **and** a staff `User`, linked by email | One Google; allowlist / flag for ops |
| Officer Saturday | Volunteer site as themselves; ops via 1Password | Sign in once; both hosts if cookie is on the parent domain | Sign in twice, or SSO between them | Sign in with Google; ops rejects non-staff emails |
| ~300 volunteers | Cannot open ops (they don't have the staff secret) | Must not have the flag. Bug = HQ leak | Cannot open ops | Must not be on the allowlist |
| Stolen volunteer password of an officer | Ops still closed (need staff secret) | **Ops opens** | Ops still closed unless the staff account is stolen too | **Ops opens** if that Google is staff |
| “Who paused the timer?” | “someone with the ops password” | The Person | The staff User | The Google |
| Fits earlier staff-password lean | **Yes** | No — ops is the volunteer login | Heavy for ~3 officers who are also Persons | Only if you wanted Google anyway |

**E. Staff password only, officers skip volunteer login** — they fill the form as email-only applications and never use `volunteers.berkeley.mt`. Fights “reuse an account semester to semester” for the people running the event. Skip.

**Recommendation: A.** Named identity lives on **Person** (the volunteer platform), because that is the system everyone including staff actually belongs to. Ops is a **second door** with the shared staff secret — a capability, not a second biography. Officers will have a volunteer account **and** know the ops password. That is two secrets, one human in the database.

Use **B** only if you strongly want one login and accept that an officer’s volunteer password is also the HQ key.

Never **C** unless you pick Google for ops and a different email/password for volunteers on purpose (unusual).

Room stays A-through-D: laptop ≠ Person.

### Four logins (doors, not biographies)

| Who | How they sign in | What they see |
| --- | ---------------- | ------------- |
| **Staff / ops** | Shared **staff password** (option A) *or* Person with staff flag / Google (B/D) | Catalog, allocator, HQ, volunteer **admin**, roster |
| **Volunteer** | Account on **`volunteers.berkeley.mt`**, attached to `Person` | Apply / return / own assignment. Officers have this too |
| **Room** | `DWIN155` + event password | Timer, projection |
| **Guest** | None | `live.berkeley.mt` |

Proctor-as-person (the volunteer assigned to 155) is **not** the same as the room login. They may have a volunteer account; the laptop still uses `DWIN155`. Assignments point at `rooms.id`.

Today the suite uses a **shared password in an environment variable** (all rooms, one secret, change = redeploy). Target: same UX (**one password for every room that event**), stored on the Event/day plan (hashed), **printable** on the backup packet, rotatable by admin **without** a redeploy. Unique per-room PINs are not v1.

### Six UIs, not six products

The six “platforms” are **screens on one product**, not six account databases. Last semester’s breakage came from five separate deploys, not from having too few password types.

| UI | Typical person | How they prove who they are |
| -- | -------------- | --------------------------- |
| Catalog | staff looking up a room | **Same staff login as HQ** (not a catalog-only secret, not the room password) |
| Allocator | person who builds the grid | Same staff login |
| Ops / HQ dashboard | war room | Same staff login |
| Proctor + projector | laptop in DWIN155 | **Room username + shared event password** |
| `live.berkeley.mt` | students, parents, coaches | **None** |
| Volunteer signup / return | volunteer | **Volunteer account** on `volunteers.berkeley.mt`. Managers who assign people use **staff login on ops** |

Room laptops never get the catalog. Guests never get it.

### Staff: Google vs a shared password

This is now nested in [account structure](#account-structure-officers-are-also-volunteers). Option **A** = staff password for ops. **B** = volunteer login opens ops if flagged. **D** = Google for humans. Catalog-only password is still **do not**. Room password is still a different secret.

### Catalog kernel

- Identity: building **code** set at create (read-only after); editable pretty name; display `DWIN155`.
- Built-in numeric: **`capacity` only**.
- **Field definitions** (org-level): name, type (number / text / yes-no). Values per room. “Guts capacity,” “optimal,” “ADA” are examples staff add — not hardcoded.
- Active/inactive is catalog (room truly gone or unused for the org). **“Not using 155 today” is not inactive.**
- Nov 14 halls: Dwinelle **DWIN**, Wheeler **WHLR**, VLSB **VLSB**, Martin Luther King Jr. Building **MLK**. **No GPBB.**
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

HQ admin can pause/add time on any room from the ops dashboard. Add-time increments: include 1 and 5 minutes and “set end to clock time”; exact controls can wait for a prototype (question 47).

Clarification composer (admin): pick target set (activity, building, floor, multi-select, “all with running timer”) → send. One-way. No ack. Algebra does not learn that Geometry got a message.

### Roster

- Import CSV **morning-of**, shortly after check-in.
- Column **mapper** (we do not know headers yet).
- Match room via building code mapping + room name; unmatched rows go to a review queue.
- Two tests → two rows → two `(student, room, time)` seats.
- **Move in-app** (wrong room) updates the event roster only.
- Students are **not** volunteer `Person`s. The registration **product** stays separate; this app only holds the imported roster slice.

### Volunteers (shape only)

- Host: **`volunteers.berkeley.mt`** for the people; staff **admin** on ops.
- Returning volunteers **reuse an account** (login mechanism TBD). First-time apply can be logged out on that same host.
- Form **builder** (admin on ops), not a hardcoded Google Form clone.
- Roles **customizable**.
- **Shifts** exist (schema: assignment has a time window); UI details later.
- Default proctor count from a **capacity heuristic**, override per room.
- Check-in: **name search** (staff on ops). Volunteer seeing their own room is on the volunteer host.
- **Do not invite** list.
- ~300 volunteers. Shirt/dietary/etc stored; visible to managers; field list later.

### Public (`live.berkeley.mt`)

- Announcements: admin panel, English.
- **No** public countdown (room clocks differ).
- Indoor maps when Figma is imported; outdoor later.
- What a guest sees **per room**: still **undecided** — spec the payload with a flag `publicRoomDetail: none | activityLabel`.

### Reliability

Because last semester’s tools died:

- One API, one database, hosts `ops.berkeley.mt` + `volunteers.berkeley.mt` + `swire.berkeley.mt` + `live.berkeley.mt`.
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
| Day-plan **move room** UI | Workaround: re-import a fixed draft (clocks kept) |
| Roster CSV headers | Mapper; import still works |
| HQ list columns / red meaning | Can ship list+map with a minimal column set |
| Public per-room detail | Flag |
| Outdoor maps | Stretch |
| Staff login: Google vs one staff password | Catalog Q5; organizer view-only |
| Shift editor, form fields, 73–79 artifacts | Volunteer/catalog content, not kernel |
| Projection vs operator as one URL or two | Same session either way |

## Next specs to write (workshop; no application code yet)

Parent: [greenfield integrated system](2026-08-24-integrated-system.md). Do not check the prototype for columns.

1. **Catalog** (in progress): [2026-08-24-catalog.md](2026-08-24-catalog.md) — custom fields, code mappings, `appears_on_grid`  
2. Allocator + bulk floor assign + import-to-ops  
3. Day plan + live overlay + HQ list/map + print backup  
4. Proctor/projection + clarifications + event room-password  
5. Roster import + in-app move  
6. Volunteers (form builder, roles, check-in)  
7. `live.berkeley.mt` announcements + maps  

Slightly off details get corrected in these write-ups, not by reopening the kernel.