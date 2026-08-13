# Phase 2 Accounts, Orgs, and Private Sheets

**Status**: Draft (not implemented)

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
| Event | **Category only**: `name`, optional `event_date`, `org_id` | Admins must not dictate grid/palette for other planners |
| Sheet | The plan: grid settings, activities, time blocks, allocations, title, owner | Same flexibility as a spreadsheet |
| Sheet privacy | Owner only; **no Share button** | Co-edit like Google Sheets is a later phase |
| Many sheets | No uniqueness on `(event_id, owner_id)` | Multiple private drafts per person per Event |
| Org roles | `admin` vs `regular` only | Admin: invites + create Events. Regular: catalog edits + own sheets. Both plan on their own sheets |
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

**Platform superuser.** Not an org role. Emails listed in `PLATFORM_SUPERUSER_EMAILS`. Can create orgs and appoint the first org admin by email. May look up a user by exact email for that purpose. Cannot browse all users as a directory.

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

1. **Email invite.** Admin or superuser types a full email and a role (`admin` or `regular`). No typeahead over all users.
2. **Join code.** Admin copies a link/code. Signed-in user requests access. Admin sees **pending requests for this org only** and approves as `admin` or `regular`.

Search, if any, is over this org’s members and pending requests.

### Subphases

Phase 2 is too large to ship as one diff. Each subphase must leave the app **runnable** and have a **manual test** you can finish without the rest. There is still no test runner; do not call real Google from CI.

Do **not** put a public URL in front of 2a–2d. Those builds are still local (or a private preview). 2e is what stakeholders open.

```
2a Google sign-in
 → 2b Private sheets (Event becomes a label)
   → 2c Orgs, catalog ownership, admin vs regular
     → 2d Email invite + join code
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

**Goal.** The Event is a label. Planning lives on a **sheet** you own. You can have many sheets. Other logged-in users cannot open yours (404). Still one global catalog (no orgs yet).

**In.**

- `sheets` table: `title`, `event_id`, `owner_id`, `timezone`, `slot_minutes`, `grid_start`, `grid_end`, `included_room_ids`.
- Move `activities`, `time_blocks`, `allocations` from Event to sheet. Overlap exclusion: `(sheet_id, room_id, tstzrange)`.
- Strip Event to `name`, optional `event_date`, plus default timezone / grid start / grid end / slot minutes (copied onto new sheets, not live-bound).
- `GET /api/v1/sheets/{id}/schedule` is what the grid loads (Event label + catalog + this sheet).
- UI: Event list → **your** sheets → **New sheet** setup (rooms → activities → clock from Event defaults) → grid.
- New sheet: title Untitled; rooms from picker; activities from setup; clock copied from Event then editable; allocations empty.
- Migration: each existing Event becomes one sheet owned by the seed-owner user; copy current children and grid fields onto that sheet.

**Out.** Orgs, admin vs regular, invites, public deploy. Any logged-in user can still create Events (2c restricts that). Catalog is still global.

**Test.**

1. On Event “BmMT 2026”, create two sheets. Set different slot sizes and different activities. Allocations on sheet A do not appear on sheet B.
2. Book DWIN155 at 9:00 on both sheets — both succeed. Double-book DWIN155 at 9:00 **on the same sheet** — 409.
3. Second Google user: they see the Event label, not user 1’s sheets. Opening user 1’s sheet id is 404. They can create their own sheet.
4. Moving Lunch on sheet A does not change sheet B.

**Done when** those four pass on localhost with two Google test users.

---

#### 2c — Organizations and roles

**Goal.** Catalog and Events belong to an org. Two org roles. Sheets stay owner-private.

**In.**

- `organizations`, `organization_memberships` (`admin` \| `regular`).
- `org_id` on buildings (floors/rooms follow) and events. Unique `(org_id, buildings.code)` instead of global unique code.
- API lists only orgs you belong to; catalog and Events scoped to the active org.
- Regular: catalog CRUD yes; `POST/PATCH/DELETE` Event → 403; sheets unchanged (own only).
- Admin: Event create/rename/archive + catalog + membership read (members of **this** org only).
- Seed: one org (BMT), seed-owner as admin, BmMT catalog + Event + migrated sheet inside it.
- Empty state if the signed-in user has no membership.
- `PLATFORM_SUPERUSER_EMAILS` can create an org and add a first admin **via API or seed** (UI can wait for 2d).

**Out.** Polished invite/join UI (seed or SQL is enough to attach a second member). Public deploy. Sheet sharing.

**Test.**

1. User in org A does not see org B’s rooms or Events.
2. Two members of BMT: each sees the Event list; neither sees the other’s sheets.
3. Regular cannot create an Event (403) and cannot call invite APIs if any exist yet.
4. Regular can edit a room in the BMT catalog; admin can create Event “BmMT 2027.”
5. Dev reseed still rebuilds BMT + catalog + one demo sheet for the seed owner. Allowed only when `ENABLE_DEV_RESEED=true`.

**Done when** those five pass on localhost.

---

#### 2d — Invites and join requests

**Goal.** Admins add people without a global user directory. Superuser can create an org and appoint a first admin from the UI.

**In.**

- Email invite: always “Invite sent.” Pending invite attaches on first Google login with that verified email.
- Join code / link on the org; signed-in user requests access; admin approves as `admin` or `regular`.
- Superuser UI: create org, type first admin email.
- Member list = this org only. Pending request inbox = this org only.

**Out.** Public “browse all orgs.” Prefix search of all emails. Public deploy. Sheet sharing.

**Test.**

1. Admin invites `person@gmail.com`. Response is the same whether or not they exist. After that person signs in with Google, they are in the org with the chosen role.
2. Second user signs in with no org, pastes join code, requests access. Admin sees that request only (not a site-wide user list), approves as regular. Requester can open catalog + Events, still cannot see the admin’s sheets.
3. Org admin has no endpoint that lists users outside the org.
4. Superuser creates a second org and appoints an admin by email.

**Done when** those four pass on localhost.

---

#### 2e — Public HTTPS

**Goal.** Stakeholders open a real URL, sign in with Google, and cannot wipe production data.

**In.**

- Host TBD (Fly, Render, Cloud Run, or similar): HTTPS SPA + API + Postgres.
- Google client: public redirect URI **in addition to** localhost.
- Production env: `ENABLE_DEV_RESEED=false`, secrets not in git, cookie `Secure`.
- Consent screen: Testing + allowlisted stakeholder emails (or publish later).

**Out.** Custom domain polish, Google verification for sensitive scopes (not needed), multi-region, live sheet sync.

**Test.**

1. From a phone or a second laptop, open the public URL, Continue with Google, land in BMT (or empty state).
2. Reseed endpoint is 404 or 403.
3. A non-member cannot read catalog or sheets.
4. Localhost Google login still works with the other redirect URI.

**Done when** those four pass against the public URL.

### Not in Phase 2

- Share button / extra people on a sheet / live sync / presence / audit log — [collaboration spec](2026-08-11-phase-2-collaboration.md)
- Templates, proctors, CSV/PDF export, capacity dashboard (Phase 3)
- Sheets import, mobile read-only, `team_count` (Phase 4)
- Passwords, Clerk, magic links, non-Google identity
- Global user directory, public org directory
- CRDT / offline merge
- Calling real Google from CI

### Frontend

HTTP still only through `frontend/src/lib/api.ts`. Domain types in `frontend/src/types/schedule.ts`. JSON camelCase.

Suggested hash routes (keep the current router style; no new router library):

- `#/login`
- `#/orgs` (or auto-select if exactly one)
- `#/catalog` — org catalog
- `#/events` — Event labels (admin: Create Event; regulars: list only)
- `#/events/{eventId}/sheets` — **your** sheets
- `#/sheets/{sheetId}` — grid (replaces loading “the” Event schedule)
- `#/org` — members, invites, join code, pending requests (org admin only)
- `#/super` — create org, appoint first admin (platform superuser only)
- Event-settings UI today that edits grid/activities/time blocks moves to the sheet

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

