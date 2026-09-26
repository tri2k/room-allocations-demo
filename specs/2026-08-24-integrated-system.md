# BMT ops platform (greenfield)

**Status**: Target design. This file is the parent for the integrated system. Workshop locks from [round 2](2026-08-23-bmt-2026-architecture.md) still apply. **The allocator prototype in this git repo is not a constraint** — ignore its tables, routes, Google login, and folder layout when designing.

Indoor maps (Figma import, Leaflet): [2026-08-21-indoor-maps.md](2026-08-21-indoor-maps.md). Roomsdb workshop: [2026-08-24-roomsdb.md](2026-08-24-roomsdb.md). Older “ops platform” / Phase 1–2 notes are history, not the build contract.

First event the product must run: **BMT 2026, Saturday 2026-11-14**. Design load: ~1800 contestants, ~50+ testing rooms, ~300 volunteers. Same org then runs semesterly contests (BmMT, …).

## Ground-up

We are designing **one product** that replaces the spreadsheet pile and last semester’s separate tools. We are not extending the drag-and-drop demo until it grows volunteers.

At implementation we may rewrite this repo or start a new tree. Specs describe the product. They do not have to match `server/app/models.py`.

**Thrown away as design input** (they exist only because the prototype did):

- Google OAuth “because Phase 2a shipped”
- Owner-only sheets and “non-owner gets 404”
- Hash routes (`#/catalog`), Vite proxy, FastAPI, Alembic, `roomalloc` as the database name
- Hardcoded `room_type` / `optimal_capacity` columns
- Multi-org marketplace (Phase 2c)
- As-built C4 as a picture of the target
- “Today’s room password is an env var” as the product (the *idea* of one shared room secret stays)

**Kept because we decided them in workshop**, not because code did:

- One Postgres, one database. **This** platform: roomsdb, planner, HQ, volunteers, live, and **maps**. They share `rooms.id`.
- **One API** for that platform. Bookmarks: **`roomsdb.berkeley.mt`**, **`ops.berkeley.mt/planner`**, **`ops.berkeley.mt`**, **`volunteers.berkeley.mt`**, **`live.berkeley.mt`**.
- **Maps are not settled.** Geometry must not be copied into a second rooms list, but whether maps are year-round like roomsdb or per event, and how the Figma files get in, is open.
- **Swire is not this software.** It is built independently, with its own admin login and its own proctor login. **Only Swire admins write.** Proctors cannot. It exposes a **public read-only API** so HQ and any other tool can see test progress in rooms. If Swire dies, this platform stays up. If this platform dies, Swire still runs.
- Roomsdb is sacred: day-of never updates rooms. Swire does not write rooms either.
- Draft grid → explicit import as frozen day plan. Clocks live on Swire. This platform never writes them, so re-import cannot reset them.
- No live co-edit on the grid
- Room login (`{building code}{room name}` + one event password) is **Swire’s**, not a cookie on this API
- **Volunteers use OAuth.** That platform only, for now: signup, own profile, and the volunteers admin (check-in, assign). **Live `/admin` is one shared admin account**, not OAuth and not a volunteer login. HQ, the planner, and roomsdb are **not** decided. Swire does not use this auth. Older “Google + `can_open_ops`” lines below are a sketch, not a lock.
- Roster is a snapshot from the registration product. **Event setup** lists rounds; each round has a checkbox for whether it has student rosters. Students are not volunteer people.
- Custom room fields; built-in `capacity` only (≥ 0)
- Building codes DWIN, WHLR, VLSB, MLK; code set at create
- `appears_on_grid` hedge; skip a Location supertype
- Print backup as already locked. Timer / clarification / projector **behavior** stays as locked; **where it runs** is Swire, not this API.

**Stack at build time is still open.** Language and UI library are not part of this design. Hosts below are the bookmarks we have been using. **`swire.berkeley.mt` is someone else’s deploy.**

## What each part is

These are the jobs. Admin pages are where that part is changed. The HQ page does not change the others.

