# C4 architecture

Living C4 model of this repo, drawn in Mermaid. These files describe **the architecture as of the current commit**, not a future target.

- [Context](context.md) — people and neighboring systems
- [Container](container.md) — deployable / runtime units
- [Component](component.md) — internals of the SPA and API

## How to maintain

On any commit that changes architecture (new containers, components, persistence, auth, APIs, or major data-flow), update the diagrams in the **same commit**. Git history is the snapshot of architecture over time.

Do not add speculative boxes for Phase 1+ until that code exists. Planned work belongs in [PRODUCT.md](../../PRODUCT.md) and [specs/](../../specs/).

## Light and dark mode

**Practice:** do not hardcode node colors. Let the host theme (GitHub, Cursor, a docs site) color nodes, edges, and text.

Mermaid's `C4Context` / `C4Container` / `C4Component` types use a **fixed saturated palette** and ignore `theme` / `themeVariables` ([mermaid#4906](https://github.com/mermaid-js/mermaid/issues/4906)). That reads poorly on dark backgrounds (often white-on-light or dark-on-dark).

What we do instead, which is the usual GitHub-safe approach:

1. Draw C4 **structure** with `flowchart` + `subgraph` (no `style` / `classDef` / hex fills)
2. Prefix each diagram with `%%{init: {"theme": "neutral"}}%%` so one palette stays readable on both light and dark canvases
3. Put type labels in the node text (`Person`, `System`, `Container`, …) instead of relying on C4's color legend

If this repo later has a docs site you control (VitePress, Docusaurus, MkDocs), you can re-enable native C4 types and switch Mermaid's theme in JS from `default` to `dark` with `prefers-color-scheme`. That does not work reliably in GitHub markdown today.

Diagram rules:

- Use unstyled Mermaid `flowchart` diagrams that follow C4 levels
- Node IDs: camelCase, no spaces
- Keep labels short; put detail in the surrounding markdown
- If a diagram would be a lie after your change, update it before committing
