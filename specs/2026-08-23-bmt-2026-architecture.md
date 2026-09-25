# BMT 2026 architecture (after round 2)

**Status**: Draft — workshop locks. **Target parent:** [greenfield integrated system](2026-08-24-integrated-system.md). The allocator prototype in this repo is not a constraint.

Parent notes: [ops platform](2026-08-22-ops-platform.md). Indoor maps: [2026-08-21-indoor-maps.md](2026-08-21-indoor-maps.md). First event: **BMT 2026, Saturday 2026-11-14**. Design load: ~1800 contestants, ~50+ testing rooms, ~300 volunteers.

## Are we ready to spec details?

**Yes, for architecture.** Round 2 is enough to lock write-boundaries, login kinds, contest shape, and how the six modules share `rooms.id`. We should write per-module specs next (screens, APIs, failure modes) **without** waiting for spreadsheet dumps (73–79). Design as if there is no existing app.

**Not yet ready to freeze visual details** (HQ columns, map colors, volunteer form fields, shift UI). Those can be marked “TBD in module spec” and designed against the same data model.

**Must-ship roomsdb, planner, HQ, volunteers, and live on Nov 14** plus printed backup is tight. Those stay **one deploy**. **Swire is the deliberate second deploy** (proctor suite only) so a timer outage does not take maps down.

## Four questions that were easy to misread

| # | You heard | What it actually asked | What we will assume unless you object |
| - | --------- | ---------------------- | ------------------------------------- |
| 14 | Unclear | Can **two people edit the same allocator grid** at once before the event? | **Decided: no live co-edit.** One person builds the sheet; ops admin imports it. Organizers view the day plan. |
| 21 | “Is a spreadsheet import required?” | “What **columns** are on the capacity sheet?” | **Manual roomsdb entry is fine.** Built-in `capacity` + **user-created fields** cover unknown columns. |
| 27 | “Paper??” | If Algebra must **move from 155 to 182 during Saturday**, how does software record that **without** editing the roomsdb? | **Day-plan override in ops** (not roomsdb, not “print a sticky and hope”). Details of that UI are still open. |
| 31 | “??” | What **headers** does the registration CSV actually have? | **Unknown.** Spec a **column mapper** at import time (map “Room” / “Location” / … onto roomsdb rooms). |

## Locked architecture

### Persistence: one Postgres, not six databases

**There is one PostgreSQL server and one database.** Hosting and the database name are chosen at implementation. A **module** is a screen (roomsdb, grid, HQ, …) plus the tables it reads and writes — not its own server.

**Jargon used below:**

- **Table group** — a cluster of related tables inside that one database. Roomsdb is `buildings` / `floors` / `rooms`. Allocator is `sheets` / `allocations` / …. They can point at each other with foreign keys. This is a naming convenience, not a second database.
- **Seam** — any **copy** from one list to another (CSV, “import this sheet as the day plan,” retyping rooms into a volunteer app). After a copy, the two sides can disagree until you copy again. Roomsdb → six tools by CSV **is** a seam. It is just a bad one if those tools need the same rooms all semester.

When earlier docs say “the rooms database,” they mean the **roomsdb** tables (`buildings` / `floors` / `rooms`), not a second Postgres.

```text
One Postgres
  roomsdb     buildings, floors, rooms, later custom field defs
  allocator   events, draft plans, activities, time blocks, allocations
  identity    Google → people.id; can_open_ops for ops
  day plan    frozen copy of one draft + day-of overrides (closed, moved)
  live        timers, clarifications, roster seats  (join rooms.id)
  volunteers  people, applications, assignments     (assignments.room_id)
  maps        floor plates + GeoJSON polygons in JSONB  (optional room_id)
  public      announcements
```

Join key for almost everything that is “about a classroom”: **`rooms.id`** (UUID). Display string `DWIN155` is computed from roomsdb columns. Do not keep a second copy of Dwinelle 155 in a volunteer list or a map list.

**Not in this Postgres as a product:**

| Thing | Where it lives |
| ----- | -------------- |
| Student registration / scoring | Separate platform. We may **import a CSV** into roster tables here. We do not replicate that product’s DB |
| Figma `.fig` files | Officers’ laptops / Figma. An **importer** writes polygons into map tables here |
| Dwinelle Navigator graph | Kessler’s site. Not year one; would be more tables here if we ever import it |
| Session cookie | Signed cookie on the browser, not a sessions table |
| Clarification images | Not designed. Files or object storage if needed — still not a second Postgres |

