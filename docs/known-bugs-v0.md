# Known bugs (v0)

Parking lot for v0 demo issues we are **not** fixing in this phase. Prefer GitHub issues (or similar) once the project is past a vision demo.

This is not a standing product process. Do not add a long-lived `KNOWN_BUGS.md` for later phases; file issues and mention shipped limitations in [CHANGELOG.md](../CHANGELOG.md) / spec post-implementation notes.

---

## Merged blocks only edit the leader allocation

**Severity:** high  
**Spec:** [v0 vision demo](../specs/2026-08-11-v0-vision-demo.md)

Adjacent rooms with the same activity and exact time range **draw** as one block. Data stays one `Allocation` per room. Move, resize, and delete apply only to the **leader** (left-most / top-most room in the run).

What you see:

- Delete / `×` / `Delete` / `Backspace` removes one room; the rest reappear as a smaller merge
- Drag or resize moves/resizes only the leader; siblings stay and the merge splits

Workaround: select rooms and assign again, or delete room-by-room after the merge splits.

Leave as-is for v0. Fix when merged-block UX is a real feature (treat a run as one edit, or don’t merge visually).
