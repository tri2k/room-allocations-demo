# AGENTS.md

Room Allocations is a drag-and-drop event room scheduler. Phase 1 is a local FastAPI + Postgres app with the v0 grid wired to `/api/v1`.

Cross-project defaults live in [GUIDELINES.md](GUIDELINES.md). This file is **this repo only** — do not copy aspirational GUIDELINES stack (Zustand, Tailwind, pnpm, TanStack Router, tests) here until the repo actually uses them.

## Stack

- Frontend: TypeScript, React 18, Vite, npm, `@dnd-kit/core` in `frontend/`
- Backend: Python, FastAPI, SQLAlchemy 2, Alembic, `psycopg2-binary` in `server/`
- Persistence: PostgreSQL 16 (Docker Compose)
- Seed: `server/data/bmmt-2026.json` + `POST /api/v1/dev/reseed` when `ENABLE_DEV_RESEED=true`
- No auth, router library, test runner, or lint script yet

## Commands

```bash
docker compose up -d postgres
cd server && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
python -m scripts.seed
uvicorn app.main:app --reload --port 8000

cd frontend && npm install && npm run dev
```

Frontend `npm run build` / `npm run preview` still apply inside `frontend/`.

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

## Conventions

- Domain types: `frontend/src/types/schedule.ts`
- Frontend HTTP only through `frontend/src/lib/api.ts`
- Allocations are one row per room; merged blocks are display-only
- JSON is camelCase; SQL is snake_case
- Overlap on one room is HTTP 409 (bulk reports `skipped`)

## Cursor Cloud specific instructions

Cloud VMs here do not ship `python3-venv` apt packages; use **`uv`** (`~/.local/bin/uv`) to create/refresh `server/.venv` and install `server/requirements.txt`. Frontend uses **npm** + `frontend/package-lock.json` (not pnpm).

**Must-run services for E2E:** Postgres (`docker compose up -d postgres`), FastAPI (`cd server && source .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`), Vite (`cd frontend && npm run dev -- --host 0.0.0.0 --port 5173`). Vite proxies `/api` → `127.0.0.1:8000`.

**Gotchas**

- `ERR_CONNECTION_REFUSED` on `:5173` almost always means Vite is not running (or `frontend/node_modules` was never installed). Fastest checks: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5173/` and whether a `vite`/`npm run dev` process exists. In this VM `localhost` resolves to `::1` first; start Vite with `--host ::` (not only `0.0.0.0`) so IPv6 previews do not refuse.
- Docker needs a running `dockerd` (fuse-overlayfs storage). Prefer `sudo docker …` unless the agent user is already in the `docker` group for the current session.
- After compose comes up, wait until the `postgres` healthcheck is healthy before `alembic upgrade head` / `python -m scripts.seed`.
- Copy `server/.env.example` → `server/.env` once (`ENABLE_DEV_RESEED=true` for Reset). `.env` is gitignored.
- No lint/test scripts are defined yet (see Stack above). Sanity checks: `cd frontend && npm run build`, `curl http://127.0.0.1:8000/health`, and UI against `#/`, `#/catalog`, `#/event`.
