# Phase 2 Accounts, Orgs, and Private Sheets

**Status**: In progress (2a implemented; 2b–2e not started)

Product context: [PRODUCT.md](../PRODUCT.md). Depends on [Phase 1](2026-08-11-phase-1-core-loop.md). Live co-editing of a sheet is **not** this phase: [collaboration spec](2026-08-11-phase-2-collaboration.md).

## Problem

Phase 1 is a local, unauthenticated API. Anyone who can reach it can mutate the one global catalog and the one Event grid. That cannot go on the public internet, and it cannot demo “BMT has an org; each planner has their own drafts.”

Stakeholders need Google sign-in, an org that owns the room catalog, Events as labels for an occasion, and private allocations sheets with the same planning flexibility they had in Google Sheets.

## Design

### Decisions (this spec)

| Topic | Decision | Why |
| ----- | -------- | --- |
| Auth vendor | **Google OAuth only** (no passwords, Clerk, or magic links) | BMT / Berkeley users already have Google accounts |
| Public URL | **In this phase**, last subphase (2e) | Stakeholders cannot use `localhost` |
| Daily dev | Keep `localhost` OAuth redirect **and** the public redirect on the same Google client | Avoid “login only works after deploy” |
| Event | Label + **default clock** for new sheets (`name`, optional `event_date`, timezone, grid start/end, slot size, `org_id`). Does not own rooms, activities, or allocations | Admins set occasion + sensible prefills; planners own structure on the sheet |
| Sheet | The plan: grid settings, activities, time blocks, allocations, title, owner | Same flexibility as a spreadsheet |
| Sheet privacy | Owner only; **no Share button** | Co-edit like Google Sheets is a later phase |
| Many sheets | No uniqueness on `(event_id, owner_id)` | Multiple private drafts per person per Event |
| Org roles | `admin` vs `regular` only | Admin: invites + create Events + member roles. Regular: catalog edits + own sheets. Both plan on their own sheets |
| Catalog | Org-owned; **admin and regular can edit** | Rooms change slowly; last-write-wins is enough |
| Invites | Exact email, or join-code + request | Org admins must not search all platform users |
| Overlap | Per **sheet**, not per Event | Two drafts may both book DWIN155 at 9:00 |
| Host vendor | **TBD at 2e** (Fly, Render, Cloud Run, …) | Does not block 2a–2d |
| C4 | Update diagrams **in the same commit as the code** for each subphase | Specs are not as-built |

### Domain

```
Organization
  ├── members (user + admin | regular)
  ├── buildings → floors → rooms          # catalog
  └── events                              # categories (“BmMT 2026”)
        └── sheets (owner = user)         # private plans
              ├── activities
              ├── time_blocks
              └── allocations → rooms
```

**Organization.** Tenant. Has a join code (rotatable). Created by a platform superuser.

**User.** Created on first Google sign-in (or earlier as an email-only row for seed/invites). Stable id is Google `sub` once they have signed in. Invite matching uses **verified** Google email.

**Platform superuser.** Not an org role. Emails listed in `PLATFORM_SUPERUSER_EMAILS`. **Phase 2 scope:** create orgs and appoint the **first** org admin by email when the org is created. Does not manage ongoing org membership or role changes in this phase. May look up a user by exact email for org bootstrap only. Cannot browse all users as a directory. **Later (not Phase 2):** superuser capabilities will likely expand (e.g. org recovery when all admins are gone, support tooling) — see open questions.

### Org admin lifecycle

Who becomes an org admin, and who stays one, is an **org responsibility**. The platform does not vet or approve promotions after bootstrap.

**1. Bootstrap (once per org).** A platform superuser creates the org on `#/super` and appoints the **first** admin by exact email. That person becomes `admin` on first Google sign-in (or immediately if they already have an account). Superuser does not invite ongoing members or change roles afterward.

**2. Adding admins (org admins only).** An existing org admin can create more admins in three ways:

- **Email invite** with role `admin` (same flow as inviting a regular).
- **Join-code approval** with role `admin` when accepting a pending request.
- **Promote** an existing member from `regular` → `admin` on `#/org`.

