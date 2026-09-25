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
- **Maps are their own folder** (`/api/v1/maps/`), not a live feature. HQ’s map view and the guest site both read that geometry. What gets painted on it differs (staff day plan vs public labels).
- **Swire is not on this platform.** Proctor tools (timer, clarifications, projector) stay a separate deploy. Their exposed API is **read-only**. HQ may display timer state. HQ does not start, pause, add time, or send clarifications. If Swire dies, roomsdb / ops / volunteers / live / maps stay up. If this API dies, proctors still have Swire.
- **Live stays here** so guests read the same maps HQ uses, without a second copy of DWIN155.
- Roomsdb is sacred: day-of never updates rooms. Swire does not write rooms either.
- Draft grid → explicit import as frozen day plan. Clocks live on Swire. This platform never writes them, so re-import cannot reset them.
- No live co-edit on the grid
- Room login (`{building code}{room name}` + one event password) is **Swire’s**, not a cookie on this API
- **Google** for every Person on this platform; staff is `can_open_ops` on that Person. Other issuers (Microsoft, email/password as login) are out of this design pass.
- Roster is a CSV snapshot from the registration product; students are not volunteer people
- Custom room fields; built-in `capacity` only (≥ 0)
- Building codes DWIN, WHLR, VLSB, MLK; code set at create
- `appears_on_grid` hedge; skip a Location supertype
- Print backup as already locked. Timer / clarification / projector **behavior** stays as locked; **where it runs** is Swire, not this API.

**Stack at build time is still open.** Architecture is: **one API**, one Postgres, hosts **`roomsdb.berkeley.mt`**, **`ops.berkeley.mt`**, **`volunteers.berkeley.mt`**, **`live.berkeley.mt`**. **`swire.berkeley.mt` is someone else’s deploy.** Paper if this site dies. Language and UI library are not part of this design.

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
| `/api/v1/maps/` | Staff import: Person + `can_open_ops`. **Public GET** of external geometry (floor plates, polygons, POIs) | `floor_maps`, `map_spaces`, styles, POIs. Optional `room_id`. Bathrooms have none |
| `/api/v1/ops/` | Person + `can_open_ops` | drafts/planner, day plan, HQ overlay, roster import, volunteer **admin** (check-in, DNI, assign). **HQ map view reads `/maps/`, it does not own polygons** |
| `/api/v1/volunteers/` | Person (self) or staff | `me` (apply, own assignment). Staff may use staff routes here **or** under `/ops/` — pick one owner in the module spec, not both |
| `/api/v1/live/` | none (GET); POST subscribe | public snapshot, announcement email subscribe. **Guest map view reads `/maps/`, it does not own polygons** |

There is **no** `/api/v1/swire/`. Swire’s exposed API is **read-only**. HQ may GET timer and clarification state to paint the list and map. It must not POST or PATCH Swire. This Postgres does not store timers.

**Rule:** a resource has **one** folder. HQ and live both read `/roomsdb/rooms` (live gets the **public projection**) and both read `/maps/` (same polygons). There is no `/ops/rooms`, no `/ops/maps` copy, and no `/live/maps` copy unless that path is a thin alias.

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
| Ops / roomsdb staff | `/roomsdb/*` writes; `/maps/` import; `/ops/*` including the HQ map view; staff volunteer routes. **GET** Swire’s read-only API for timer display | Any write to Swire. Swire as if it were a folder of this API |
| Swire (their deploy) | Public GET rooms if they need `DWIN155` / `rooms.id` | `/ops/*`; `/volunteers`; roomsdb writes |

Live depending on “whatever `/volunteers/people` returns this week” is how the memo problem starts. If live needs apply, that is an explicit public POST (or a link to `volunteers.berkeley.mt`), not a private volunteer admin shape.

Swire’s exposed API is **read-only**. Start, pause, add time, and clarifications happen on Swire, not from HQ. HQ treats a Swire outage as “timers unavailable,” not as this platform down. The HQ map still draws. Live does not call Swire (no public clock). Both sites call `/maps/`.

Module specs name the public fields. That is the contract. Slack is the backup, not the design.

## Links (how people enter)

Screens should feel like places you can bookmark. Last semester failed because those places were **separate products with separate rooms lists**, not because they had several URLs. **Swire stays a separate product on purpose** (proctor suite only) so its outage does not take live or HQ down. It must not grow a second rooms list: read public rooms, or accept `rooms.id` we already published.

