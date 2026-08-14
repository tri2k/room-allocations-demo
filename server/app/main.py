from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.gate import SessionGateMiddleware
from app.routers import allocations, auth, buildings, dev, events, floors, rooms, sheets

app = FastAPI(title="Room Allocations API")
# Session gate is inner; CORS is added last so 401s still get ACAO headers.
app.add_middleware(SessionGateMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|\[::1\]):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(buildings.router)
app.include_router(floors.router)
app.include_router(rooms.router)
app.include_router(events.router)
app.include_router(sheets.router)
app.include_router(allocations.router)
app.include_router(dev.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