- Member list for **this org only** (name, email, role). Change role or remove. Not a search of all platform users.
- Invite: type a full email, pick `admin` or `regular`, always “Invite sent.”
- Join code: show / copy / rotate.
- Pending join requests: approve as admin or regular, or deny.

Regulars who hit `#/org` get 404 or are sent back to Events.

**Platform superuser** (your email in `PLATFORM_SUPERUSER_EMAILS`) is a different, small screen (`#/super` or similar), not `#/org`:

- Create an organization (name).
- Appoint first org admin by exact email.

That is how BMT comes into existence. After that, BMT’s org admin uses `#/org`. Superuser does not see BMT members or sheets unless they are also a member.

**What an org admin’s first login looks like** (BMT already seeded): Event list with BmMT 2026, Catalog full of rooms, **their** sheet list empty, plus Org in the nav. Same empty plans as a regular; extra powers are Create Event and Org.

### Catalog UI (vs Phase 1)

Keep Phase 1’s `#/catalog`: three lists (buildings, floors, rooms), add forms, deactivate/reactivate, floor dropdown scoped to building. Do not restyle it. Activities and time blocks stay off this page (they already live on `#/event` in Phase 1; in Phase 2 they live on the **sheet**).

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

## Implementation plan

Each step is a subphase above. Land 2a–2e as separate PRs (or stacked PRs), each with C4 updates **if** that PR adds auth, org, or sheet containers/components.

1. **2a** — Users + Google OAuth + session gate on existing routes.
2. **2b** — Sheet entity; migrate Event children; owner 404; grid loads a sheet.
3. **2c** — Org + membership; scope catalog and Events; admin vs regular.
4. **2d** — Invites, join requests, superuser org UI.
5. **2e** — Public host, production env, Google production redirect.

## Acceptance criteria (phase complete)

Phase 2 is complete when **all** of 2a–2e “done when” lists pass, and:

- [ ] Stakeholders can open a public HTTPS URL and sign in with Google
- [ ] Unauthenticated API mutation is impossible
- [ ] Org regular cannot create Events or invite
- [ ] Org regular can edit catalog and fully edit **their** sheets
- [ ] A sheet is 404 for everyone except its owner
- [ ] Two sheets can book the same room at the same time
- [ ] Org admins cannot list all platform users
- [ ] Production reseed is off
- [ ] C4 matches the deployed architecture (SPA, API, Postgres, Google as identity)

## Post-implementation notes

Fill in when 2e ships (deviations, seed owner email, host chosen).