**Cadence:** roomsdb is rare (start of semester). The planner is regular (weeks of grid work). HQ is Saturday. Those three are **different bookmarks** and do not share primary chrome. Same Google, same API. Details: [staff links by cadence](2026-08-23-bmt-2026-architecture.md#staff-links-by-cadence).

| Link | Who | Sign-in | Bookmark |
| ---- | --- | ------- | -------- |
| Roomsdb | staff | Google + `can_open_ops` | **`roomsdb.berkeley.mt`** — rooms, capacity, custom fields (rare) |
| Allocator | staff | Same Google | **`ops.berkeley.mt/planner`** — time × room draft (regular) |
| HQ | staff | Same Google | **`ops.berkeley.mt`** — Saturday list **and map view** (same `/maps/` geometry), roster, volunteer **admin**. Timer **display** is a read of Swire (panel degrades if Swire is down). No timer writes |
| Volunteers | returning volunteers | Google → `people.id` | **`volunteers.berkeley.mt`** — own account, apply again, see assignment. Not ops. |
| Public | guests | None | **`live.berkeley.mt`** — announcements and a **map view of `/maps/`**. No public clock |
| Proctors | laptop | `DWIN155` + event password (**Swire**) | **`swire.berkeley.mt`** — timer, projector, clarifications. **Not this API** |

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
| **`ops.berkeley.mt`** | **Saturday bookmark for officers** (root = HQ). Planner at **`/planner`** (regular grid work). HQ list **and map** (reads `/maps/`). Volunteer **admin** (assign rooms, DNI, name-search check-in, form builder). Staff login, not volunteer login. **No roomsdb tab** on HQ or planner. |
| **`volunteers.berkeley.mt`** | **Volunteer door.** Continue with Google. Apply / update this event, see assignment after check-in. Same `people` row as ops if they are staff. **Not** the room password. |
| **`swire.berkeley.mt`** | **External.** Proctor suite only: room login, timer, projector, clarifications. Exposes an API. Not a folder of this backend. Officers who type `/admin` there are Swire’s problem (redirect to ops is fine if they still do it). |
| **`live.berkeley.mt`** | **On this platform.** Guests. Announcements and a map view of the same geometry HQ uses. No volunteer login, no officer menus. Typed `/admin` redirects to ops. |

Cadence (rare roomsdb vs regular planner vs Saturday HQ): [architecture](2026-08-23-bmt-2026-architecture.md#staff-links-by-cadence).

Same API, same Postgres for everything **except Swire**. **One cookie on this API:** **Person** (Google; host-scoped to ops / roomsdb / volunteers; staff if `can_open_ops`). Live guests: none. The **room** cookie lives on Swire only. Do not set Person cookies on `.berkeley.mt` (that would include live and Swire). Hosts are public; isolation is API authorization plus **Swire as a separate process**. Details: [hosts are public](2026-08-23-bmt-2026-architecture.md#hosts-are-public-isolation-is-the-api).

Last semester’s “HQ on the same link as volunteers” was officers wanting one bookmark. That still works if **admin** stays on ops and **volunteer accounts** move. ~300 people should not sign into `ops.berkeley.mt`.

Do not mint `hq.berkeley.mt` unless ops is retired as a name.

## What the product is

Five screens on this roomsdb, plus Swire beside it:

| Screen | Where | Job |
| ------ | ----- | --- |
| Roomsdb | this platform | Year-round rooms (capacity, custom fields). Typed by hand. Bookmark **`roomsdb.berkeley.mt`**. |
| Allocator | this platform | Time × room draft for an event. One person builds it. |
| Day-of HQ | this platform | Frozen plan + Saturday list and **map view**. Roster, volunteer admin. Timer column is a **read** of Swire. |
| Volunteers | this platform | People across semesters, form, assign to roomsdb rooms, check-in. |
| Maps | this platform | Floor plates and polygons (`/api/v1/maps/`). Not a bookmark of its own. HQ and live are two views. |
| Public | this platform | `live.berkeley.mt` — announcements and the guest map view. No public clock. |
| Proctor / projector | **Swire** | Timer, clarifications, projector. All of those writes stay on Swire. Their exposed API is read-only. |

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
| Roster seat | Imported student name + room + time. Two tests = two rows. Move in this app. |
| Map space | Geometry. Optional `room_id` (bathrooms have none). |

One org in product (BMT). No `org_id` required for v1.

**Draft plans** are club staff objects. The prototype’s “sheet owner” and 404-for-everyone-else go away unless we pick Google *and* want private drafts. Default: any staff who can sign in can open drafts; still **one writer at a time** (no live co-edit).

## Runtime

Same picture as above. Different cookies / routes, not different APIs.

If Postgres or the site dies: printed day plan, printed room password, assignment packet. Timers may keep ticking locally and show desync when they reconnect.

## Open (product, not leftover prototype)

- Roomsdb room form: **checkbox** vs **kind dropdown** for “show on allocator grid.”
- HQ columns, activity names for focus tests, volunteer form fields, public per-room detail, clarification image storage, UI library / language.

## Next

Keep workshopping **roomsdb**, then the other screens, against this file. Do not ask whether the prototype already has a column. Slightly off details get fixed in module write-ups; do not reopen “day-of never writes roomsdb” or “one Postgres.”
