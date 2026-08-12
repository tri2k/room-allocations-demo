# Container (C4 level 2)

v0 ships as a static Vite SPA. Persistence is the browser, not a backend.

```mermaid
C4Container
title Room Allocations — Containers (v0)

Person(planner, "Event planner", "Uses the demo in a browser")

System_Boundary(boundary, "Room Allocations v0") {
    Container(spa, "Schedule SPA", "React, TypeScript, Vite", "Palette, grid, transpose, bulk assign")
    Container(seed, "Seed catalog", "JSON", "Bundled BmMT 2026 buildings, rooms, activities, allocations")
}

System_Ext(browserStorage, "Browser localStorage", "Key room-allocations-demo:v1 plus orientation")

Rel(planner, spa, "Opens via npm run dev or a static host")
Rel(spa, seed, "Loads on first visit and on Reset")
Rel(spa, browserStorage, "Saves schedule after edits")
```

## Runtime

| Container | Technology | Role |
| --------- | ---------- | ---- |
| Schedule SPA | Vite + React 18 + TypeScript + `@dnd-kit` | All UI and scheduling logic |
| Seed catalog | `src/data/bmmt-2026.json` | Default event snapshot |
| Browser localStorage | Web Storage API | Last-edit persistence |

No API container, database, or auth service exists in v0.
