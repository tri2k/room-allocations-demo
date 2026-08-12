# Context (C4 level 1)

v0 is a single-user browser demo. There is no server, auth, or shared database.

```mermaid
C4Context
title Room Allocations — System Context (v0)

Person(planner, "Event planner", "Builds the day-of room schedule")
System(app, "Room Allocations", "Drag-and-drop room-time grid demo")
System_Ext(browserStorage, "Browser localStorage", "Holds schedule JSON and view orientation")

Rel(planner, app, "Creates, moves, resizes, and deletes allocations")
Rel(app, browserStorage, "Reads and writes ScheduleState")
```

## Notes

- One planner at a time per browser profile. There is no multi-user sync.
- Seed data is bundled in the app, not an external system.
- Reset clears localStorage and reloads the bundled seed.