| Part | What it is | Writes happen |
| ---- | ---------- | ------------- |
| **Swire** | Standalone. Not this software. Own admin login and own proctor login. Proctors do not modify it. | Swire admins. **Public read-only API** for timer progress and other Swire data, for HQ situational awareness and for any other tool that needs test progress in rooms |
| **Live** | Public site for guests: parents, coaches, students. | **`live.berkeley.mt/admin`**, one shared admin account |
| **Volunteers** | Two jobs. (1) People sign up and update their own info in one portal, tracked across semesters. (2) Day-of reference (a table of volunteers) and the check-in flow: note arrival and assign a task. | Volunteers edit themselves. Staff edits happen on the volunteers admin, not on HQ |
| **Roomsdb** | Rarely edited. An in-house copy of the Berkeley rooms database, plus any other rooms we want to use. Day-of does not edit it. | `roomsdb.berkeley.mt` |
| **Rooms allocation planner** | In the weeks before the tournament: which events are assigned to which rooms. One writer at a time. | `ops.berkeley.mt/planner` |
| **HQ** | A visual dashboard of event progress. Plans imported from the planner, with Swire’s current state shown on top. | The import of the plan onto the dashboard. Not rooms, not volunteers, not live, not Swire |

## One event id, not one toggle

Two different ideas got mixed together.

**A cross-site toggle does not make sense.** Live admin, Swire, and volunteers do not share a login. They are different subdomains. Picking “BMT 2026” on live does not, and should not, change what HQ or Swire is showing. There is no button that saves one form onto every platform.

**One event id in this database does make sense.** Planner, HQ, volunteers, and live all store their own rows (the grid, the imported plan, signups, announcements, past configs) with the same `event_id`. After its own login, each admin has its own event list. That list is the same contests, because it is the same table. Choosing BMT 2026 on the volunteers host only changes what the volunteers host shows.

Past data stays on the platform that owns it, keyed by that id. Next year is a new row, BMT 2027. “What did volunteers look like for BMT 2026?” and “what did live announce?” are two queries on one id, not two names a human has to match.

Roomsdb has no event id. Rooms outlive the contest.

Swire does not share the row. It is another database and another login. If Swire keeps past contests, it can store this id as a label so the histories line up. If it does not, HQ still polls “whatever Swire says is running.” A shared id is a convenience for Swire, not a foreign key.

Event-wide facts (name, day, round list, each round’s roster checkbox) are edited in **one** place. The other admins on this platform read them. They still edit their own data.

| Approach | What you get | What it costs |
| -------- | ------------ | ------------- |
| **One id here, own data per platform** (this spec) | One contest. Each site keeps its own history under that id. Logins stay separate. No cross-site toggle. | Some admin creates the event once. A volunteer form cannot invent a round the event does not have. |
| **A different id on every platform** | Each site can archive without waiting for the others. Swire already works this way. | Two “BMT 2026”s inside this database. Live and HQ can disagree about the day. Matching last year’s volunteer list to last year’s announcements is a string compare. |
| **One toggle that writes every platform** | Feels like one product. | There is no shared session to hang it on. Live’s admin account is not a volunteer. Swire cannot see the toggle. Skip this. |

**Still open:** which admin page creates the event and edits the shared facts. Not five of them.

## Auth, so far

**Locked:** the volunteers platform uses OAuth. A returning person is the same person next semester. Staff check-in on that host is the same door.

**Locked:** `live.berkeley.mt/admin` is a **single admin account**. One shared login, not a person and not Google. It writes public content only. The cookie is `Path=/admin`, so guest pages do not receive it. A volunteer session does not open it.

**Not locked:** how HQ, the planner, or roomsdb sign in. They might later share volunteer OAuth, or they might not.

Why this is awkward with one event and several hosts:

- A cookie set on `volunteers.berkeley.mt` is not sent to `ops.berkeley.mt`. Signing up to volunteer does not open the dashboard. That is what we want for ~300 volunteers. It also means a staff person who uses both sites signs in twice until we deliberately link the accounts.
- Live admin is the shared-account shape: one login, not a person. HQ, the planner, and roomsdb still need a proof of their own. None of those may be interchangeable with a volunteer session.
- One event does not mean one login. The event row is shared. The session is per host.

Swire stays on its own admin login and proctor login. Live guests stay logged out.

