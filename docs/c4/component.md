# Component (C4 level 3)

Logical components of the Schedule SPA. Palette and grid live in [`src/App.tsx`](../../src/App.tsx); domain helpers are separate modules.

```mermaid
C4Component
title Schedule SPA — Components (v0)

Container_Boundary(spa, "Schedule SPA") {
    Component(app, "App", "React", "Schedule state, selection, orientation, drag and resize handlers")
    Component(palette, "ActivityPalette", "React", "Draggable activity chips")
    Component(grid, "ScheduleGrid", "React", "Normal and transposed room-time views, merged blocks")
    Component(types, "schedule types", "TypeScript", "Building, Floor, Room, Event, Activity, TimeBlock, Allocation")
    Component(libGrid, "grid helpers", "TypeScript", "Column order, building and floor bands")
    Component(libTime, "time helpers", "TypeScript", "Slot index, snap, ISO time")
    Component(libOverlap, "overlap helpers", "TypeScript", "Same-room interval conflicts")
    Component(libStorage, "storage adapter", "TypeScript", "Load, save, clear ScheduleState")
    Component(seed, "bmmt-2026 seed", "JSON", "Default catalog and sample allocations")
}

System_Ext(dndKit, "dnd-kit", "Pointer drag-and-drop primitives")
System_Ext(browserStorage, "Browser localStorage", "Persisted schedule and orientation")

Rel(app, palette, "Renders and starts palette drags")
Rel(app, grid, "Renders and applies drop, resize, delete")
Rel(app, libGrid, "Builds visible columns and header bands")
Rel(app, libTime, "Maps slots to start and end times")
Rel(app, libOverlap, "Warns and skips conflicting creates")
Rel(app, libStorage, "Hydrates and persists state")
Rel(app, seed, "Clones default state")
Rel(app, types, "Uses domain shapes")
Rel(app, dndKit, "Registers draggables and droppables")
Rel(libStorage, browserStorage, "getItem and setItem")
```

## Data in memory

`ScheduleState` is the single in-memory model: event metadata, buildings, floors, rooms, activities, time blocks, and allocations. Allocations remain one row per room even when adjacent rooms are drawn as one merged block.

## UI modes

- **Normal:** time on Y, rooms on X, building/floor as column headers
- **Transposed:** rooms on Y, time on X, building/floor as row-spanning bands
