# C4 architecture

Living C4 model of this repo, drawn in Mermaid. These files describe **the architecture as of the current commit**, not a future target.

- [Context](context.md) — people and neighboring systems
- [Container](container.md) — deployable / runtime units
- [Component](component.md) — internals of the schedule SPA

## How to maintain

On any commit that changes architecture (new containers, components, persistence, auth, APIs, or major data-flow), update the diagrams in the **same commit**. Git history is the snapshot of architecture over time.

Do not add speculative boxes for Phase 1+ until that code exists. Planned work belongs in [SPEC.md](../../SPEC.md).

Diagram rules:

- Use Mermaid `C4Context`, `C4Container`, and `C4Component`
- Node IDs: camelCase, no spaces
- Keep labels short; put detail in the surrounding markdown
- If a diagram would be a lie after your change, update it before committing