**Open, do not pretend these are decided:**

- **Auth** for HQ, the planner, and roomsdb. Volunteers OAuth is decided. Live admin is one shared account. Swire’s logins are Swire’s.
- **Which admin edits the shared event** (day, rounds, roster checkbox). One event row is decided. Five setup screens are not.
- **Volunteer view on HQ.** A copy of the volunteers table on the dashboard is useful and also cuts against “go to the volunteers component for volunteer stuff.” Undecided.
- **Maps.** Year-round like roomsdb, or event configuration? The only source today is Figma files. How those files become something the software can draw is undecided. Do not copy DWIN155 into a second list either way.

## One API (the twin of one Postgres)

**One API** means one HTTP backend that is the only writer to that Postgres. Roomsdb, allocator, HQ, volunteer admin, maps, and the public site all call **this** service. Rules like “day-of never updates rooms” live in one place. **Proctors do not.** They call Swire.

It does **not** mean one URL the humans type, or that staff and guests share a homepage.

Last semester was six backends (or six sites with no backend). Splitting APIs while keeping one Postgres still splits the rules: the volunteer service might still `UPDATE rooms`, or it talks to tables the HQ service does not know about. One API is how the write-boundaries stay real.

```text
Browsers (staff, room laptop, guest)
        │
        ▼
   one API   ←  only process allowed to talk to Postgres
        │
        ▼
   one Postgres
```

**What you type in the address bar can still differ:**

| Address | Who | Still the same API? |
| ------- | --- | ------------------- |
| `roomsdb.berkeley.mt` | officers (rooms kernel, rare) | Yes (Person cookie + `can_open_ops`) |
| `ops.berkeley.mt` | officers (HQ; planner at `/planner`) | Yes (Person cookie + `can_open_ops`) |
| `volunteers.berkeley.mt` | volunteer people | Yes (Person cookie) |
| `live.berkeley.mt` | guests | Yes (public routes only; no login) |
| `swire.berkeley.mt` | laptop in the room | **No.** Swire’s own API. |

Those can be **one JavaScript app** with several routes, or a staff bundle plus a thinner public bundle. Both are fine. What we are not doing is six separately deployed sites with six release buttons.

**“One web app”** was shorthand for that. The locked part next to Postgres is **one API**. The locked part for humans is **six links** (below).

### API paths (one backend, folders not six APIs)

The browser may call `live.berkeley.mt/api/...` (proxied) or `api.berkeley.mt/...`. Same process. Paths are **`/api/v1/{folder}/...`**.

**Locked: prefix by module**, the way you already name hosts. Each folder is many endpoints, not one dump.

This is **not** a bad idea for “live might call roomsdb.” Folders name **who owns the tables**. They do not stop `live.berkeley.mt` from `fetch('/api/v1/roomsdb/rooms')`. The live origin should proxy **`/api/v1`** (or call `api.berkeley.mt`) so cross-folder reads are one hop. Do **not** proxy only `/api/v1/live` if we want maps on live.

| Folder | Default caller | Owns |
| ------ | -------------- | ---- |
| `/api/v1/roomsdb/` | Staff write: Person + `can_open_ops`. **Some GETs may be public** (labels, capacity, `appears_on_grid`) | buildings, floors, rooms, field defs |
| `/api/v1/maps/` | Staff import from the **maps admin**, not from the HQ page. **Public GET** of external geometry (floor plates, polygons, POIs) | `floor_maps`, `map_spaces`, styles, POIs. Optional `room_id`. Bathrooms have none |
| `/api/v1/ops/` | Person + `can_open_ops` | drafts/planner, day plan, roster import. **HQ reads** rooms, maps, assignments, and Swire. It does not write those systems |
| `/api/v1/volunteers/` | Person (self) or staff on **`volunteers.berkeley.mt/admin`** | `me` (apply, own assignment). Staff writes (check-in, DNI, assign, form) live here, not on the HQ page |
| `/api/v1/live/` | none (GET); POST subscribe | public snapshot, announcement email subscribe. **Guest map view reads `/maps/`, it does not own polygons** |

