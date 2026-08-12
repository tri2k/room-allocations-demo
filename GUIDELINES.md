# Project Guidelines

Reusable guidelines for starting and developing software projects. Opinionated defaults derived from what has worked in practice.

---

## Project Structure

```
project/
├── AGENTS.md          # This-repo contract (stack, commands, policy)
├── GUIDELINES.md      # This playbook (optional in-repo copy)
├── PRODUCT.md         # Product specification (vision, architecture, phased delivery)
├── specs/             # Feature specs (one file per feature)
│   └── {yyyy-mm-dd}-{name}.md
├── docs/c4/           # As-built C4 diagrams (optional; current commit only)
├── CHANGELOG.md       # What shipped (optional)
├── scratchpad.md      # Loose ideas, not yet specced (optional)
├── src/               # Fine for a single frontend app
├── frontend/          # Use instead of src/ when a server/ sibling exists
├── server/            # Backend application (if applicable)
└── site/              # Marketing/landing site (if applicable)
```

Everything lives in one repo unless there's a strong reason to split (e.g., independently deployable services with different teams). Do not introduce `frontend/` + `server/` until there is a backend; a root `src/` is enough for a frontend-only app.

`AGENTS.md` is repo-specific and is what AI tools actually load. Point it at this file for shared defaults. Do not paste this whole playbook into `AGENTS.md`.

---

## AGENTS.md

The working contract for AI-assisted development. Keep it short — only information that changes how code gets written.

**Must include:**
- One-line project description
- Tech stack summary (languages, frameworks, package managers)
- Commands (dev, build, test, lint, format, migrate)
- Code conventions (style, patterns, what to avoid)
- Policy (commit rules, review expectations)

