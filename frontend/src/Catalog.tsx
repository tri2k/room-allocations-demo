import { useEffect, useState } from "react";
import AppNav from "./AppNav";
import {
  ApiError,
  createBuilding,
  createFloor,
  createRoom,
  deleteBuilding,
  deleteFloor,
  deleteRoom,
  listBuildings,
  listFloors,
  listRooms
} from "./lib/api";
import type { Building, Floor, Room } from "./types/schedule";

function Catalog() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
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
  };

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to load catalog");
    });
  }, []);

  const withError = async (action: () => Promise<void>) => {
    try {
      setError("");
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
          <p>Reusable venue spaces: buildings, floors, and rooms.</p>
        </div>
        <AppNav current="catalog" />
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

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

export default Catalog;
