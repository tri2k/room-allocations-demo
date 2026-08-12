# Room Allocations Demo (v0)

**v0 — Vision demo** is complete. Frontend-only prototype for pitching the room-scheduling grid.

See [CHANGELOG.md](CHANGELOG.md) and [SPEC.md](SPEC.md) section 3.

## Run locally

```bash
npm install
npm run dev
```

Open the printed localhost URL.

## Included in v0

- Seeded BmMT-style buildings, floors, rooms, activities, and timeline
- Drag activity from palette to create allocations
- Click floor/building headers to select rooms for bulk assignment
- Drag existing allocation blocks to move
- Resize allocation blocks (handles follow orientation)
- Overlap warning styling (red border)
- Select + keyboard delete
- Transpose view (rooms as rows, time as columns)
- Merged adjacent blocks for the same activity
- Local persistence in `localStorage`
- Reset button to restore seed data
