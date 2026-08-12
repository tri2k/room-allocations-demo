# Collaboration

**Status**: Draft (unsequenced)

Was Phase 2; moved after polish so the next work after the core loop is power features, not live editing. Do not implement until a later phase is scheduled. Product context: [PRODUCT.md](../PRODUCT.md). Filename kept for existing links.

## Problem

Several organizers need to edit the same schedule without mailing spreadsheet versions.

## Design

Organization/workspace, auth (Clerk or magic link), roles `viewer` / `editor` / `admin`. WebSocket per event: `ws://host/ws/events/{event_id}`. Optimistic UI; server is authoritative; last-write-wins on `updated_at`. Presence + audit log.

### Client → server

```json
{ "type": "subscribe", "event_id": "uuid" }
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

- Auth, orgs, roles
- WebSocket sync, presence, audit log

## Not in Scope

- CRDT / offline merge
- Proctors, export

## Implementation Plan

1. Auth + org + roles
2. Persist-then-broadcast allocation mutations
3. Optimistic client + rollback on error
4. Presence and audit log

## Acceptance criteria

- [ ] Two browser tabs see allocation changes within 500ms
- [ ] Viewer role cannot mutate
- [ ] Failed optimistic update reverts block position
- [ ] Audit log records create/update/delete with user_id

## Open Questions

- Auth vendor
- Whether to skip last-write-wins for a stricter lock on the same block