**Also not in the plan:** Redis, a rooms microservice, one database per module, PostGIS (maps: JSONB on vanilla Postgres). `live.berkeley.mt` is another **hostname** in front of the same API, not another database.

Indoor maps docs used to say “three stores.” That means three **kinds of row** (geometry, roomsdb facts, live overlay) in this one database, joined by room id.

**Why not multiple databases?** Alternatives exist; they are worse for this product.

| Split | What it actually is | Cost here |
| ----- | ------------------- | --------- |
| One DB per module (roomsdb DB, volunteer DB, maps DB, …) | Separate sources of truth | You cannot `FOREIGN KEY` to `rooms.id` across databases. You copy DWIN155 again. That is last semester. |
| Two Postgres **instances** (staff vs public) | Two servers to run, backup, and fail | 50 rooms + 1800 roster rows will not saturate one instance. You still need the rooms list on both sides or public maps lie. |
| Postgres **schemas** (`roomsdb`, `ops`, `maps` inside `roomalloc`) | Folders of tables, still one database | Fine later for cleanliness. Does not buy isolation or scale. Skip until the table list is annoying. |
| Read **replica** | Same data, extra copy for reads / failover | A hosting option later if `live.berkeley.mt` should survive a primary blip. Still one source of truth. |
| Static **export** (print packet, JSON dump of the day plan) | Paper / file fallback | Already required. This is how you survive the DB dying, not a second database. |

A second database is a seam you have to keep feeding. Use it when a **snapshot** is enough and you do not own the other product.

| Copy | Keep the seam? | Why |
| ---- | -------------- | --- |
| Registration CSV → Saturday roster | **Yes** | Snapshot is enough. We do not rebuild signup/scoring. Morning-of import is the inconvenience we accept. |
| Allocator sheet → frozen day plan | **Yes** (inside this same database) | Saturday should not rewrite the draft grid. Re-import is explicit. |
| Print packet / JSON dump | **Yes** | Postgres may die. Paper is the copy. |
| Roomsdb CSV → volunteer app, maps app, HQ app, … | **No — share `rooms` instead** | Those tools need the **same** rooms all semester, not a file from last Tuesday. Re-export when someone adds 182 is the inconvenience you named. Last semester that copy went stale. |

Figma → map polygons is a seam we **do** keep (draft in Figma, import geometry). Capacity and “what is in 155 at 10:45” still join `rooms.id` in this database, not a second rooms spreadsheet.

**Why registration stays a separate product** (not “students cannot live in Postgres”). Roster **rows** — name, room, time for that Saturday — **are** in this database after CSV import. What we are not building is the contestant platform: signup, payment, school/team, test choice, scoring. That already exists. A live join would mean owning or syncing that whole product. Volunteers are the opposite: replacing that app is in scope, and its only join to ops is `rooms.id`.

Reliability if Postgres dies: printed plan + offline timers, not “maps still have yesterday’s rooms in another DB.” Isolation of **writes** is table permissions and app rules (day-of never `UPDATE rooms`), not extra servers.

### What may write what

```text
Roomsdb (buildings, floors, rooms, custom field defs)
  writers: staff-with-write (same login as HQ — see staff auth)
  never: HQ day-of, Swire, public, volunteer check-in

Allocator drafts (grid)
  writers: staff (one person at a time; no live co-edit)
  readers: staff; ops at day-plan import

Day plan (frozen copy of one sheet)
  writers: ops admin import / re-import; ops admin day-plan overrides (room closed, move round)
  never: roomsdb tables

This database does not store timers or clarifications.
  Swire owns those. HQ may only read Swire’s API. Roster seats stay here (CSV import + in-app move).

Volunteers (people, applications, assignments, DNI)
  writers: volunteer account (own person + this-event application); staff-with-write (assignments, DNI, check-in, form)

Public content (announcements)
  writers: staff-with-write on **`live.berkeley.mt/admin`**
  never: guests, room sessions, volunteer self-service, HQ roster tools
```

