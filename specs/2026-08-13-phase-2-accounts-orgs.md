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

**Event.** Label in an org: this plan is for this occasion. Does not store timezone, slot size, grid hours, activities, or time blocks.

**Sheet.** One private plan for one Event. Owner has full control of structure (grid, activities, Lunch bands, allocations). New sheet: empty allocations; defaults such as 15-minute slots, 07:00–16:15, empty activity and time-block lists (not copied from the Event).

Rooms still come from the org catalog. A sheet may filter with `included_building_ids`. Events do not own buildings.

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

- `sheets` table: `title`, `event_id`, `owner_id`, `timezone`, `slot_minutes`, `grid_start`, `grid_end`, optional `included_building_ids`.
- Move `activities`, `time_blocks`, `allocations` from Event to sheet. Overlap exclusion: `(sheet_id, room_id, tstzrange)`.
- Strip Event down to `name` + optional `event_date` (keep a temporary global Event list until 2c).
- `GET /api/v1/sheets/{id}/schedule` is what the grid loads (Event label + catalog + this sheet).
- UI: Event list → **your** sheets + new sheet → grid. Sheet settings replace today’s Event page for grid/activities/time blocks.
- New sheet defaults: 15 min, 07:00–16:15, empty palette and time blocks, empty allocations.
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
- `#/events` — Event labels (admin create control hidden for regulars)
- `#/events/{eventId}/sheets` — **your** sheets
- `#/sheets/{sheetId}` — grid (replaces loading “the” Event schedule)
- Event-settings UI today that edits grid/activities/time blocks moves to the sheet

### Open questions

| Question | Status |
| -------- | ------ |
| Host for 2e | **Open** (does not block 2a–2d) |
| Exact cookie name / session TTL | Implementer choice; HTTPS `Secure` + `HttpOnly` + `SameSite` in 2e |
| Copy/fork an existing sheet | **Out** until someone asks |
| `team_count` | Stays later (Phase 4); do not put it back on Event |
| Superuser UI vs env+API only in 2c | **Decided:** API/seed in 2c, UI in 2d |

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
