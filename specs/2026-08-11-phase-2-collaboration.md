# Collaboration

**Status**: Draft (unsequenced)

Do not implement until a later phase is scheduled. Product context: [PRODUCT.md](../PRODUCT.md).

Accounts, orgs, Google OAuth, and **private** sheets are Phase 2: [2026-08-13-phase-2-accounts-orgs.md](2026-08-13-phase-2-accounts-orgs.md). This file is only **sharing a sheet** and live editing — the Google Sheets step after everyone already has their own drafts.

Filename kept (`phase-2-collaboration`) for existing links. It is not the next phase after the core loop.

## Problem

Two (or more) people need to edit the **same allocations sheet** without mailing file versions. Phase 2 explicitly has no Share button: a sheet is owner-only.

## Design

Owner of a sheet invites another account by **email** (same “no global user directory” rule as org invites). Document roles on that sheet: `viewer` / `editor`. Org role is not sheet access — being a BMT admin does not open someone else’s sheet until they share it.

Then: WebSocket per **sheet** (not per Event): `ws://host/ws/sheets/{sheet_id}`. Optimistic UI; server is authoritative; last-write-wins on `updated_at`. Presence + audit log.

### Client → server

```json
{ "type": "subscribe", "sheet_id": "uuid" }
{ "type": "allocation.create", "temp_id": "client-1", "payload": { } }
{ "type": "allocation.update", "payload": { "id": "uuid" } }
{ "type": "allocation.delete", "payload": { "id": "uuid" } }
{ "type": "presence", "payload": { "building_id": "uuid", "view_row": 12 } }
```

### Server → client

```json
{ "type": "allocation.created", "temp_id": "client-1", "payload": { } }
{ "type": "allocation.updated", "payload": { } }
{ "type": "allocation.deleted", "payload": { "id": "uuid" } }
{ "type": "error", "payload": { "code": "OVERLAP", "message": "...", "ref": "client-1" } }
{ "type": "presence", "payload": { "user_id": "...", "name": "Alex" } }
```

## In Scope

- Share a sheet with viewer / editor
- WebSocket sync, presence, audit log on that sheet

## Not in Scope

- Replacing Phase 2 auth / orgs (already shipped by then)
- CRDT / offline merge
- Proctors, export
- Making Event a shared grid again

## Implementation Plan

1. Sheet membership (owner / editor / viewer) + email invite onto a sheet
2. Persist-then-broadcast allocation mutations
3. Optimistic client + rollback on error
4. Presence and audit log

## Acceptance criteria

- [ ] Two browser tabs on the **same shared sheet** see allocation changes within 500ms
- [ ] Viewer cannot mutate; a non-member still gets 404
- [ ] Failed optimistic update reverts block position
- [ ] Audit log records create/update/delete with user_id
- [ ] Org admin who was not invited still cannot open the sheet

## Open Questions

- Whether to skip last-write-wins for a stricter lock on the same block
- Whether org admins should be able to force-share for support (default: no)