**3. Demoting admins (org admins only).** Any org admin can demote **another** member from `admin` → `regular`. An admin **cannot** demote themselves — another admin must do it. API returns **403** if the target membership is the caller’s own. There is no platform rule that an org must keep at least one admin — if every admin is demoted by peers, removed, or leaves, the org may have no one who can invite, create Events, or manage roles. Phase 2 has no self-service recovery; expanded superuser tooling for cases like this is a **future** concern (not Phase 2).

**4. Removing members.** Org admins can remove a member from the org entirely (not just demote). Removed users lose catalog/Event access; their private sheets remain owned by them but are inaccessible until they rejoin.

**5. What regulars cannot do.** Regular members cannot invite, approve join requests, rotate join codes, create Events, or change anyone’s role.

Trust model: orgs are expected to appoint trustworthy admins. The product does not enforce admin count, approval workflows, or superuser sign-off on promotions.

**Event.** Occasion label in an org (`name`, optional `event_date`) plus **default clock settings** for new sheets: timezone, grid start, grid end, slot granularity. Those defaults **copy onto a sheet at create**; later Event edits do not rewrite existing sheets. Event does not own rooms, activities, or allocations. Event page details later.

**Sheet.** One private plan for one Event. After create, the owner can still change rooms, activities, and clock settings. Allocations (blocks on the grid) are the planning work, not part of setup.

### New sheet setup

Forget the Phase 1 “one Event is the grid.” Flow:

1. Pick an Event → **New sheet**.
2. **Pick rooms** from the org catalog (picker UX later). Stored as `included_room_ids`. Buildings/rooms stay separate rows; columns are the rooms they checked.
3. **Create activities** they will place on rooms (Puzzle, Indiv, …). Color and default duration belong here. Whether Lunch / Check-in are activities vs labeled timeline bands is an open detail (see below).
4. **Clock:** start time, end time, slot granularity. Prefill from the Event defaults; they can change them. Timezone prefill from the Event too (needed to stamp allocation times).
5. Land on the **empty grid** (those rooms × that clock, palette filled). Placing blocks is not setup.

**Also at create (easy to miss):** a **title** (default “Untitled”, editable). Calendar **date** comes from the Event’s `event_date` if set; if Event has no date, the sheet needs a date at create.

**Not setup:** allocations, sharing, proctors, export, catalog edits (that is `#/catalog`).

**Optional vs required to finish:** at least one room (otherwise there are no columns). Activities may be empty (add later). Clock always has Event defaults so it is never blank.

Open for later discussion: room picker UX; Event page (what admins edit besides name/date/clock defaults); Lunch/Check-in as palette activities vs gutter bands.

### Permissions

| Action | Platform superuser | Org admin | Org regular | Outsiders |
| ------ | ------------------ | --------- | ----------- | --------- |
| Create org; appoint first admin by email | Yes | No | No | No |
| Invite / join requests / rotate join code | No | Yes | No | No |
| Promote member to admin; demote admin to regular | No | Yes | No | No |
| Remove member from org | No | Yes | No | No |
| List/read Events in the org | No* | Yes | Yes | No |
| Create / rename / archive Event | No* | Yes | No | No |
| Edit catalog (buildings, floors, rooms) | No* | Yes | Yes | No |
| Create many sheets on an Event | No* | Own only | Own only | No |
| Open / edit / delete a sheet | No* | Owner only | Owner only | No |
| See someone else’s sheets | No | No | No | No |

\*Unless they are also a member of that org.

Non-owners requesting a sheet (or its allocations) get **404**, not 403, so ids cannot be probed.

### Auth

- Sign-in: “Continue with Google.” Authorization-code flow on the API; HTTP-only session cookie; SPA does not hold the Google secret.
- Upsert user on callback: `google_sub` + verified email. Reject if Google does not mark the email verified.
- If a pending invite exists for that email, attach membership when they first sign in. Always tell an inviter “Invite sent” whether or not the email already has an account.
- Unauthenticated `/api/v1` (except OAuth start/callback and `/health`) → **401**.
- Google Cloud consent screen: stay in **Testing** and allowlist stakeholder Gmails for the first public demo. `openid email profile` only.

### Invites (no global user list)

Do **not** add `GET /users?q=`.

