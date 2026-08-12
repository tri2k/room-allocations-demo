import { useEffect, useState } from "react";
import {
  ApiError,
  createActivity,
  createBuilding,
  createFloor,
  createRoom,
  createTimeBlock,
  deleteActivity,
  deleteBuilding,
  deleteFloor,
  deleteRoom,
  deleteTimeBlock,
  getEvent,
  listBuildings,
  listEvents,
  listFloors,
  listRooms,
  patchEvent,
  type EventDetail
} from "./lib/api";
import type { Building, Floor, Room } from "./types/schedule";

function Catalog() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const refresh = async () => {
    const nextBuildings = await listBuildings();
    setBuildings(nextBuildings);
    const nextFloors: Floor[] = [];
    for (const building of nextBuildings) {
      nextFloors.push(...(await listFloors(building.id)));
    }
    setFloors(nextFloors);
    setRooms(await listRooms());
    const events = await listEvents();
    setEvent(events[0] ? await getEvent(events[0].id) : null);
  };

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to load catalog");
    });
  }, []);

  const withError = async (action: () => Promise<void>) => {
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "Request failed");
    }
  };

  return (
    <div className="app catalog-app">
      <header className="topbar">
        <div>
          <h1>Catalog</h1>
          <p>Buildings, floors, rooms, and event metadata.</p>
        </div>
        <a className="reset-button" href="#/">
          Back to schedule
        </a>
      </header>

      {error ? <p className="catalog-error">{error}</p> : null}

      <section className="catalog-section">
        <h2>Buildings</h2>
        <form
          className="catalog-form"
          onSubmit={(submit) => {
            submit.preventDefault();
            const form = submit.currentTarget;
            const data = new FormData(form);
            void withError(async () => {
              await createBuilding({
                code: String(data.get("code")),
                name: String(data.get("name"))
              });
              form.reset();
              setToast("Created building");
            });
          }}
        >
          <input name="code" placeholder="Code (DWIN)" required />
          <input name="name" placeholder="Name" required />
          <button type="submit">Add building</button>
        </form>
        <ul className="catalog-list">
          {buildings.map((building) => (
            <li key={building.id}>
              <strong>{building.code}</strong> {building.name}
              <button
                type="button"
                onClick={() =>
                  void withError(async () => {
                    await deleteBuilding(building.id);
                    setToast("Soft-deleted building");
                  })
                }
              >
                Deactivate
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="catalog-section">
        <h2>Floors</h2>
        <form
          className="catalog-form"
          onSubmit={(submit) => {
            submit.preventDefault();
            const form = submit.currentTarget;
            const data = new FormData(form);
            void withError(async () => {
              await createFloor(String(data.get("buildingId")), {
                label: String(data.get("label")),
                sortOrder: Number(data.get("sortOrder"))
              });
              form.reset();
              setToast("Created floor");
            });
          }}
        >
          <select name="buildingId" required defaultValue="">
            <option value="" disabled>
              Building
            </option>
            {buildings.map((building) => (
              <option key={building.id} value={building.id}>
                {building.code}
              </option>
            ))}
          </select>
          <input name="label" placeholder="Label (1)" required />
          <input name="sortOrder" type="number" placeholder="Sort" required />
          <button type="submit">Add floor</button>
        </form>
        <ul className="catalog-list">
          {floors.map((floor) => {
            const building = buildings.find((item) => item.id === floor.buildingId);
            return (
              <li key={floor.id}>
                {building?.code ?? "?"} · F{floor.label}
                <button
                  type="button"
                  onClick={() =>
                    void withError(async () => {
                      await deleteFloor(floor.id);
                      setToast("Deleted floor");
                    })
                  }
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="catalog-section">
        <h2>Rooms</h2>
        <form
          className="catalog-form"
          onSubmit={(submit) => {
            submit.preventDefault();
            const form = submit.currentTarget;
            const data = new FormData(form);
            const floorId = String(data.get("floorId") || "");
            void withError(async () => {
              await createRoom({
                buildingId: String(data.get("buildingId")),
                floorId: floorId || null,
                name: String(data.get("name")),
                roomType: String(data.get("roomType")) as Room["roomType"],
                capacity: Number(data.get("capacity")),
                optimalCapacity: Number(data.get("optimalCapacity"))
              });
              form.reset();
              setToast("Created room");
            });
          }}
        >
          <select name="buildingId" required defaultValue="">
            <option value="" disabled>
              Building
            </option>
            {buildings.map((building) => (
              <option key={building.id} value={building.id}>
                {building.code}
              </option>
            ))}
          </select>
          <select name="floorId" defaultValue="">
            <option value="">No floor</option>
            {floors.map((floor) => {
              const building = buildings.find((item) => item.id === floor.buildingId);
              return (
                <option key={floor.id} value={floor.id}>
                  {building?.code} F{floor.label}
                </option>
              );
            })}
          </select>
          <input name="name" placeholder="Number (155)" required />
          <select name="roomType" defaultValue="small">
            <option value="auditorium">auditorium</option>
            <option value="large">large</option>
            <option value="small">small</option>
          </select>
          <input name="capacity" type="number" placeholder="Capacity" required />
          <input name="optimalCapacity" type="number" placeholder="Optimal" required />
          <button type="submit">Add room</button>
        </form>
        <ul className="catalog-list">
          {rooms.map((room) => {
            const building = buildings.find((item) => item.id === room.buildingId);
            return (
              <li key={room.id}>
                {building?.code}
                {room.name} · {room.roomType} · {room.capacity}
                <button
                  type="button"
                  onClick={() =>
                    void withError(async () => {
                      await deleteRoom(room.id);
                      setToast("Soft-deleted room");
                    })
                  }
                >
                  Deactivate
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {event ? (
        <section className="catalog-section">
          <h2>Event</h2>
          <form
            className="catalog-form"
            onSubmit={(submit) => {
              submit.preventDefault();
              const data = new FormData(submit.currentTarget);
              void withError(async () => {
                await patchEvent(event.id, {
                  name: String(data.get("name")),
                  eventDate: String(data.get("eventDate")),
                  timezone: String(data.get("timezone")),
                  slotMinutes: Number(data.get("slotMinutes")),
                  gridStart: String(data.get("gridStart")),
                  gridEnd: String(data.get("gridEnd"))
                });
                setToast("Updated event");
              });
            }}
          >
            <input name="name" defaultValue={event.name} />
            <input name="eventDate" type="date" defaultValue={event.eventDate} />
            <input name="timezone" defaultValue={event.timezone} />
            <input name="slotMinutes" type="number" defaultValue={event.slotMinutes} />
            <input name="gridStart" defaultValue={event.gridStart} />
            <input name="gridEnd" defaultValue={event.gridEnd} />
            <button type="submit">Save event</button>
          </form>

          <h3>Activities</h3>
          <form
            className="catalog-form"
            onSubmit={(submit) => {
              submit.preventDefault();
              const form = submit.currentTarget;
              const data = new FormData(form);
              void withError(async () => {
                await createActivity(event.id, {
                  name: String(data.get("name")),
                  color: String(data.get("color")),
                  defaultDurationMin: Number(data.get("defaultDurationMin"))
                });
                form.reset();
                setToast("Created activity");
              });
            }}
          >
            <input name="name" placeholder="Name" required />
            <input name="color" type="color" defaultValue="#ffcc80" />
            <input name="defaultDurationMin" type="number" placeholder="Minutes" required />
            <button type="submit">Add activity</button>
          </form>
          <ul className="catalog-list">
            {event.activities.map((activity) => (
              <li key={activity.id}>
                {activity.name}
                <button
                  type="button"
                  onClick={() =>
                    void withError(async () => {
                      await deleteActivity(activity.id);
                      setToast("Deleted activity");
                    })
                  }
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>

          <h3>Time blocks</h3>
          <form
            className="catalog-form"
            onSubmit={(submit) => {
              submit.preventDefault();
              const form = submit.currentTarget;
              const data = new FormData(form);
              void withError(async () => {
                await createTimeBlock(event.id, {
                  label: String(data.get("label")),
                  startTime: String(data.get("startTime")),
                  endTime: String(data.get("endTime")),
                  color: String(data.get("color"))
                });
                form.reset();
                setToast("Created time block");
              });
            }}
          >
            <input name="label" placeholder="Label" required />
            <input name="startTime" type="time" required />
            <input name="endTime" type="time" required />
            <input name="color" type="color" defaultValue="#e5e7eb" />
            <button type="submit">Add time block</button>
          </form>
          <ul className="catalog-list">
            {event.timeBlocks.map((block) => (
              <li key={block.id}>
                {block.label} {block.startTime}–{block.endTime}
                <button
                  type="button"
                  onClick={() =>
                    void withError(async () => {
                      await deleteTimeBlock(block.id);
                      setToast("Deleted time block");
                    })
                  }
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

export default Catalog;