Day-of tools **must not** `UPDATE rooms`. “Closed,” “campus pulled,” “moved to 182” are event rows.

## One person, one id

You want **one unique id** for a human, including officers who fill the volunteer form, and you want that tied to ops. That is possible. It is also the right design.

Three different things (easy to smash together):

| Thing | What it is | Example |
| ----- | ---------- | ------- |
| **Person id** | The human in Postgres (`people.id`) | One row: Jordan, email, shirt, DNI, assignments across semesters |
| **Login** | How the browser proves it is that Person | **Google** (locked). Same Google on volunteers and ops |
| **Door** | A hostname that login may or may not open | `volunteers.berkeley.mt` (everyone with a Person). `ops.berkeley.mt` and `roomsdb.berkeley.mt` (only if that Person is staff). `swire.berkeley.mt` (**not** a Person — room name) |

**Locked:** one `people.id` per human. Officer fills the volunteer form → **same** row they use on ops. Match on the **Google email** (or they are already signed in, so the form *is* them).

**Locked: all Person accounts are Google.** Continue with Google on `volunteers.berkeley.mt`, `ops.berkeley.mt`, and `roomsdb.berkeley.mt`. A Person may open ops or roomsdb only if flagged staff (`can_open_ops` or equivalent). Ordinary volunteers bounce off those hosts to `volunteers.berkeley.mt`. One Google sign-in covers those three hosts by setting **host-scoped** Person cookies together at OAuth — not a cookie on all of `berkeley.mt`.

**Still not Google, not a Person:** Swire (`DWIN155` + event password). **`live.berkeley.mt`:** no login.

**Reasonable because:** officers and most Berkeley-adjacent volunteers already have Google (including `@berkeley.edu`). One id, one button, no volunteer password reset, kick one human by removing staff flag / that Google. **Cost:** you cannot volunteer without a Google account. Google OAuth must be **published** (Testing mode caps ~100 users — not enough for ~300 volunteers). Stolen staff Google opens HQ — same as any one-login design.

**Rejected for this design pass:** extra ops password, second staff User table, email/password volunteer accounts, Microsoft (or any other issuer) as Person login, Google on projectors. A volunteer **form field** may still store a non-Gmail contact address; that is not a login. Identity is Google only until we reopen it on purpose.

### Where today’s volunteer-admin screens go

Today’s volunteer app has three officer views. They are **queries on the same tables**, not a second volunteer list. Put each view where Saturday vs year-round lives.

| Today | Job | Where in the new product |
| ----- | --- | ------------------------ |
| Table of all volunteers | Year-round people: applications, dropouts, DNI, form | **`volunteers.berkeley.mt/admin`**. Not the HQ page. Same API. Officers with `can_open_ops`. |
| Check-in | Saturday: mark arrived; then they (and HQ) see assignment | **Ops HQ tab** (war room). Volunteer site can **show** “you’re checked in, you’re in DWIN155” after that — not a second check-in database. |
| Per-building proctor tables | Saturday: who is in which classroom | **HQ shows the list.** Assigning still happens on `volunteers.berkeley.mt/admin`. One `assignments` table. |

So: **both hosts, one data.** Do not copy the volunteer table into HQ. HQ is another screen on `people` / `applications` / `assignments`. Swire admin (timers) stays a **redirect to ops**, not a third volunteer list.

Self-service on `volunteers.berkeley.mt` (no admin): sign up, edit own info, after check-in see own room. Officers use that too, as themselves.

## Account structure (locked: Google for people)

**Locked:** Google is the only Person login. One `people.id` per Google. Staff = that Person plus `can_open_ops`. Room password and live stay as they were.

A/B/C (staff password, email/password, second User table) are **out**. The old comparison table is history.

### Four logins (doors, not biographies)

| Who | How they sign in | What they see |
| --- | ---------------- | ------------- |
| **Staff / ops** | **Google**, Person has `can_open_ops` | Roomsdb, allocator, HQ, volunteer **admin** (on the volunteers host), live `/admin`, roster |
| **Volunteer** | **Google**, same Person on **`volunteers.berkeley.mt`** | Apply / edit self / see own assignment after check-in. Officers: same Person |
| **Guest** | None | `live.berkeley.mt` (announcements, maps) |
| **Room (Swire, not this API)** | `DWIN155` + event password on **`swire.berkeley.mt`** | Timer, projection |

