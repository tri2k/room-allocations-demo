# AGENTS.md

## Python Version Guardrail

- The backend standard interpreter is Python 3.13.
- Keep [backend/.python-version](c:\Users\forre\Desktop\Coding\contestproctor\backend\.python-version) set to `3.13` unless a human explicitly approves a team-wide upgrade.
- Do not recreate `backend/.venv` with Python 3.14 just because `python`, `py`, or `python3` happens to point there on one machine.
- On Windows, do not assume `python3` matches `python`; it may come from MSYS2 or another distribution.
- If a compiled-package error appears, suspect a mixed-version virtual environment first and recommend recreating `backend/.venv` with Python 3.13.
- When editing docs or setup commands, prefer explicit Python 3.13 backend commands on Windows, such as `py -3.13 -m venv .venv` or a machine-specific `python313` helper.

## Shebang Guardrail

- Do not use `#!/usr/bin/env python3` in any script in this repo. Use `#!/usr/bin/env python` instead.
- Reason: the Windows py launcher searches PATH for the command after `/usr/bin/env`. On this machine `python3` resolves to `C:\msys64\ucrt64\bin\python3.exe` (MSYS2), which has different packages installed and breaks imports like `httpx`.
- `#!/usr/bin/env python` is safe because the standard Windows Python installer registers `python.exe`, not MSYS2.
- If you see an existing `#!/usr/bin/env python3` shebang, change it to `#!/usr/bin/env python`.

## PostgreSQL Driver Guardrail

- Keep backend database URLs in plain `postgresql://...` form in docs, examples, and `.env` files.
- Do not change local/dev config to `postgresql+psycopg://...`.
- Do not re-add `psycopg` or `psycopg-binary` to [backend/requirements.txt](c:\Users\forre\Desktop\Coding\contestproctor\backend\requirements.txt) unless a human explicitly asks for it and the change has been tested on both Windows and macOS.
- Reason: this repo has already hit Windows failures like `ImportError: no pq wrapper available` when `psycopg` 3 could not load `libpq`, even though the same branch worked on macOS.
- The repo standard is `psycopg2-binary` plus plain `postgresql://...`, which works with SQLAlchemy, Alembic, and the standalone scripts in `backend/scripts/`.
- If you touch database setup code, preserve compatibility for:
  - app startup via `backend/db.py`
  - Alembic via `backend/alembic/env.py`
  - load test script `backend/scripts/loadtest_prod.py`
- If you see an old URL like `postgresql+psycopg://...`, normalize it back to `postgresql://...` instead of propagating it.
