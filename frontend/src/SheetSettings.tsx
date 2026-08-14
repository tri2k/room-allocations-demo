import { useEffect, useMemo, useState } from "react";
import AppNav from "./AppNav";
import {
  ApiError,
  createActivity,
  createTimeBlock,
  deleteActivity,
  deleteTimeBlock,
  getSchedule,
  listBuildings,
  listFloors,
  listRooms,
  patchSheet
} from "./lib/api";
import type { Building, Floor, Room, ScheduleState } from "./types/schedule";

function SheetSettings({ sheetId }: { sheetId: string }) {
  const [state, setState] = useState<ScheduleState | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [catalogRooms, setCatalogRooms] = useState<Room[]>([]);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [pickedRooms, setPickedRooms] = useState<string[]>([]);

  const load = async () => {
    const next = await getSchedule(sheetId);
    setState(next);
    const nextBuildings = await listBuildings();
    setBuildings(nextBuildings);
    const nextFloors: Floor[] = [];
    for (const building of nextBuildings) {
      nextFloors.push(...(await listFloors(building.id)));
    }
    setFloors(nextFloors);
    setCatalogRooms(await listRooms());
  };

  useEffect(() => {
    void load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to load sheet");
    });
  }, [sheetId]);

  useEffect(() => {
    setPickedRooms(state?.sheet.includedRoomIds ?? []);
  }, [state]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const withError = async (action: () => Promise<void>) => {
    try {
      setError("");
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "Request failed");
    }
  };

  const pickerRooms = useMemo(() => {
    const included = new Set(state?.sheet.includedRoomIds ?? []);
    return catalogRooms.filter((room) => room.isActive !== false || included.has(room.id));
  }, [catalogRooms, state]);

  if (!state) {
    return (
      <div className="boot-screen">
        <p>Loading settings…</p>
        {error ? <p className="catalog-error">{error}</p> : null}
      </div>
    );
  }

  const { sheet, event, activities, timeBlocks } = state;

  return (
    <div className="app catalog-app">
      <header className="topbar">
        <div>
          <h1>{sheet.title} settings</h1>
          <p>
            {event.name}. Changes apply to this sheet only.
          </p>
        </div>
        <AppNav
          current="schedule"
          extra={
            <>
              <a className="reset-button" href={`#/events/${event.id}/sheets`}>
                Sheets
              </a>
              <a className="reset-button" href={`#/sheets/${sheet.id}`}>
                Grid
              </a>
            </>
          }
        />
      </header>

      {error ? <p className="catalog-error">{error}</p> : null}

      <section className="catalog-section">
        <h2>Sheet</h2>
        <form
          className="catalog-form"
          onSubmit={(submit) => {
            submit.preventDefault();
            const data = new FormData(submit.currentTarget);
            void withError(async () => {
              await patchSheet(sheet.id, {
                title: String(data.get("title")),
                planDate: String(data.get("planDate")),
                timezone: String(data.get("timezone")),
                slotMinutes: Number(data.get("slotMinutes")),
                gridStart: String(data.get("gridStart")),
                gridEnd: String(data.get("gridEnd"))
              });
              setToast("Saved sheet");
              await load();
            });
          }}
        >
          <input name="title" defaultValue={sheet.title} key={`${sheet.id}-title`} />
          <input name="planDate" type="date" defaultValue={sheet.planDate} key={`${sheet.id}-date`} />
          <input name="timezone" defaultValue={sheet.timezone} key={`${sheet.id}-tz`} />
          <input name="slotMinutes" type="number" defaultValue={sheet.slotMinutes} key={`${sheet.id}-slot`} />
          <input name="gridStart" defaultValue={sheet.gridStart} key={`${sheet.id}-start`} />
          <input name="gridEnd" defaultValue={sheet.gridEnd} key={`${sheet.id}-end`} />
          <button type="submit">Save</button>
        </form>
      </section>

      <section className="catalog-section">
        <h2>Rooms on this sheet</h2>
        <form
          className="catalog-form"
          onSubmit={(submit) => {
            submit.preventDefault();
            if (pickedRooms.length === 0) {
              setError("Keep at least one room.");
              return;
            }
            const removed = sheet.includedRoomIds.filter((id) => !pickedRooms.includes(id));
            if (removed.length > 0) {
              const blocking = state.allocations.filter((allocation) => removed.includes(allocation.roomId));
              if (blocking.length > 0) {
                setError("Remove allocations from a room before dropping it from the sheet.");
                return;
              }
            }
            void withError(async () => {
              await patchSheet(sheet.id, { includedRoomIds: pickedRooms });
              setToast("Updated rooms");
              await load();
            });
          }}
        >
          {buildings.map((building) => {
            const buildingRooms = pickerRooms.filter((room) => room.buildingId === building.id);
            if (buildingRooms.length === 0) return null;
            const allSelected = buildingRooms.every((room) => pickedRooms.includes(room.id));
            return (
              <div key={building.id} className="sheet-picker-building">
                <label>
                  <input
                    type="checkbox"
                    checked={allSelected && buildingRooms.length > 0}
                    onChange={(change) => {
                      const ids = buildingRooms.map((room) => room.id);
                      setPickedRooms((current) => {
                        const without = current.filter((id) => !ids.includes(id));
                        return change.target.checked ? [...without, ...ids] : without;
                      });
                    }}
                  />{" "}
                  {building.code} {building.name} (select all)
                </label>
                <ul className="catalog-list">
                  {buildingRooms.map((room) => {
                    const floor = floors.find((item) => item.id === room.floorId);
                    return (
                      <li key={room.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={pickedRooms.includes(room.id)}
                            onChange={() =>
                              setPickedRooms((current) =>
                                current.includes(room.id)
                                  ? current.filter((id) => id !== room.id)
                                  : [...current, room.id]
                              )
                            }
                          />{" "}
                          {building.code}
                          {room.name}
                          {floor ? ` · floor ${floor.label}` : ""}
                          {room.isActive === false ? " (inactive)" : ""}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          <button type="submit">Save rooms</button>
        </form>
      </section>

      <section className="catalog-section">
        <h2>Activities</h2>
        <form
          className="catalog-form"
          onSubmit={(submit) => {
            submit.preventDefault();
            const form = submit.currentTarget;
            const data = new FormData(form);
            void withError(async () => {
              await createActivity(sheet.id, {
                name: String(data.get("name")),
                color: String(data.get("color")),
                defaultDurationMin: Number(data.get("defaultDurationMin"))
              });
              form.reset();
              setToast("Created activity");
              await load();
            });
          }}
        >
          <input name="name" placeholder="Name" required />
          <input name="color" type="color" defaultValue="#ffcc80" />
          <input name="defaultDurationMin" type="number" placeholder="Minutes" required />
          <button type="submit">Add activity</button>
        </form>
        <ul className="catalog-list">
          {activities.map((activity) => (
            <li key={activity.id}>
              {activity.name}
              <button
                type="button"
                onClick={() =>
                  void withError(async () => {
                    await deleteActivity(activity.id);
                    setToast("Deleted activity");
                    await load();
                  })
                }
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="catalog-section">
        <h2>Time blocks</h2>
        <form
          className="catalog-form"
          onSubmit={(submit) => {
            submit.preventDefault();
            const form = submit.currentTarget;
            const data = new FormData(form);
            void withError(async () => {
              await createTimeBlock(sheet.id, {
                label: String(data.get("label")),
                startTime: String(data.get("startTime")),
                endTime: String(data.get("endTime")),
                color: String(data.get("color"))
              });
              form.reset();
              setToast("Created time block");
              await load();
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
          {timeBlocks.map((block) => (
            <li key={block.id}>
              {block.label} {block.startTime}–{block.endTime}
              <button
                type="button"
                onClick={() =>
                  void withError(async () => {
                    await deleteTimeBlock(block.id);
                    setToast("Deleted time block");
                    await load();
                  })
                }
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

export default SheetSettings;
