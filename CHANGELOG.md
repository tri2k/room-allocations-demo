# Changelog

## Unreleased

### Indoor maps architecture (2026-08-21)

- Device-first indoor map from BMT toggle-map Figma files (Dwinelle, Wheeler, VLSB): Leaflet `CRS.Simple`, not a print poster
- Geometry is Figma-import only; catalog `rooms` keep capacity; live exam overlay (role, proctors, timers) is a separate join
- Importer is a fail-loud contract (role aliases, goldens), not a scrape of one `.fig` tree
- Spec: [specs/2026-08-21-indoor-maps.md](specs/2026-08-21-indoor-maps.md)
- Docs only; no application code in this change

### Phase 2b private sheets (2026-08-14)

- Event is a label plus clock **defaults**; planning lives on an owner-only `sheets` row
- New sheet wizard: pick ≥1 room, optional activities, clock prefilled from the Event, title default Untitled
- `GET /api/v1/sheets/{id}/schedule` loads the grid; activities, time blocks, and allocations are sheet-scoped
- Overlap exclusion is `(sheet_id, room_id, tstzrange)`; two sheets may book the same room at the same time
- Non-owners get **404** (not 403) for a sheet and its allocations
- Hash routes: `#/events` → `#/events/{id}/sheets` → `#/events/{id}/sheets/new` → `#/sheets/{id}` (settings at `#/sheets/{id}/settings`)
- Seed/reseed creates one demo sheet for `SEED_OWNER_EMAIL` only
- Changing Event defaults does not rewrite existing sheets; changing a sheet’s date/timezone retargets that sheet’s allocation wall-clock times
- Removing a room that still has allocations is 409
- Spec: [specs/2026-08-13-phase-2-accounts-orgs.md](specs/2026-08-13-phase-2-accounts-orgs.md) subphase 2b

### Phase 2a Google sign-in (2026-08-14)

- HTTP-only session cookie; unauthenticated `/api/v1` is 401
- Google OAuth authorization-code flow on the API; SPA `#/login` with Continue with Google
- Local bypass `POST /api/v1/dev/login` when `ENABLE_DEV_AUTH=true` (not for production)
- `users` table; seed upserts `SEED_OWNER_EMAIL` with `google_sub` null until first Google login
- Sign out clears the cookie; refresh stays signed out
- Domain model is still Phase 1 (global catalog, Event owns the grid)
- Spec: [specs/2026-08-13-phase-2-accounts-orgs.md](specs/2026-08-13-phase-2-accounts-orgs.md) subphase 2a


### Product plan: Phase 2 is accounts, not power features (2026-08-13)

- Next phase is Google OAuth, orgs, Event-as-label, and owner-only allocations sheets, ending in a public HTTPS demo
- Spec: [specs/2026-08-13-phase-2-accounts-orgs.md](specs/2026-08-13-phase-2-accounts-orgs.md), shipped as testable subphases 2a–2e
- Power features and polish slip to Phase 3 and 4; live sheet sharing stays later ([collaboration draft](specs/2026-08-11-phase-2-collaboration.md))
- Future catalog history + per-sheet pin/sync captured in [specs/2026-08-13-catalog-history-and-plan-pins.md](specs/2026-08-13-catalog-history-and-plan-pins.md)
- Docs only; no application code in this change


### Phase 1 core loop (shipped 2026-08-11)

- FastAPI + PostgreSQL persistence, SPA wired to `/api/v1`, catalog forms
- Split Event (`#/event`) from Catalog (`#/catalog`): venue spaces vs the day being planned
- Repo layout is now `frontend/` + `server/`; schedule no longer lives in `localStorage`
- C4 architecture diagrams in `docs/c4/` (context, container, component; theme-neutral flowcharts for light and dark mode)
- Split `SPEC.md` into `PRODUCT.md` + `specs/`; slim `AGENTS.md`; align `GUIDELINES.md`
- Note v0 merged-block edit bug in `docs/known-bugs-v0.md`

### UI polish and bug fixes (2026-08-12)

- Harden Vite `/api` proxy and surface non-JSON API errors clearly
- Collapse: building/floor headers expand again; same controls in transpose view
- Drag/resize: resize handles no longer start a move; live pointer preview while dragging/resizing
- Sticky schedule headers, time gutter, and transpose “Time” corner while scrolling
- Reset: failed reseed stays on the grid with an error toast instead of the boot error screen
- Catalog/Event toasts auto-dismiss; inactive buildings/rooms show **Inactive** with **Reactivate**
- Catalog room form: floor dropdown scoped to selected building; API rejects floor/building mismatch
- Schedule: **Clear selection** button and `Escape` to deselect allocation or bulk-selected rooms

### API and data integrity (2026-08-13)

- Atomic `POST /events/{id}/allocations/bulk-patch` and `.../bulk-delete` so merged-block group move/resize/delete cannot 409 sibling rooms or persist a partial set
- Overlap exclusion constraint is `DEFERRABLE INITIALLY DEFERRED` so a single transaction can shift/swap rooms
- Unique catalog keys (building code, floor label, room name) return 409 instead of 500
- Reject bookings on inactive rooms or rooms in inactive buildings; bulk create skips them as `inactive`
- Changing event date or timezone retargets allocation wall-clock times onto the new day/zone
- Validate timezone, `slotMinutes` (5/15/30), grid range, and time-block range (422) instead of 500 or unloadable events
- Allocation PATCH cannot attach an activity from another event; floor delete is allowed when remaining rooms are inactive
- Closes the open ghost-booking note from 2026-08-12

### Merged-block group edit (2026-08-13)

- Click a merged bar to select the whole run; Alt-click to select one room by pointer position
- Move, resize, and delete apply to the selection set (keyboard Delete/Backspace included)
- Partial selection expands the run into per-room cards until the full run is selected again
- Closes the v0 leader-only edit bug in [docs/known-bugs-v0.md](docs/known-bugs-v0.md)

### Regression fixes (2026-08-13)

- Slide/resize a merged run without 409 or a partial persist (atomic `bulk-patch`; supersedes the vacate-first sequential PATCH in #2)
- Alt-click on an expanded per-room card selects that room instead of hit-testing the merged span
- Collapsed building/floor headers expand on a single click; a following double-click does not snap them shut
- Do not re-render selection on allocation pointer-down so dnd-kit can start a move

## v0 — Vision demo (2026-08-11)

**Status: complete.** Frontend-only prototype that proves the grid UX against the BmMT spreadsheet workflow.

### Shipped

- Seeded BmMT 2026 buildings, floors, rooms, activities, phase timeline, and sample allocations
- Drag from activity palette to create allocations (single room or bulk on selection)
- Floor/building header click selects rooms for bulk assign
- Move allocations by drag; resize by handles (vertical in normal view, horizontal when transposed)
- Overlap warning (red border); overlapping creates are skipped in bulk assign
- Select an allocation and delete with `Delete`/`Backspace` or the `×` button
- Full matrix transpose (rooms as rows, time as columns) with merged building/floor bands
- Adjacent rooms with the same activity and time range render as one merged block
- Persist schedule edits in `localStorage`; Reset restores seed data
- Static-site build (`npm run build` / `npm run preview`); no backend

### Out of scope (later phases)

- Auth, multi-user sync, Postgres persistence
- Room/building CRUD UI
- Proctors, export/import, capacity dashboard