**May include:**
- Architecture notes (only non-obvious things — process boundaries, caching strategies, storage abstractions)
- Established patterns with examples (only when a pattern is non-trivial and you'd waste time rediscovering it)

**Do not include:**
- Tutorials or explanations of how frameworks work
- Things that are obvious from reading the code
- Aspirational conventions nobody follows yet

---

## Product Specification (PRODUCT.md)

The single document that describes what the product is, how it works, and where it's going. Write it before writing code. Update it as decisions are made.

### Structure

```markdown
# Product Name

One-sentence description.

## Vision

What problem does this solve? For whom? What's the core insight?
Keep to 2-3 paragraphs. No marketing language.

## Core Concepts

Define the domain model. Name things precisely.
Each concept gets: name, one-line definition, relationships to other concepts.

## Architecture

High-level system design. Components, boundaries, data flow.
Include: what runs where, what talks to what, what persists where.
Prose is enough. If you keep diagrams, put **as-built** C4 in `docs/c4/` (current commit only; update in the same commit as architecture changes). Do not draw unbuilt phases on those diagrams. Planned work stays in PRODUCT.md / specs. Prefer theme-neutral Mermaid `flowchart` diagrams (no hardcoded colors; Mermaid `C4Context` types break in dark mode).

## Technology Summary

Table or list of concrete technology choices with brief rationale.

## Phased Delivery

Ordered phases, each independently shippable.
Phase 1 is the smallest thing that proves the core concept works.
Later phases add production hardening, scale, ecosystem.

## Non-Functional Requirements

Performance targets, reliability expectations, security boundaries.
Only include what's actually constraining — not aspirational numbers.

## Open Questions

Decisions not yet made. Include enough context for someone to decide.
Mark each as "Open" or "Decided: {outcome}".
```

### Principles

- **Write it to think, not to document.** The spec forces you to confront design decisions before they become expensive to change.
- **Update, don't rewrite.** When reality diverges from the spec, add a note — don't pretend the original thinking didn't happen. The evolution is valuable context.
- **Be specific about scope.** Vague specs produce vague software. If you can't describe a feature concretely, you're not ready to build it.
- **Phase aggressively.** The fastest way to learn what works is to ship something small. Push everything non-essential to later phases.

---

## Feature Specs

One file per feature: `specs/{yyyy-mm-dd}-{feature_name}.md`

### Template

```markdown
# Feature Name

**Status**: Draft | Implemented | Superseded

## Problem

What's broken or missing? Why does it matter now?

## Design

How it works. Be concrete — describe data structures, API shapes, UI behavior.
Include examples where they clarify.

## In Scope

- Explicit list of what this covers

## Not in Scope

- Explicit list of what this deliberately excludes (and why, briefly)

## Implementation Plan

Ordered steps. Each step should be independently shippable and testable.
Order by dependency first, then incremental value.

1. Step one (what it enables)
2. Step two (what it enables)
3. ...

## Open Questions

- Question (context for deciding)
```

### After Implementation

Append a section documenting what actually happened:

```markdown
## Post-Implementation Notes

### Deviations
- What differed from the spec and why

### Additions
- What was added that wasn't in the original spec

### Deferred
- What was cut and why (link to future spec if applicable)
```

Don't rewrite the original spec. The gap between intent and reality is useful information.

---

## Technology Defaults

Opinionated starting points. Deviate when you have a specific reason — not because something else is trendy.

### Frontend (Application)

| Concern | Default | Notes |
|---------|---------|-------|
| Language | TypeScript (strict) | `strict: true`, `noUncheckedIndexedAccess`, no `any` |
| Framework | React | Mature ecosystem, good tooling, wide hiring pool |
| Build | Vite | Fast, simple config, good defaults |
| Routing | TanStack Router | Type-safe, file-based routing |
| State | Zustand | Minimal API, no boilerplate, good devtools |
| Styling | Tailwind CSS | Utility-first, no naming debates, fast iteration |
| Package manager | pnpm | Fast, disk-efficient, strict dependency resolution |
| Testing | Vitest (unit) + Playwright (E2E) | Vite-native, fast |
| Lint/Format | ESLint + Prettier | Flat config, minimal custom rules |

### Frontend (Marketing / Content Site)

| Concern | Default | Notes |
|---------|---------|-------|
| Framework | Astro | Zero JS by default, content-focused, fast |
| Styling | Tailwind CSS | Same as app — shared design tokens |
| Content | Markdown + Astro Content Collections | Zod-validated frontmatter |

### Backend

Language and framework are chosen per-project based on the problem domain. The database is not.

| Concern | Default | Notes |
|---------|---------|-------|
| Database | PostgreSQL | JSONB for semi-structured data, proven at scale, rich ecosystem |

**Language selection heuristics:**

- **TypeScript (Node)** — good default when the team is already JS-heavy, or when the backend is thin (CRUD + auth + proxying to services). Shares types with frontend.
- **Python** — when the ecosystem matters (ML, data processing, scientific computing)
- **Go** — when performance, concurrency, or deployment simplicity (single binary) are primary concerns.

Whichever you pick: use strict typing, a migration tool, and a linter. Don't mix languages in a single service.

### General Principles

- **Minimize dependencies.** Every dependency is a liability. Prefer standard library or single-purpose packages over frameworks that do everything.
- **Typed everything.** TypeScript strict mode. Python type annotations on all signatures. Types are documentation that the compiler checks.
- **One way to do things.** Pick conventions and stick to them. Don't let two patterns coexist for the same problem.
- **No ORMs for simple queries.** If you're writing raw SQL in 80% of queries, drop the ORM. If you're using the ORM's query builder in 80%, keep it. Don't mix.

---

## Development Conventions

### Git

- **Linear history.** Rebase, never merge. Squash fixup commits.
- **Commit messages.** [Conventional Commits](https://www.conventionalcommits.org/): `type[optional scope]: description`. Put **why** in the body; the diff shows what.
- **Don't commit broken code.** Every commit should pass lint and tests.
- **Don't commit secrets.** Use `.env` files (gitignored) and `.env.example` templates.

### Code Style

- **Strict types, no escape hatches.** No `any` in TypeScript. Full type annotations in Python.
- **Enums for fixed value sets.** Never compare raw strings. TypeScript: union types in a central `types.ts`. Python: `StrEnum` in a `constants.py`.
- **Centralized API layer.** All frontend API calls go through a single module. Never scatter `fetch()` calls.
- **Function declarations for components, arrows for everything else** (TypeScript).
- **Compact code.** Collapse duplicate branches, avoid unnecessary nesting, share abstractions.

### Architecture Patterns

- **Protocols over inheritance** (Python). Define interfaces as `Protocol` classes. Swap implementations without changing consumers.
- **Serialization-first.** If state can't be serialized to JSON, it shouldn't be state. No editor-only state that isn't captured in the save format.
- **Content-addressed caching.** Hash inputs to derive cache keys. Never cache by mutable identifiers.
- **Fail explicitly.** If configuration is missing, fail at startup — not halfway through a request. Required config is required, not defaulted to empty string.
- **Progressive disclosure.** Simple UI by default. Advanced features opt-in, not always visible.

### Testing

- **Write tests that prove behavior, not implementation.** Test the public interface, not internal methods.
- **Failing test first.** When fixing a bug: write a test that reproduces it, then fix it, then confirm the test passes.
- **Don't mock what you don't own.** Mock your own abstractions (protocols/interfaces), not third-party libraries directly.

---

## Design Principles

Guiding heuristics for product decisions:

1. **Simple first.** Prefer the smallest solution that solves the real problem. Add complexity only when friction demands it.
2. **Self-hosted first.** Must work on a single machine. Cloud optimizations come second.
3. **Portable artifacts.** Configuration, workflows, data — all should be exportable, versionable, and reproducible without the tool that created them.
4. **Execution is expensive.** Cache by default. Re-run only what changed. Never waste compute on work you've already done.
5. **Low-code primary, code-escape available.** Most work should be doable without writing code. When code is needed, make it a first-class escape hatch — not a separate workflow.

---

## Starting a New Project

1. **Create the repo.** Initialize with `.gitignore`, `AGENTS.md`, and `PRODUCT.md`.
2. **Write PRODUCT.md first.** Force yourself to articulate vision, concepts, and Phase 1 scope before writing code.
3. **Set up the stack.** Use the defaults above. Get lint, format, and tests running before writing features.
4. **Build Phase 1.** The smallest thing that proves the core concept. Ship it.
5. **Write feature specs as you go.** Before starting a non-trivial feature, write a spec. After building it, add post-implementation notes.
6. **Keep AGENTS.md current.** Update it when conventions change. Delete guidance that's no longer relevant.