There is **no** `/api/v1/swire/`. Swire’s exposed API is **read-only**. This platform polls it for timer progress and other Swire data to paint HQ. It must not POST or PATCH Swire. This Postgres does not store timers. **Swire admins** are the only writers. Proctors are not.

**Rule:** a resource has **one** folder and **one admin page**. The HQ page reads other systems. It does not modify them.

| System | Where you change it | What HQ does |
| ------ | ------------------- | ------------ |
| Roomsdb | `roomsdb.berkeley.mt` | Read labels for the list and map |
| Maps | Maps admin (not Saturday root) | Read polygons and paint the day plan on them |
| Planner drafts | `ops.berkeley.mt/planner` | Import a draft into the day plan (HQ’s own copy) |
| Day plan, roster | HQ page, `ops.berkeley.mt` | Write these. They are HQ’s data |
| Volunteers | `volunteers.berkeley.mt/admin` | Read assignments. No assign, DNI, or check-in here |
| Live | `live.berkeley.mt/admin` | Does not edit announcements |
| Swire | Swire admins only | Poll the read-only API |

**Paint is not geometry.** `/maps/` is the floor plate. Ops paints the day plan, roster, and (when Swire answers) timers onto it. Live paints only the public room projection (activity label if we allow it — still no roster, no clock). A `/maps/.../live` payload that includes proctor names is a staff route, not the guest one.

What actually blocks a bad cross-call is **auth**, not the prefix:

- Live **unauthenticated** may read public rooms and **public** map geometry (`mode=external`). It must not read roster names, DNI, internal map labels, or `/ops/`.
- Volunteer **PII** needs a Person cookie. We still do not put that cookie on `live.berkeley.mt`. So live can **link** to `volunteers.berkeley.mt` to apply, or we add an explicit public apply POST later — not “guest GET `/volunteers/people`.”
- Swire’s process cannot PATCH `/roomsdb/rooms`. It may **GET** the public room projection if it needs labels. Timer writes stay on Swire.

Guest live (today → target): `GET /api/live` → `GET /api/v1/live`; `POST /api/email/subscribe` → `POST /api/v1/live/email/subscribe`. Public-shaped only.

#### Tradeoff vs the other shapes

| Shape | What it is | Helps | Costs |
| ----- | ---------- | ----- | ----- |
| **Prefix by module** (locked) | `/roomsdb/rooms`, `/live/email/subscribe`, `/ops/day-plan` | Matches screens and hosts. Easy to review “is this public?” Folder lists the blast radius. New endpoints have an obvious home. | Cross-cutting jobs (import a draft as day plan) still touch two folders. Shared rooms must be **read from roomsdb**, not copied. Prefix is **documentation**; the API must still check cookies. Temptation to split folders into six deploys later — do not. |
| **Flat resources** | `/api/v1/rooms`, `/announcements`, `/people` | Canonical REST. No fight over which folder owns rooms. | Public vs staff is not visible in the path (`GET /announcements` is easy to ship with roster fields). Does not match how this club talks. |
| **Unprefixed per host** | `roomsdb.berkeley.mt/api/rooms`, `live.berkeley.mt/api/live` | Host is the namespace; live never sees `/rooms` on its origin if you do not proxy it. | Same backend still has every route. Easy to accidentally proxy all of `/api` onto live. Harder to share a staff SPA that calls rooms + day plan. |
| **Six HTTP APIs** | one service per screen | Isolation if they really cannot share a process | Last semester. Two rooms lists. Write-boundaries lie. |

Planner sits on the **ops** host, so its API sits under **`/ops/`** (e.g. `/ops/drafts`), not a sixth folder, unless we later mint a planner host.

Auth is still cookie + route. A `/live/` path that returns roster names is a bug even with a perfect folder name.

C3 of this API (folders + gate, Swire external): [2026-08-24-api-c3.md](2026-08-24-api-c3.md).

### Cross-module callers (contracts, not memos)

One API means a live developer **can** call `/volunteers/` or `/roomsdb/`. It also means a volunteer change can break live **if** live depended on a private shape. That communication cost is real. It is still cheaper than last semester’s copy of DWIN155 in five apps.

**Locked:** each folder has a **public surface** (other modules may call) and **internals** (same folder only). Internals may change without a club-wide ping. Public surface is additive:

