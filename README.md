# Room Allocations

Local room scheduler: a Vite grid plus a FastAPI / PostgreSQL API. Phase 2b requires sign-in (Google or local dev login). Planning lives on private sheets.

See [PRODUCT.md](PRODUCT.md), [Phase 1 spec](specs/2026-08-11-phase-1-core-loop.md), [Phase 2 spec](specs/2026-08-13-phase-2-accounts-orgs.md) (2a–2b implemented; 2c–2e planned), [CHANGELOG.md](CHANGELOG.md), and [C4 diagrams](docs/c4/README.md).

## Run locally

```bash
docker compose up -d postgres

cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
python -m scripts.seed
uvicorn app.main:app --reload --port 8000
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the printed localhost URL. Sign in at `#/login` (Continue with Google, or Dev sign in when `ENABLE_DEV_AUTH=true`). Home is `#/events`. Catalog is `#/catalog`. Your plans for an Event are `#/events/{id}/sheets`. The grid is `#/sheets/{id}`. Reset reseeds the BmMT demo (requires `ENABLE_DEV_RESEED=true`) and attaches the demo sheet to `SEED_OWNER_EMAIL` only.
