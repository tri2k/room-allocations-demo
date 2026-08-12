# Room Allocations

Local single-user room scheduler: a Vite grid plus a FastAPI / PostgreSQL API.

See [PRODUCT.md](PRODUCT.md), [Phase 1 spec](specs/2026-08-11-phase-1-core-loop.md), [CHANGELOG.md](CHANGELOG.md), and [C4 diagrams](docs/c4/README.md).

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

Open the printed localhost URL. Catalog is `#/catalog` (venue spaces). Event setup is `#/event`. Reset reseeds the BmMT demo (requires `ENABLE_DEV_RESEED=true`).
