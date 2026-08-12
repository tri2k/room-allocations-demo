from app.db import SessionLocal
from app.seed import reseed


def main() -> None:
    db = SessionLocal()
    try:
        event = reseed(db)
        print(f"Seeded event {event.id} ({event.name})")
    finally:
        db.close()


if __name__ == "__main__":
    main()