- New JSON fields are fine; callers ignore unknown keys.
- Rename, remove, or change meaning of a public field is a **break**. Keep the old field or add `/api/v2/...` and say so in CHANGELOG.
- Who is allowed to call what is listed on the module spec, not “any path in the folder.”

**v1 public surfaces (until a module spec tightens them):**

| Caller | May call | Must not call |
| ------ | -------- | ------------- |
| Live (no cookie) | `/live/*` as today; **public GET** of roomsdb rooms (labels, capacity, grid bit); **public GET** `/maps/` external geometry | `/ops/*`; volunteer people list / DNI; internal map mode; Swire’s operator roster |
| Volunteers (Person) | `/volunteers/me/...`; public rooms GET if the form picks a room | `/ops/*` except bounce; other people’s rows |
| Ops / roomsdb staff | From the **matching admin**: `/roomsdb/*` writes, `/maps/` import, `/volunteers/` staff writes, `/ops/*` for drafts, day plan, and roster. HQ page itself only writes day plan and roster, and **reads** the others. **Poll** Swire’s read-only API for timer display | Writes to Swire. Doing another system’s edits on the HQ page |
| Swire (their deploy) | Public GET rooms if they need `DWIN155` / `rooms.id` | `/ops/*`; `/volunteers`; roomsdb writes |

Live depending on “whatever `/volunteers/people` returns this week” is how the memo problem starts. If live needs apply, that is an explicit public POST (or a link to `volunteers.berkeley.mt`), not a private volunteer admin shape.

Swire’s exposed API is **read-only**. **Swire admins** are the only people who start, pause, add time, or send clarifications. Proctors watch. Other platforms poll that API for timer progress and other Swire data. HQ treats a Swire outage as “timers unavailable,” not as this platform down. The HQ map still draws. Live does not show a public clock. Both sites call `/maps/`.

Module specs name the public fields. That is the contract. Slack is the backup, not the design.

## Links (how people enter)

Screens should feel like places you can bookmark. Last semester failed because those places were **separate products with separate rooms lists**, not because they had several URLs. **Swire stays a separate product on purpose** (proctor suite only) so its outage does not take live or HQ down. It must not grow a second rooms list: read public rooms, or accept `rooms.id` we already published.

