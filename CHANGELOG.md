# Changelog

## Unreleased

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

### Still open

- Soft-deleted rooms may leave hidden allocations that still block overlaps on the API

### Merged-block group edit (2026-08-13)

- Click a merged bar to select the whole run; Alt-click to select one room by pointer position
- Move, resize, and delete apply to the selection set (keyboard Delete/Backspace included)
- Partial selection expands the run into per-room cards until the full run is selected again
- Closes the v0 leader-only edit bug in [docs/known-bugs-v0.md](docs/known-bugs-v0.md)

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
