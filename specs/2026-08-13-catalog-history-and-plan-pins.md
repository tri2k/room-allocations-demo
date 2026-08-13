# Catalog History and Plan Pins

**Status**: Draft (future — not Phase 2)

Product context: [PRODUCT.md](../PRODUCT.md). Depends on [Phase 2 accounts/orgs](2026-08-13-phase-2-accounts-orgs.md) (private sheets, org catalog, room pick list). Do not implement until Phase 2 is shipped.

## Problem

The org **catalog** is shared and changes over time (capacity fixes, renames, room retirement). **Sheets** are private plans that reference catalog **rooms by id**. If the grid always shows **today’s** catalog, old plans lie: BmMT 2025 might show 2026 capacity on DWIN155.

If the grid **never** updates after create, active planners suffer: someone fixes a typo in Catalog and every open sheet stays wrong until they rebuild columns by hand.

We need **history you can look up** and **per-plan control** over whether room *display* follows the catalog or a pinned point in time.

## User stories

1. **Archival.** Open last year’s sheet; room headers and capacity match what planners saw that year, even though the catalog changed this semester.
2. **Active planning.** Mid-semester, catalog admin corrects DWIN155 capacity. A planner chooses to pull that fix into their open sheet without redoing allocations.
3. **Catalog research.** In `#/catalog`, default view is **current**. Optionally browse “as of date X” or revision N to see how a room used to be labeled and sized.
4. **No silent rewrites.** Catalog edits do not auto-change every sheet. Sync is an explicit owner action (unless we later add a rare org-wide policy — out of scope for v1 of this feature).

## Design direction (target)

### Catalog revisions

- Org catalog keeps a **current** row per building/floor/room (what exists today).
- Each meaningful edit appends a **revision** (or audit log entry): who, when, what changed (name, capacity, type, building, `is_active`, …).
- Catalog UI: default = current. Optional **history** panel or “view as of …” for lookup (not required on every edit screen).

Buildings and rooms stay separate entities; revisions track room fields and membership in a building, not “whole building snapshots” unless we decide that later.

### Sheet pin

Each sheet stores:

- `included_room_ids` — which columns exist (unchanged from Phase 2).
- **`catalog_pinned_at`** or **`catalog_revision_id`** — which catalog snapshot supplies **display** for those rooms: label `DWIN155`, capacity, room type, building code, active flag for warnings.

Default when a sheet is created: pin = **catalog revision at create time** (or timestamp). Allocations are unchanged; only metadata for headers/warnings comes from the pin.

Changing the Event or org does not move the pin. Each sheet owns its pin.

### Manual sync (“Update room info from catalog”)

Owner-only action on an open sheet:

- Load **current** catalog fields for rooms already on this sheet.
- Show a **short diff** (name, capacity, type changes) before apply.
- On confirm: advance the pin to current (or merge fields — product choice below).
- Does **not** add new catalog rooms to the sheet.
- Does **not** remove columns silently. Removing a retired room is a separate, confirmed step (allocations on that column may need handling — warn or block).

No global “push catalog to all sheets.”

### Deactivate vs pin

From Phase 2 (unchanged intent):

- **Deactivate** retires a room from the **picker** for new sheets.
- Deactivate does **not** auto-remove columns from sheets that already picked that room.
- With pins: a deactivated room on a pinned sheet may still show as a column; display may show “inactive” from pinned or current data (TBD in UI spec).

Hard **delete** of a room with existing allocations: block or require explicit column removal on each affected sheet (TBD).

## Models compared

| Approach | Old semester plan | Mid-semester fix | Catalog history browser |
| -------- | ----------------- | ---------------- | ----------------------- |
| Always live catalog | Wrong capacity today | Auto on refresh | No |
| Snapshot only at create | Correct | Stale until manual rebuild | No |
| **Pin + optional sync (target)** | Correct (pinned) | Owner syncs when wanted | Yes (catalog side) |

## Phase 2 interim (until this ships)

Phase 2 sheets store room ids and **display from current catalog** on each load. Document as a known limitation. Deactivate: picker only, no auto-strip columns. See [Phase 2 spec](2026-08-13-phase-2-accounts-orgs.md).

## In scope (when scheduled)

- Catalog revision storage + current view
- Sheet `catalog_pin` field(s)
- Sync UI + API with diff preview
- Catalog “view history” (minimal: per-room timeline)

## Not in scope (first version)

- Auto-sync all sheets when catalog changes
- Pin at Event level forcing all sheets to one revision (may add as default for *new* sheets only)
- Diffing allocation geometry when room metadata changes
- Cross-org catalog history

## Open questions

| Question | Notes |
| -------- | ----- |
| Which phase? | Candidate: **Phase 3** (with templates/export) or its own slice after Phase 2 |
| Pin granularity | Per sheet only vs Event suggests default pin for new sheets |
| Sync updates | Headers/labels only vs capacity warnings vs both |
| Pin storage | Monotonic revision id vs `pinned_at` timestamp resolving to nearest revision |
| Room removed from catalog | Hide column? orphan allocations? block open? |
| “View as of date” in Catalog | Same revision store as plan pins |

## Acceptance criteria (draft)

- [ ] Editing a room in Catalog creates a queryable revision; current view unchanged for new pickers
- [ ] New sheet pins catalog at create; grid headers match pin, not today’s catalog if they differ
- [ ] Owner can sync sheet to current catalog with visible diff; allocations unchanged
- [ ] Sync does not add/remove room columns without explicit separate action
- [ ] Last year’s sheet still shows last year’s capacity after this year’s catalog edit (without sync)

## References

- Phase 2 deactivate / room pick list: [2026-08-13-phase-2-accounts-orgs.md](2026-08-13-phase-2-accounts-orgs.md) (Catalog UI, New sheet setup)
- Collaboration (separate concern): [2026-08-11-phase-2-collaboration.md](2026-08-11-phase-2-collaboration.md)