**Cadence:** roomsdb is rare (start of semester). The planner is regular (weeks of grid work). HQ is Saturday. Those three are **different bookmarks** and do not share primary chrome. Same Google, same API. Details: [staff links by cadence](2026-08-23-bmt-2026-architecture.md#staff-links-by-cadence).

| Link | Who | Sign-in | Bookmark |
| ---- | --- | ------- | -------- |
| Roomsdb | staff | Google + `can_open_ops` | **`roomsdb.berkeley.mt`** — rooms, capacity, custom fields (rare) |
| Allocator | staff | Same Google | **`ops.berkeley.mt/planner`** — time × room draft (regular) |
| HQ | staff | Same Google | **`ops.berkeley.mt`** — Saturday list and map **view**. Writes the day plan and roster only. Reads rooms, maps, assignments, and Swire. Does not edit those systems |
| Volunteers | returning volunteers, and staff at **`/admin`** | Google → `people.id`. Staff admin needs `can_open_ops` | **`volunteers.berkeley.mt`** — own account. **`/admin`** — assign, DNI, check-in, form. Not the HQ page |
| Public | guests | None on the public pages | **`live.berkeley.mt`** — announcements and a **map view of `/maps/`**. No public clock. Staff public-content admin is the typed URL **`/admin`** |
| Proctors | laptop | `DWIN155` + event password (**Swire**) | **`swire.berkeley.mt`** — watch timer and clarifications, projector. **Cannot modify Swire.** |

**Seventh / apply:** first-time apply is on **`volunteers.berkeley.mt`** (logged out). Do not put the volunteer portal on `live.berkeley.mt` (parents) or on ops (roster, timers).

**Historical hosts (keep the names):**

| Host | What it was | What was missing |
| ---- | ----------- | ---------------- |
| **`swire.berkeley.mt`** | Room timers (one page per room). Staff timer controls at **`/admin`** — a URL officers know, **not a button** on the room page | Clarifications, roster, maps, roomsdb. Swire was the clock product. HQ on ops was unfinished |
| **`ops.berkeley.mt`** | Volunteers (this past semester) | Unmet ambition: ops **dashboard / HQ** on this host. Putting ~300 volunteer logins on the same door as HQ is the tension |
| **`live.berkeley.mt`** | Public contest site | Indoor maps joined to roomsdb |

We are not inventing `hq.berkeley.mt`. HQ lives on **ops**. Volunteer **people** get their own host so they can come back next semester without walking into the war room. Roomsdb is rare and sacred, so it gets **`roomsdb.berkeley.mt`** — a different link from the planner, not a fifth product.

**Hostnames (target):**

| Host | What lives there |
| ---- | ---------------- |
| **`roomsdb.berkeley.mt`** | **Rooms kernel.** Year-round, used rarely. This chrome only — not a tab on the planner or on Saturday HQ. Same Google as ops. Not Swire. |
| **`ops.berkeley.mt`** | **Saturday bookmark for officers** (root = HQ): list and map view, day plan, roster. Planner at **`/planner`**. HQ does not edit rooms, maps, volunteers, live, or Swire. **No roomsdb tab.** |
| **`volunteers.berkeley.mt`** | **Volunteer door.** Apply / update this event, see assignment after check-in. **`/admin`** is where staff assign, check in, and edit the form. |
| **`swire.berkeley.mt`** | **External.** Proctor suite. **Swire admins** are the only writers. Proctors watch (room login, projector). Exposed API is read-only; other platforms poll it. |
| **`live.berkeley.mt`** | **On this platform.** Guests. Announcements and a map view of the same geometry HQ uses. No volunteer login, no officer menus on the public pages. **`/admin`** is one shared admin account (typed URL): public content only. Not OAuth. |

Cadence (rare roomsdb vs regular planner vs Saturday HQ): [architecture](2026-08-23-bmt-2026-architecture.md#staff-links-by-cadence).

Same API, same Postgres for everything **except Swire**. Volunteer OAuth is a Person cookie on `volunteers.berkeley.mt` only. Live guests: none. Live **admin** is one shared account, cookie **`Path=/admin`**, so `/` does not receive it. The **room** cookie lives on Swire only. Do not set cookies on `.berkeley.mt`. Hosts are public; isolation is API authorization plus **Swire as a separate process**. Details: [hosts are public](2026-08-23-bmt-2026-architecture.md#hosts-are-public-isolation-is-the-api). Staff sign-in for HQ, the planner, and roomsdb is still open.

Last semester’s “HQ on the same link as volunteers” was officers wanting one bookmark. Volunteer **accounts** and volunteer **admin** both stay on `volunteers.berkeley.mt`. ~300 people should not sign into `ops.berkeley.mt`. HQ reads the assignment list. It does not edit it.

Do not mint `hq.berkeley.mt` unless ops is retired as a name.

## What the product is

Five screens on this roomsdb, plus Swire beside it:

| Screen | Where | Job |
| ------ | ----- | --- |
| Roomsdb | this platform | Year-round rooms (capacity, custom fields). Typed by hand. Bookmark **`roomsdb.berkeley.mt`**. |
| Allocator | this platform | Time × room draft for an event. One person builds it. |
| Day-of HQ | this platform | Saturday list and map **view**. Writes the day plan and roster. Reads every other system. |
| Volunteers | this platform | People across semesters. Self-service on `/`. Staff edits on **`/admin`**. |
| Maps | this platform | Floor plates and polygons (`/api/v1/maps/`). Edited in the maps admin, not on the HQ page. HQ and live are two views. |
| Public | this platform | `live.berkeley.mt` — announcements and the guest map view. No public clock. Admin at **`/admin`**. |
| Proctor / projector | **Swire** | Watch timer, clarifications, projector. **No writes.** Swire admins modify Swire. Exposed API is read-only. |

Guests and volunteer *applicants* do not use the staff login. Volunteers who return use the **volunteer** login on `volunteers.berkeley.mt`. Projectors use Swire’s room login.

## Persistence (same as workshop)

One PostgreSQL **server**, one **database**. Modules are screens plus related tables, not extra databases.

A **table group** is a cluster of related tables in that database. A **seam** is any copy (CSV, freeze a draft as the day plan, print). Keep seams when a snapshot is enough. Do not keep a roomsdb CSV into volunteers/maps/HQ — those need the live room list.

**Chrome** (UI jargon, not Google Chrome): the **buttons, tabs, and menus around the content**. The timer on HDMI is content. HQ’s list/map tabs are chrome. Swire’s room page already has almost none — `/admin` is a **typed URL**, not a control on the projector. “Do not freeze UI chrome yet” in other docs meant column headers and colors — picky layout, not the host map.

```text
One Postgres
  roomsdb      buildings, floors, rooms, custom field defs/values
  event        the occasion (BMT 2026) + clock defaults for new drafts
  draft plan   activities, time blocks, allocations  (allocator)
  day plan     frozen copy of one draft + Saturday overrides
  roster       imported seats (names, room, time) — Saturday, not Swire’s DB
  volunteers   people, applications, assignments
  maps         floor plates + polygons (optional room_id) — HQ and live both read these
  public       announcements
  staff auth   Google + can_open_ops on people
  volunteer auth  same Google → people.id (not a second cookie)
```

**Not in this database:** Swire (timers, clarifications, room password, projector session). Student registration/scoring (CSV in). Figma `.fig` files (import geometry). Dwinelle Navigator (not year one).

Join key: **`rooms.id`**. Display `DWIN155` is computed. Swire should key proctor state by that id (or by `DWIN155`), not by a private room list. Database name and hosting are an implementation choice.

## Domain (target, not prototype)

| Concept | Meaning |
| ------- | ------- |
| Building | Hall. **Code** at create (`DWIN`), then read-only. Pretty name editable. |
| Floor | Label string (`C`, `D`, `E`, …). |
| Room | `name` (`155`) + `capacity` + `appears_on_grid` + `is_active` + custom fields. |
| Event | One contest (BMT 2026). Owns volunteers’ applications and the day plan. Room password and timers live on **Swire**. |
| Draft plan | Allocator grid. Visible to staff. Not a personal Google-owned document. |
| Day plan | Frozen import of one draft. Saturday writes overrides here, never roomsdb. |
| Allocation | One activity in one room for one interval. One room × slot = one activity. |
| Person | One human id (`people.id`) across semesters. Officers fill the volunteer form as this row. Login may also open ops if staff. Not a student. Not `DWIN155`. |
| Assignment | Person + event + role + optional room/building. |
| Roster seat | Present only if that round’s event-setup checkbox is on. Then: imported student or team + room + time. Not a volunteer. |
| Map space | Geometry. Optional `room_id` (bathrooms have none). |

One org in product (BMT). No `org_id` required for v1.

**Draft plans** are club staff objects. The prototype’s “sheet owner” and 404-for-everyone-else go away unless we pick Google *and* want private drafts. Default: any staff who can sign in can open drafts; still **one writer at a time** (no live co-edit).

## Runtime

Same picture as above. Different cookies / routes, not different APIs.

If Postgres or the site dies: printed day plan, printed room password, assignment packet. Timers may keep ticking locally and show desync when they reconnect.

## Open (product, not leftover prototype)

- **Auth** for volunteers, likely HQ, possibly roomsdb and the planner. Next workshop.
- **Whether HQ shows a volunteers table.**
- **Where maps live** (year-round vs per event) and how Figma files get in.
- Roomsdb room form: **checkbox** vs **kind dropdown** for “show on allocator grid.”
- HQ columns, activity names for focus tests, volunteer form fields, public per-room detail, UI library / language.
- Whether this year’s **Individual** checkbox is on. The control itself is decided: each round in event setup has “this round has student rosters.” Last event’s 30 / 1300 mismatches (2.3%) are why Individual starts unchecked.

## Next

Next workshop is **auth for HQ, the planner, and roomsdb**. Volunteers OAuth is decided. Live admin is one shared account. Do not reopen “Swire is separate,” “Swire’s API is public and read-only,” or “day-of never writes roomsdb.”