1. **Email invite.** Org admin types a full email and a role (`admin` or `regular`). No typeahead over all users. Inviting as `admin` is how most future admins join. (Superuser appoints the **first** admin only when creating an org on `#/super`, not via ongoing org invites.)
2. **Join code.** Admin copies a link/code. Signed-in user requests access. Admin sees **pending requests for this org only** and approves as `admin` or `regular`.
3. **Role change (existing members).** On `#/org`, an org admin sets another member’s role to `admin` or `regular` (promote or demote). Cannot change your own role. See [Org admin lifecycle](#org-admin-lifecycle).

Search, if any, is over this org’s members and pending requests.

### Subphases

Phase 2 is too large to ship as one diff. Each subphase must leave the app **runnable** and have a **manual test** you can finish without the rest. There is still no test runner; do not call real Google from CI.

Do **not** put a public URL in front of 2a–2d. Those builds are still local (or a private preview). 2e is what stakeholders open.

```
2a Google sign-in
 → 2b Private sheets + new-sheet setup (Event label + clock defaults)
   → 2c Orgs, catalog ownership, admin vs regular
     → 2d Email invite + join code UI
       → 2e Public HTTPS
```

2b comes **before** 2c so we never ship “everyone in the org shares one grid.” 2e is last so the public API already enforces org and owner rules.

---

#### 2a — Google sign-in

**Goal.** You cannot use the API or grid until you sign in with Google. Data model is still Phase 1 (global catalog, Event owns the grid).

**In.** `users` table. OAuth start + callback. Session cookie. SPA login screen and session restore. All existing `/api/v1` routes require a logged-in user. Seed CLI still works (it does not use HTTP).

**Out.** Orgs, sheets, owner checks beyond “is logged in,” public deploy, invites.

**Bootstrap user for seed.** Seed may insert a `users` row keyed by `SEED_OWNER_EMAIL` with `google_sub` null. The first Google login with that verified email sets `google_sub`. Needed so 2b can attach `owner_id` without inventing a fake Google account.

**Test.**

1. Without a cookie, `GET /api/v1/events` is 401. Grid shows Continue with Google.
2. Sign in with a Google account on the OAuth Testing allowlist. Grid and catalog work as in Phase 1.
3. Sign out. API is 401 again. Refresh stays signed out.

**Done when** those three pass on localhost (Google client has a `localhost` redirect URI).

---

#### 2b — Private allocations sheets

**Goal.** The Event is a label with clock **defaults**. Planning lives on a **sheet** you own. New sheet = setup wizard (rooms → activities → clock) then grid. Many sheets per Event; other users get 404 on yours. Still one global catalog (no orgs yet); any signed-in user can still create Events until 2c.

**In.**

- `sheets` table: `title`, `event_id`, `owner_id`, `plan_date` (from Event `event_date` when set, else required at create), `timezone`, `slot_minutes`, `grid_start`, `grid_end`, `included_room_ids` (room ids, not building ids).
- Move `activities`, `time_blocks`, `allocations` from Event to sheet. Overlap exclusion: `(sheet_id, room_id, tstzrange)`.
- Event: `name`, optional `event_date`, default timezone / grid start / grid end / slot minutes (copied onto new sheets at create, not live-bound).
- `GET /api/v1/sheets/{id}/schedule` — grid load (Event label + **current** catalog for picked rooms + sheet data). See [catalog history spec](2026-08-13-catalog-history-and-plan-pins.md) for future pin/sync.
- UI routes: Event list → **your** sheets only → **New sheet** setup → `#/sheets/{id}` grid. Retire `#/` as the default schedule entry and `#/event` as grid/activity editor (Event admin page for defaults is minimal until 2c polishes admin UX).
- **New sheet setup** (required before grid): (1) pick ≥1 room, (2) activities optional, (3) clock prefilled from Event, editable, (4) title default Untitled.
- Migration: each existing Event → one sheet for seed-owner; copy activities, time blocks, allocations, grid fields; map old Event `included_building_ids` to all active room ids in those buildings (interim one-time migration only).

**Out.** Orgs, admin vs regular, invites, public deploy, room-picker polish, catalog revision history. Event create unrestricted (2c limits to admin).

**Test.**

1. Two sheets on same Event: different `included_room_ids`, activities, and slot sizes; allocations on A not on B.
2. Cross-sheet same room/time succeeds; same-sheet double-book → 409.
3. Second Google user: sees Event, not user 1’s sheet list; user 1’s sheet id → 404; can create own sheet.
4. Time blocks / Lunch on sheet A do not appear on sheet B.
5. New sheet: cannot finish setup with zero rooms; clock prefilled from Event; changing Event defaults afterward does not change an existing sheet’s clock.
6. Grid headers for picked rooms use **current** catalog (Phase 2 interim live display).

**Done when** all six pass on localhost with two Google test users.

---

#### 2c — Organizations and roles

**Goal.** Catalog and Events belong to an org. Admin vs regular. Sheets stay owner-private with the 2b setup flow. No invite UI yet (seed/SQL to add a second member).

**In.**

- `organizations` (name, join code — stored here; invite/join **UI** in 2d), `organization_memberships` (`admin` \| `regular`).
- `org_id` on buildings (floors/rooms follow) and events. Unique `(org_id, buildings.code)`.
- Scope API to active org: catalog, Events, sheets (still owner-only).
- **Admin:** create/rename/archive Event including **clock defaults**; catalog CRUD; read org member list (seed members only until 2d).
- **Regular:** catalog CRUD; list Events; cannot create/edit/archive Events.
- Empty state when signed-in user has no org membership.
- Nav: Events \| Catalog \| Org (admin only, stub or 403 until 2d).
- **Event admin UI** (org admin): create/rename/archive Event; edit name, optional date, clock defaults (replaces 2b minimal Event stub).
- Home after login (one org): Event list.
- Seed: BMT org, seed-owner admin, catalog + Event with clock defaults + one demo sheet for seed-owner only.
- Superuser: create org + first admin via API/seed (`PLATFORM_SUPERUSER_EMAILS`); UI in 2d.

**Out.** Email invite, join-request inbox, join-code copy UI, public deploy, sheet sharing, catalog history.

**Test.**

1. User in org A does not see org B’s catalog or Events.
2. Two BMT members: same Event list; neither sees the other’s sheets; each completes new-sheet setup independently.
3. Regular: Event create → 403; catalog room edit succeeds.
4. Admin: create Event “BmMT 2027” with clock defaults; new sheet on it prefills clock from that Event.
5. No-org user: empty state, no catalog/Events.
6. Dev reseed rebuilds BMT when `ENABLE_DEV_RESEED=true`; demo sheet only for seed-owner email.

**Done when** all six pass on localhost.

---

#### 2d — Invites and join requests

**Goal.** Admins add people without a global user directory. Superuser creates orgs from the UI. Wires up join codes created in 2c.

**In.**

- Email invite API + `#/org` UI: always “Invite sent”; pending invite attaches on first Google login with verified email.
- Join code link + request-access flow; admin pending inbox (org-only); approve as `admin` or `regular`.
- `#/org`: member list, invite, join code copy/rotate, pending requests, **promote/demote** roles (`regular` ↔ `admin`), remove member.
- `#/super`: create org, appoint first admin by email.
- Post-invite empty state for new regular: Event list, empty sheet list, catalog visible (per First login section).

**Out.** Public deploy. Sheet sharing. Catalog history.

**Test.**

1. Admin invites email; same response whether or not account exists; first Google login lands in org with correct role.
2. User with no org: join code → pending → admin approves → catalog + Events, empty own sheets, cannot see admin’s sheets.
3. No API lists platform-wide users; member search is org-only.
4. Superuser creates second org + admin via `#/super`.
5. New regular does not receive seed-owner demo sheet.
6. Admin promotes a regular to admin; demoted admin becomes regular and loses invite/Event-create powers.
7. Admin attempting to demote themselves → 403 (UI disables or hides self-demotion).

**Done when** all seven pass on localhost.

---

#### 2e — Public HTTPS

**Goal.** Stakeholders use a public URL with the full 2a–2d behavior: Google sign-in, org scope, private sheets with setup wizard, invites.

**In.**

- Host TBD: HTTPS SPA + API + Postgres.
- Google client: public redirect URI plus localhost.
- Production: `ENABLE_DEV_RESEED=false`, secrets in env, cookie `Secure`.
- Smoke-test full BMT path: login → Event list → new sheet (rooms, activities, clock) → grid.

**Out.** Custom domain polish, catalog history, live sheet sync.

**Test.**

1. Public URL on a second device: Google login → BMT or no-org empty state.
2. Reseed disabled.
3. Non-member cannot read catalog or sheets.
4. Localhost OAuth still works.
5. Invited stakeholder (allowlisted) completes new-sheet setup on BmMT 2026 without seeing others’ sheets.

**Done when** all five pass against the public URL.

### Not in Phase 2

- Share button / extra people on a sheet / live sync / presence / audit log — [collaboration spec](2026-08-11-phase-2-collaboration.md)
- Templates, proctors, CSV/PDF export, capacity dashboard (Phase 3)
- Sheets import, mobile read-only, `team_count` (Phase 4)
- Passwords, Clerk, magic links, non-Google identity
- Global user directory, public org directory
- CRDT / offline merge
- Calling real Google from CI
- Expanded platform superuser tooling beyond org bootstrap (recovery, support, cross-org ops) — likely later; Phase 2 `#/super` is create org + first admin only

### Frontend

HTTP still only through `frontend/src/lib/api.ts`. Domain types in `frontend/src/types/schedule.ts`. JSON camelCase.

Suggested hash routes (keep the current router style; no new router library):

- `#/login`
- `#/orgs` (or auto-select if exactly one)
- `#/catalog` — org catalog
- `#/events` — Event labels (admin: Create Event from **2c**; regulars: list only)
- `#/events/{eventId}/sheets` — **your** sheets
- `#/sheets/{sheetId}` — grid (after setup)
- `#/org` — members, invites, join code, pending requests (org admin; 2d)
- `#/super` — create org, appoint first admin (platform superuser; 2d)
- **Event admin** (admin only): name, date, clock defaults — not activities or room picks
- **Sheet settings** (owner): edit rooms, activities, time blocks, clock after create

### First login and empty states

A **sheet list** is “your room-allocation plans for this Event.” It is not a list of other people’s plans. A brand-new member has **zero sheets**. We do **not** auto-create a blank sheet on login.

After Google sign-in, pick the first matching state:

**1. No org yet** (signed in, not invited, or invite email did not match).

- No catalog, no Events, no sheets.
- Copy: you are not in an organization yet. Paste a join code, or wait for an admin to invite this Google email.
- Nav: identity + sign out only.

**2. Join request pending.**

- Same emptiness as (1), plus: request sent to {org name}, waiting for an admin.

**3. Just landed in an org as regular** (invite attached on first login, or request approved). Typical BMT add.

| They see | What is there |
| -------- | ------------- |
| Catalog | Yes — the org’s rooms (Dwinelle, …). Shared. They may edit. |
| Event list | Yes — labels the admin created (e.g. BmMT 2026). Read-only. No Create Event. |
| Sheet list for an Event | **Empty.** “No plans yet” + **New sheet**. Not the seed demo grid, not anyone else’s sheets. |
| Grid | Nothing until they create or open a sheet. |

Home after login if they have exactly one org: **Event list**, not the grid. Opening BmMT 2026 shows their empty sheet list.

**4. First sheet they create.** Setup: pick rooms → activities → clock (prefilled from Event). Then an empty grid. No allocations yet. Title default “Untitled.”

**5. New org admin** (superuser created an empty org, appointed them). Same as (3) but they **can** Create Event and invite. Catalog and Event list may both be empty until they add rooms and an Event. Still no sheets until they make one.

**6. Seed / demo owner only.** Reseed may create one demo sheet **for `SEED_OWNER_EMAIL`**. Newly invited people never inherit that sheet.

If they belong to **multiple orgs**, show an org picker first; each org has its own catalog, Events, and sheet lists.

### Admin screens

There is **no** separate admin app and **no** screen that lists everyone’s sheets. An org admin uses the same Events / Catalog / grid as a regular, plus extra controls. Being admin does not open other people’s plans.

Today the nav is Schedule | Event | Catalog. Phase 2 nav for someone in an org:

| Nav | Regular | Org admin |
| --- | ------- | --------- |
| Events | List of Event labels; open one → **their** sheet list | Same, plus **Create Event**; rename/archive an Event |
| Catalog | Buildings / floors / rooms (edit) | Same (not admin-only) |
| Org | Hidden | Members and invites (`#/org`) |
| Grid | Only via their own sheet | Only via their own sheet |

**`#/org` (org admin only).** This is the “admin screen”:

- Member list for **this org only** (name, email, role). Promote `regular` → `admin`, demote another `admin` → `regular`, or remove another member from org. Cannot demote or change your own role. Not a search of all platform users.
- Invite: type a full email, pick `admin` or `regular`, always “Invite sent.”
- Join code: show / copy / rotate.
- Pending join requests: approve as admin or regular, or deny.

Regulars who hit `#/org` get 404 or are sent back to Events.

**Platform superuser** (your email in `PLATFORM_SUPERUSER_EMAILS`) is a different, small screen (`#/super` or similar), not `#/org`:

- Create an organization (name).
- Appoint first org admin by exact email.

That is how BMT comes into existence. After that, **only org admins** create additional admins (invite, join approval, or promote). Superuser does not see BMT members or sheets unless they are also a member.

**What an org admin’s first login looks like** (BMT already seeded): Event list with BmMT 2026, Catalog full of rooms, **their** sheet list empty, plus Org in the nav. Same empty plans as a regular; extra powers are Create Event and Org.

### Catalog UI (vs Phase 1)

Keep Phase 1’s `#/catalog` layout (buildings, floors, rooms). Activities and time blocks are configured on the **sheet**, not here or on Event admin.

What actually changes:

| | Phase 1 | Phase 2 |
| --- | --- | --- |
| Whose rooms | Global (the whole database) | The **active org** only |
| Who can edit | Anyone who can load the app | Org **admin and regular** (same forms). Not outsiders, not superuser-unless-member |
| Building `code` unique | Globally (`DWIN` once) | Per org (BMT and another org may both have `DWIN`) |
| Empty catalog | After a wipe / before seed | New org: empty lists + the same Add buttons. No-org users never see this page |
| Two people editing | N/A (one local planner) | Last write wins; no live updates. Refresh to see the other person’s change |
| Nav around it | Schedule \| Event \| Catalog | Events \| Catalog \| (Org if admin) |

Not on the catalog page: invites, Event create, sheet list. Reset/reseed stays a dev control, not a catalog button; off in production.

**Which rooms appear on a plan** is a **sheet** choice, not Catalog deactivate. Buildings and rooms stay separate entities. The owner picks **rooms** (checkboxes, listed under their building for readability). The grid columns are exactly those rooms. Picking Dwinelle as a building does not auto-include every Dwinelle room unless they use an optional “select all in this building” shortcut, which still saves individual room ids. Another member’s sheet is unaffected. Default for a new sheet: no rooms selected (empty grid + picker).

**Deactivate / reactivate** is catalog retirement, not a plan filter. Inactive rooms (or all rooms in an inactive building) drop out of the **picker**. They do **not** strip columns off sheets that already included those room ids. Reactivate puts them back in the picker. Floors are still hard-deleted only when they have no rooms.

Regulars can still deactivate (they can edit catalog). That only changes what the picker offers next; it does not rewrite everyone else’s room lists.

**Catalog history and plan pins** (revision timeline, per-sheet pin, optional sync to latest catalog) are **not Phase 2**. Full design: [2026-08-13-catalog-history-and-plan-pins.md](2026-08-13-catalog-history-and-plan-pins.md). Phase 2 interim: sheets store room ids; grid **displays** from **current** catalog until that spec ships.

### Open questions

| Question | Status |
| -------- | ------ |
| Host for 2e | **Open** (does not block 2a–2d) |
| Exact cookie name / session TTL | Implementer choice; HTTPS `Secure` + `HttpOnly` + `SameSite` in 2e |
| Copy/fork an existing sheet | **Out** until someone asks |
| `team_count` | Stays later (Phase 4); do not put it back on Event |
| Superuser UI vs env+API only in 2c | **Decided:** API/seed in 2c, UI in 2d |
| Auto-create a sheet on first login | **Decided:** no; empty sheet list + New sheet |
| Home after login (one org) | **Decided:** Event list, not the grid |
| Dedicated admin app / see all sheets | **Decided:** no; `#/org` for members/invites only |
| Catalog UI | **Decided:** keep Phase 1 forms; scope to org; both roles can edit |
| Deactivate room/building | **Decided:** retire from the picker only; do not strip rooms from sheets that already included them |
| New sheet room picker | **Decided:** owner chooses **rooms**; picker UX later. Default none selected |
| Event vs sheet clock | **Decided:** Event stores defaults; copy onto the sheet at create; sheet can override; Event edits do not rewrite existing sheets |
| Sheet title at create | **Decided:** yes; default “Untitled” |
| Catalog history + plan pin/sync | **Future.** Spec: [specs/2026-08-13-catalog-history-and-plan-pins.md](2026-08-13-catalog-history-and-plan-pins.md). Phase 2 interim: live display by room id |
| Multi-day events / day tabs | **Deferred (Phase 4 or Later).** Phase 2–3: one `plan_date` per sheet; multi-day workaround = multiple sheets per Event. When built: day tabs on a sheet + org `default_plan_days` (default **1**) to prefill Event create. Not needed for BMT |
| Org admin promotions | **Decided:** org admins invite/approve/promote to admin; can demote other admins to regular; cannot demote self; no platform approval after bootstrap |
| Platform superuser beyond bootstrap | **Future (not Phase 2).** Likely expand later (e.g. appoint admin on org with zero admins, support actions). Phase 2: create org + first admin only |

## Implementation plan

Each step is a subphase above. Land 2a–2e as separate PRs (or stacked PRs), each with C4 updates **if** that PR adds auth, org, or sheet containers/components.

1. **2a** — Users + Google OAuth + session gate on existing Phase 1 routes.
2. **2b** — Sheet entity + new-sheet setup wizard; Event clock defaults; migrate Event children; owner 404; `#/sheets/{id}` grid.
3. **2c** — Org + membership; scope catalog and Events; admin vs regular; Event admin UI; join code stored (UI in 2d).
4. **2d** — Email invites, join-request inbox, `#/org`, `#/super`.
5. **2e** — Public HTTPS host, production env, full stakeholder smoke test.

## Acceptance criteria (phase complete)

Phase 2 is complete when **all** of 2a–2e “done when” lists pass, and:

- [ ] Stakeholders can open a public HTTPS URL and sign in with Google
- [ ] Unauthenticated API mutation is impossible
- [ ] Org regular cannot create Events, invite, or change member roles
- [ ] Org admin can promote regular → admin and demote another admin → regular; cannot demote themselves
- [ ] Org regular can edit catalog and fully edit **their** sheets
- [ ] New sheet setup: pick rooms (≥1), optional activities, clock from Event defaults, then grid
- [ ] Sheets store `included_room_ids`; grid shows current catalog for those rooms (interim)
- [ ] Event clock defaults copy at sheet create; editing Event later does not rewrite existing sheets
- [ ] Home after login is Event list; new members get empty sheet list (no auto sheet)
- [ ] A sheet is 404 for everyone except its owner
- [ ] Two sheets can book the same room at the same time
- [ ] Deactivate removes room from picker only, not from existing sheets’ columns
- [ ] Org admins cannot list all platform users
- [ ] Production reseed is off
- [ ] C4 matches the deployed architecture (SPA, API, Postgres, Google as identity)

## Post-implementation notes

### 2a (2026-08-14)

- Session is a signed HTTP-only cookie (`ra_session`), not a `sessions` table. TTL default 14 days. `SESSION_SECURE` stays false on localhost.
- Google is authorization-code + userinfo on the API. Empty `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` hides Continue with Google (`GET /api/v1/auth/config`).
- Local bypass: `ENABLE_DEV_AUTH=true` and `POST /api/v1/dev/login` `{ "email" }`. Same cookie as Google. Off in production (2e).
- Seed upserts `SEED_OWNER_EMAIL` and does **not** truncate `users` on reseed, so `google_sub` survives Reset.
- Hash routes still have no router library. `#/login` is exact-match so future `#/events` will not collide with `#/event`.
- Host / public URL still 2e.

Fill in when 2e ships (deviations, seed owner email, host chosen).
