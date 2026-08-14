# Context (C4 level 1)

A planner signs in with Google (or a local dev login) and uses the app against a local API and Postgres. Catalog and Events are still global. There is no org scoping or live multi-user sync.

```mermaid
%%{init: {"theme": "neutral"}}%%
flowchart LR
  planner["Person: Event planner"]
  google["External: Google Identity"]
  app["System: Room Allocations"]
  postgres["External: PostgreSQL"]
  planner -->|"Signs in, then creates, moves, resizes, deletes, edits catalog"| app
  app -->|"OAuth authorization code"| google
  app -->|"Reads and writes catalog, schedule, and users"| postgres
```

## Notes

- `/api/v1` requires a session cookie except OAuth start/callback, auth config, logout, and (when enabled) `POST /dev/login`.
- `/health` stays public.
- Browser `localStorage` only stores grid orientation, not the schedule.
- Reset / reseed reloads the BmMT demo into Postgres and upserts the seed-owner user. It does not wipe `users`.
- Google Cloud OAuth client stays in Testing; allowlist stakeholder Gmails. `ENABLE_DEV_AUTH` is a local bypass, off in production.