Proctor-as-person (the volunteer assigned to 155) is **not** the same as the room login. They may have a volunteer account; the laptop still uses `DWIN155`. Assignments point at `rooms.id`.

Today Swire uses a **shared password in an environment variable** (all rooms, one secret, change = redeploy). Target, **on Swire**: same UX (**one password for every room that event**), printable on the backup packet, rotatable **without** a redeploy of this platform. Unique per-room PINs are not v1. This API does not store that secret.

### Auth by screen

Screens on **this** platform are not separate logins. There are **two ways to prove who you are here**:

| Proof | Cookie | Who |
| ----- | ------ | --- |
| **Google** → `people.id` | **Person** cookie (HTTP-only, `Secure`, `SameSite`). Set on **`ops`**, **`roomsdb`**, and **`volunteers` only** (host-scoped, issued together at OAuth). **Not** sent to Swire or live. | Every human on **this** platform |
| **Nothing** | None | Guests on `live.berkeley.mt` |

**Room login is not a cookie here.** `DWIN155` + one event password is Swire’s session, on Swire’s host. This API does not accept it.

Staff vs volunteer is **not** a second Google button. It is `can_open_ops` on that Person. For this design pass, `can_open_ops` is also write (roomsdb, drafts, HQ, volunteer admin, roster, announcements). Organizer view-only is later.

A Person cookie **must not** open a Swire room. Swire’s room session **must not** be accepted as staff on this API. Live guest pages **must not** grow officer menus. **`live.berkeley.mt/admin`** is a typed URL, not a button on the public site.

**Locked (live publish):** staff compose announcements on **`live.berkeley.mt/admin`** (Google + `can_open_ops`). That panel writes `/api/v1/live/` public content only. It does not open HQ, roomsdb, or volunteer admin. The session cookie is **`Path=/admin`** so a script on the guest pages does not receive it. Guests never see a sign-in button.

| # | Screen | Host (bookmark) | Sign-in | Who may use it | What this login may do | Must not |
| - | ------ | --------------- | ------- | -------------- | ---------------------- | -------- |
| 1 | **Roomsdb** | **`roomsdb.berkeley.mt`** | Google + `can_open_ops` | Officers | Create/edit buildings, floors, rooms, custom fields | Day-of “closed” as a roomsdb edit. Room laptops. Guests. Ordinary volunteers. Planner/HQ **tabs** |
| 2 | **Allocator** | **`ops.berkeley.mt/planner`** | Same Google | Officers | Build one draft at a time; bulk-assign floors | Live co-edit. Import-as-day-plan is an HQ action (same people, **different link**). Roomsdb tabs. Guests / rooms / volunteers |
| 3 | **Day-of HQ** | **`ops.berkeley.mt`** (root) | Same Google | Officers in the war room | Import/re-import day plan; list + map **view**; roster import + move. **Read** rooms, maps, assignments, and Swire | Writes to roomsdb, maps, volunteers, live, or Swire. Volunteer self-service. Roomsdb in war-room chrome |
| 4 | **Proctor / projector** | **`swire.berkeley.mt` (external)** | Room username + **one** event password, **on Swire** | Laptop in the room | **Watch** that room’s timer and clarifications. Projector: timer + clarifications only | **Any write** (start, pause, add time, clarifications). This platform’s Google. Other rooms. Writing roomsdb. HQ chrome |
| 5 | **Public** | **`live.berkeley.mt`** | None on `/`. **`/admin`**: Google + `can_open_ops`, cookie `Path=/admin` | Students, parents, coaches on `/`. Officers who type `/admin` | Guests: read announcements and **maps**. Admins: edit public content (announcements) | Guest login button. Public countdown. Volunteer apply. Officer menus on `/`. HQ, roomsdb, or volunteer admin inside `/admin`. Calling Swire |
| 6 | **Volunteers** (self-service) | **`volunteers.berkeley.mt`** | Google → same `people.id` | Returning and first-time volunteers | Apply / edit **own** person + this-event application. After check-in, see **own** assignment | Ops HQ, roomsdb, other people’s rows, room password |
| 6a | **Volunteer admin** | **`volunteers.berkeley.mt/admin`** | Google + `can_open_ops` | Officers | Assign, DNI, name-search check-in, form builder | Doing those edits on the HQ page |

