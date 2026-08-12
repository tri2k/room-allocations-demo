# Context (C4 level 1)

A single planner uses the app against a local API and Postgres. There is no auth or shared multi-user sync.

```mermaid
%%{init: {"theme": "neutral"}}%%
flowchart LR
  planner["Person: Event planner"]
  app["System: Room Allocations"]
  postgres["External: PostgreSQL"]
  planner -->|"Creates, moves, resizes, deletes, edits catalog"| app
  app -->|"Reads and writes catalog and schedule"| postgres
```

## Notes

- One planner at a time; the API is unauthenticated on localhost.
- Browser `localStorage` only stores grid orientation, not the schedule.
- Reset / reseed reloads the BmMT demo into Postgres.
