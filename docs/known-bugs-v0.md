# Known bugs (v0)

Parking lot for v0 demo issues we are **not** fixing in this phase. Prefer GitHub issues (or similar) once the project is past a vision demo.

This is not a standing product process. Do not add a long-lived `KNOWN_BUGS.md` for later phases; file issues and mention shipped limitations in [CHANGELOG.md](../CHANGELOG.md) / spec post-implementation notes.

---

## Merged blocks only edit the leader allocation — fixed

**Was:** move / resize / delete on a merged bar touched only the leader allocation.

**Now:** click selects the whole run; Alt-click selects one room (hit-test by pointer). Move, resize, and delete apply to the selection. A proper subset selection expands the run into per-room cards.

Shipped with the merged-block group-edit work; see [CHANGELOG.md](../CHANGELOG.md).