**Volunteer admin is not a seventh login.** It is `volunteers.berkeley.mt/admin` for people who already have `can_open_ops`. Same tables as screen 6. The HQ page only reads them.

**OAuth:** one **published** Google client (Testing-mode user cap is too small for ~300 volunteers). Authorized origins include ops, roomsdb, volunteers, and **`live.berkeley.mt` for `/admin` only**. First visit: Continue with Google, then the form. Return visit: same Google → same `people.id`.

**Bounce:** a Person **without** `can_open_ops` who opens `ops.berkeley.mt` or `roomsdb.berkeley.mt` does not see those tools. Send them to `volunteers.berkeley.mt`. Stolen staff Google still opens HQ and roomsdb — accepted.

**Saturday mix-up (locked):** the human assigned to proctor 155 may be signed into Google on their phone (screen 6). The HDMI laptop still uses the **room** login (screen 4). Those are not interchangeable.

**Cookie hygiene:** Person cookies must not use `Domain=.berkeley.mt`. That would send a staff or volunteer session to every host. The live admin cookie is **`Path=/admin`** on `live.berkeley.mt` only, so `/` does not receive it. Swire does not receive a Person cookie. Proctors sign in on Swire.

### Hosts are public; isolation is the API

Assume every hostname is known. Certificate logs, DNS, and guessing `ops.` / `swire.` / `roomsdb.` will find them. **`live.berkeley.mt` is supposed to be public.** Hiding the others is not a control.

Google OAuth for Person login is the strong door on **this** platform. The weak door is **Swire’s**, on their deploy: room usernames are public (`DWIN155` is on the door), and v1 uses **one shared event password**. Finding `swire.berkeley.mt` must not open HQ — this API does not accept a room session. A stolen room password opens that Saturday’s projector/operator view on Swire only. Treat the event password like the print packet: rotate it, do not reuse a club default, do not put it on live.

One API and one Postgres mean **one outage takes roomsdb, ops, volunteers, and live down together** (paper backup). **Swire is the exception:** its process and database are separate so a proctor-suite failure leaves maps and HQ up, and an HQ/API failure leaves timers up. It does **not** mean one stolen Swire password is HQ, or one volunteer Google is roomsdb.

| If this is wrong | Blast |
| ---------------- | ----- |
| Person cookie on `.berkeley.mt` | XSS or a bad script on **live** can ride a staff session. Do not do this. |
| Room session accepted as staff on this API | Shared room password becomes HQ. Do not do this. Swire calls only the public room GET. |
| Live public JSON includes roster names / HQ fields | Guests see Saturday internals. Public routes stay public-shaped even if someone is signed in elsewhere. |
| Any route skips the cookie check (“same API, trust the SPA”) | One missed check is the whole database. Last semester’s six sites failed this in six places; we have **one** place that must not. |

**Locked:** hostnames are not secrets. Person cookies are host-scoped to ops / roomsdb / volunteers. Live sends no session. Swire is a **different system** with its own room session. This API enforces write-boundaries (`rooms` never from day-of or from Swire). Stolen staff Google still opens HQ — accepted. Stolen room password opens Swire, not ops.

### Staff links by cadence

**Name:** the kernel is **roomsdb** — host **`roomsdb.berkeley.mt`**, same word in specs. Swire is the external proctor laptop. Roomsdb is the room *list* on this platform.

Rare vs regular vs Saturday are **different bookmarks**, not tabs on one officer page. Same Google, same API, still one deploy. The rooms list is sacred and infrequent, so it is farther from Saturday than the planner is.

| Cadence | Bookmark | Chrome on that link |
| ------- | -------- | ------------------- |
| **Rare** (start of semester, or when a room actually changes) | **`roomsdb.berkeley.mt`** | Roomsdb only. No HQ tab bar. No planner grid. A text link to the planner is fine. |
| **Regular** (weeks of building the grid) | **`ops.berkeley.mt/planner`** | Allocator only. A link to HQ (import lives there) is fine. **No Roomsdb tab.** |
| **Saturday** | **`ops.berkeley.mt`** (root) | HQ war room. **No Roomsdb** in that chrome. |

