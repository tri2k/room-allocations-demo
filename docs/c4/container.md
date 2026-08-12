# Container (C4 level 2)

v0 ships as a static Vite SPA. Persistence is the browser, not a backend.

```mermaid
%%{init: {"theme": "neutral"}}%%
flowchart TB
  planner["Person: Event planner"]
  subgraph demo [Room Allocations v0]
    spa["Container: Schedule SPA"]
    seed["Container: Seed catalog"]
  end
  browserStorage["External: Browser localStorage"]
  planner -->|"Opens in the browser"| spa
  spa -->|"Loads on first visit and Reset"| seed
  spa -->|"Saves schedule after edits"| browserStorage
```

## Runtime

| Container | Technology | Role |
| --------- | ---------- | ---- |
| Schedule SPA | Vite + React 18 + TypeScript + `@dnd-kit` | All UI and scheduling logic |
| Seed catalog | `src/data/bmmt-2026.json` | Default event snapshot |
| Browser localStorage | Web Storage API | Last-edit persistence |

No API container, database, or auth service exists in v0.
