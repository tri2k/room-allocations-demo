# AGENTS.md

Room Allocations is a drag-and-drop event room scheduler. v0 is a frontend-only vision demo.

Cross-project defaults live in [GUIDELINES.md](GUIDELINES.md). This file is **this repo only** — do not copy aspirational GUIDELINES stack (Zustand, Tailwind, pnpm, TanStack Router, tests) here until the repo actually uses them.

## Stack (v0)

- TypeScript, React 18, Vite, npm, `@dnd-kit/core`
- Persistence: bundled `src/data/bmmt-2026.json` + `localStorage`
- No backend, router, test runner, or lint script yet
- App code stays in `src/` at repo root until a server exists

## Commands

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Docs

| File | Role |
| ---- | ---- |
| [PRODUCT.md](PRODUCT.md) | Vision, domain, phases |
| [specs/](specs/) | Feature specs (`{date}-{name}.md`) |
| [docs/c4/](docs/c4/README.md) | As-built architecture for the **current commit** |
| [CHANGELOG.md](CHANGELOG.md) | What shipped |

## Policy

- [Conventional Commits](https://www.conventionalcommits.org/): `<type>[optional scope]: <description>`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `build`, `ci`
- Description: imperative, lowercase unless a proper noun, no trailing period
- Body: why, caveats, breaking changes (`feat!:` or `BREAKING CHANGE:`)
- If a change adds, removes, or rewires containers, components, persistence, or external systems, update [docs/c4/](docs/c4/README.md) in the **same commit**
- C4 diagrams: unstyled Mermaid `flowchart` + `subgraph`, prefix `%%{init: {"theme": "neutral"}}%%`, no `style` / `classDef` / hex fills
- Do not invent backend code until work starts on the Phase 1 spec

## Conventions

- Domain types: `src/types/schedule.ts`
- Allocations are one row per room; merged blocks are display-only
- Serialize schedule state as JSON (seed + localStorage)