Why roomsdb gets its own host: stuffing roomsdb on ops as “another path” is how it becomes a tab you open by accident while planning or on Saturday. Why the planner stays on ops: the next step is **import** on HQ; it is still a **different URL** than Saturday root. We are not inventing `hq.berkeley.mt`. Same tables, same API.

Do not put roomsdb behind the planner’s primary chrome, or the planner behind HQ’s Saturday tabs.

### Staff vs volunteer (same Google)

Ops and volunteers share **Google**. Staff is a flag on `Person`, not a second password. Roomsdb-only password is still **do not**. Room password is still a different secret.

### Roomsdb kernel

- Identity: building **code** set at create (read-only after); editable pretty name; display `DWIN155`.
- Built-in numeric: **`capacity` only**.
- **Field definitions** (org-level): name, type (number / text / yes-no). Values per room. “Guts capacity,” “optimal,” “ADA” are examples staff add — not hardcoded.
- Active/inactive is roomsdb (room truly gone or unused for the org). **“Not using 155 today” is not inactive.**
- Nov 14 halls: Dwinelle **DWIN**, Wheeler **WHLR**, VLSB **VLSB**, Martin Luther King Jr. Building **MLK**. **No GPBB.**
- **Spaces** (food, merch, not a classroom): **v1 does not need a new type.** See [Spaces later](#spaces-food--merch--difficulty-of-adding-later) for how to keep the door open.

### Contest model (grid)

Rounds a student takes: **Power**, **Individual**, **Guts**.

Individual: **two focus tests out of four**, or **one general**.

**Grid rule (locked):** one room × one time slot = **one activity**. No split rooms.

**Awareness of focus vs general (locked):**

- Activities on the sheet are the units HQ and clarifications target: e.g. `Power`, `Guts`, `General`, `Algebra`, `Geometry`, … (exact labels TBD).
- An **activity group** `Individual` wraps General + the four focus activities so HQ can still say “all Individual rooms.”
- **Student choice** (2 focus vs general) is a fact about the student, not about the room. When an Individual roster exists, two focus tests are two rows. A room still runs one activity. An Individual room is allowed to have **no roster**.
- Timers do **not** special-case Individual. A room is testing or it is not.

### Day plan import

1. Planner builds a sheet in the allocator (rebuild in-app; bulk assign “all of Dwinelle D …” is in scope).
2. Ops **admin** picks that sheet → **Import as today’s plan** (frozen copy of activities + allocations + included rooms).
3. Re-import replaces allocations that have not started; **running clocks stay**.
4. Day-plan **overrides** (close room, move Algebra 155→182) write override rows, never roomsdb.

Printed backup: PDF/CSV of the imported plan + room PINs + volunteer assignments, regenerable after import. This is a **product feature**, not an afterthought.

### Live overlay

Per testing room, **on Swire** (not in this database):

- Clock: `starts_at`, `ends_at`, `paused`, `source` (server | local-desync)
- Clarification feed for that room

**On this platform:** roster lines currently seated (names), closed / unused-today flag, day plan, maps.

HQ dashboard: **list ↔ map toggle**. Timer columns are a **read** of Swire’s API when it answers. HQ does not write clocks or clarifications. Column set, red rules, filters: later.

### Proctor suite + projection (Swire, external)

**Not this API.** Swire is a separate deploy. **Swire admins are the only writers.** Proctors cannot modify anything.

- **Projection** (HDMI): large timer + clarifications (text/images). No roster names, no HQ notes.
- **Proctor** (room login): the same view. No start, pause, or add-time control.

5-minute remaining banner on both.

**Exposed API is read-only.** Other platforms poll it for timer progress and other Swire data. HQ paints that onto the list and map. If Swire is down, HQ still shows the day plan, map, roster, and volunteers; the timer panel says unavailable. If this platform is down, Swire admins and proctors still use Swire.

Clarifications are one-way, sent by Swire admins. No ack. Algebra does not learn that Geometry got a message. This platform does not compose them.

Live does **not** call Swire. Maps stay on this platform.

### Roster

A per-room student roster is **optional**. HQ and any room view must work when that room has no names.

| Round | Roster? |
| ----- | ------- |
| **Power** | Yes. Teams are assigned to a power room. |
| **Guts** | Yes. Teams are assigned to a guts room. |
| **Middle school** (every other semester) | Yes. A team is assigned to one room and stays there all day. |
| **Individual** (BMT) | **Not decided.** Students pick the general test or 2 of 4 subject tests. Coaches do the final check-in, and not every student finalizes that choice. Last event: 30 mismatches out of 1300 students (2.3%). The org has not decided whether to assign those students to rooms at check-in. The software must allow an Individual room with no roster. |

When a roster does exist, it is a snapshot from the registration product (CSV, column mapper, match room by code + name). Students are not volunteer people. Moving a student updates this snapshot only. Two focus tests, if both are known, are two rows.

### Volunteers (shape only)

- Host: **`volunteers.berkeley.mt`**. Staff **admin** is **`/admin` on that host**, not the HQ page.
- Returning volunteers **reuse Google** → same `people.id`. First-time: Continue with Google, then the form.
- Form **builder** on the volunteer admin, not a hardcoded Google Form clone.
- Roles **customizable**.
- **Shifts** exist (schema: assignment has a time window); UI details later.
- Default proctor count from a **capacity heuristic**, override per room.
- Check-in: **name search** on `volunteers.berkeley.mt/admin`. Volunteer seeing their own room is on the same host. HQ reads the result.
- **Do not invite** list.
- ~300 volunteers. Shirt/dietary/etc stored; visible to managers; field list later.

### Public (`live.berkeley.mt`)

- Announcements: staff compose on **`live.berkeley.mt/admin`**. English. Not on ops.
- **No** public countdown (room clocks differ).
- Indoor maps when Figma is imported; outdoor later.
- What a guest sees **per room**: still **undecided** — spec the payload with a flag `publicRoomDetail: none | activityLabel`.

### Reliability

Because last semester’s tools died:

- One API, one database, hosts `roomsdb.berkeley.mt` + `ops.berkeley.mt` + `volunteers.berkeley.mt` + `live.berkeley.mt`.
- **Swire is a second deploy** (`swire.berkeley.mt`) with its own API. Proctor outage ≠ this platform down. This platform down ≠ timers down.
- **Live stays on this API** so maps share roomsdb.
- Printed plan / shared room-password / assignment packet after import.
- Offline timer (on Swire) with explicit desync, not silent drift.

## Spaces (food / merch) — difficulty of adding later

v1: if pickup is **in a named room**, it is a roomsdb **room**. If it is a table in a hallway or Ishi Court, it is **not** on the grid. Maps can still draw unlabeled plates from Figma with **no** `room_id`.

**Cheap hedge now (recommended):** one boolean on `rooms`, e.g. `appears_on_grid` (default true). HQ, merch-in-a-classroom, and “dummy” locations can exist in roomsdb for volunteers/maps/public **without** becoming allocator columns. Cost: one column + a filter on the sheet picker. This is the difference between “we stuffed food into DWIN155” and “Food pickup is a roomsdb row that the grid ignores.”

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

**Workshop ask:** confirm `appears_on_grid` (or equivalent `kind`: classroom | ops | other) on roomsdb spec. Default true. Food/merch in a hallway can wait until someone is willing to put a roomsdb row (grid-false, no capacity required) or a Figma POI only.

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
| Organizer view-only | Optional later: Person without write flags |
| Shift editor, form fields, 73–79 artifacts | Volunteer/roomsdb content, not kernel |
| Projection vs operator as one URL or two | Same session either way |

## Next specs to write (workshop; no application code yet)

Parent: [greenfield integrated system](2026-08-24-integrated-system.md). Do not check the prototype for columns.

1. **Roomsdb** (in progress): [2026-08-24-roomsdb.md](2026-08-24-roomsdb.md) — custom fields, code mappings, `appears_on_grid`  
2. Allocator + bulk floor assign + import-to-ops  
3. Day plan + live overlay + HQ list/map + print backup  
4. Proctor/projection + clarifications + event room-password  
5. Roster import + in-app move  
6. Volunteers (form builder, roles, check-in)  
7. `live.berkeley.mt` announcements + maps  

Slightly off details get corrected in these write-ups, not by reopening the kernel.