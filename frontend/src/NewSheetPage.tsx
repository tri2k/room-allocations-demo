import { FormEvent, useEffect, useMemo, useState } from "react";
import AppNav from "./AppNav";
import { ApiError, createSheet, getEvent, listBuildings, listFloors, listRooms } from "./lib/api";
import type { Building, EventInfo, Floor, Room } from "./types/schedule";

type DraftActivity = { name: string; color: string; defaultDurationMin: number };

function NewSheetPage({ eventId }: { eventId: string }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [title, setTitle] = useState("Untitled");
  const [picked, setPicked] = useState<string[]>([]);
  const [activities, setActivities] = useState<DraftActivity[]>([]);
  const [planDate, setPlanDate] = useState("");
  const [timezone, setTimezone] = useState("America/Los_Angeles");
  const [slotMinutes, setSlotMinutes] = useState(15);
  const [gridStart, setGridStart] = useState("07:00");
  const [gridEnd, setGridEnd] = useState("16:15");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const nextEvent = await getEvent(eventId);
        setEvent(nextEvent);
        setPlanDate(nextEvent.eventDate ?? "");
        setTimezone(nextEvent.timezone);
        setSlotMinutes(nextEvent.slotMinutes);
        setGridStart(nextEvent.gridStart);
        setGridEnd(nextEvent.gridEnd);
        const nextBuildings = await listBuildings();
        setBuildings(nextBuildings.filter((building) => building.isActive !== false));
        const nextFloors: Floor[] = [];
        for (const building of nextBuildings) {
          nextFloors.push(...(await listFloors(building.id)));
        }
        setFloors(nextFloors);
        setRooms((await listRooms({ isActive: true })).filter((room) => room.isActive !== false));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load catalog");
      }
    })();
  }, [eventId]);

  const roomsByBuilding = useMemo(() => {
    return buildings.map((building) => ({
      building,
      rooms: rooms.filter((room) => room.buildingId === building.id)
    }));
  }, [buildings, rooms]);

  const toggleRoom = (roomId: string) => {
    setPicked((current) => (current.includes(roomId) ? current.filter((id) => id !== roomId) : [...current, roomId]));
  };

  const selectBuilding = (buildingId: string, on: boolean) => {
    const ids = rooms.filter((room) => room.buildingId === buildingId).map((room) => room.id);
    setPicked((current) => {
      const without = current.filter((id) => !ids.includes(id));
      return on ? [...without, ...ids] : without;
    });
  };

  const onCreate = async (submit: FormEvent) => {
    submit.preventDefault();
    setBusy(true);
    setError("");
    try {
      const sheet = await createSheet(eventId, {
        title,
        includedRoomIds: picked,
        planDate: planDate || undefined,
        timezone,
        slotMinutes,
        gridStart,
        gridEnd,
        activities: activities.filter((item) => item.name.trim().length > 0)
      });
      window.location.hash = `#/sheets/${sheet.id}`;
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "Could not create sheet");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app catalog-app">
      <header className="topbar">
        <div>
          <h1>New sheet{event ? ` · ${event.name}` : ""}</h1>
          <p>Pick rooms, optionally add activities, then confirm the clock.</p>
        </div>
        <AppNav current="events" />
      </header>

      {error ? <p className="catalog-error">{error}</p> : null}

      <p className="login-hint">Step {step} of 3</p>

      {step === 1 ? (
        <section className="catalog-section">
          <h2>Title and rooms</h2>
          <label className="login-dev-form">
            Title
            <input value={title} onChange={(change) => setTitle(change.target.value)} />
          </label>
          {roomsByBuilding.map(({ building, rooms: buildingRooms }) => (
            <div key={building.id} className="sheet-picker-building">
              <label>
                <input
                  type="checkbox"
                  checked={buildingRooms.length > 0 && buildingRooms.every((room) => picked.includes(room.id))}
                  onChange={(change) => selectBuilding(building.id, change.target.checked)}
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
                          checked={picked.includes(room.id)}
                          onChange={() => toggleRoom(room.id)}
                        />{" "}
                        {building.code}
                        {room.name}
                        {floor ? ` · floor ${floor.label}` : ""} · {room.roomType}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <button
            type="button"
            className="reset-button"
            disabled={picked.length === 0}
            onClick={() => setStep(2)}
          >
            Continue
          </button>
          <a className="reset-button" href={`#/events/${eventId}/sheets`}>
            Cancel
          </a>
          {picked.length === 0 ? <p className="login-hint">Pick at least one room.</p> : null}
        </section>
      ) : null}

      {step === 2 ? (
        <section className="catalog-section">
          <h2>Activities (optional)</h2>
          <form
            className="catalog-form"
            onSubmit={(submit) => {
              submit.preventDefault();
              const data = new FormData(submit.currentTarget);
              setActivities((current) => [
                ...current,
                {
                  name: String(data.get("name")),
                  color: String(data.get("color")),
                  defaultDurationMin: Number(data.get("defaultDurationMin"))
                }
              ]);
              submit.currentTarget.reset();
            }}
          >
            <input name="name" placeholder="Name" required />
            <input name="color" type="color" defaultValue="#ffcc80" />
            <input name="defaultDurationMin" type="number" placeholder="Minutes" required />
            <button type="submit">Add</button>
          </form>
          <ul className="catalog-list">
            {activities.map((activity, index) => (
              <li key={`${activity.name}-${index}`}>
                {activity.name} ({activity.defaultDurationMin} min)
                <button type="button" onClick={() => setActivities((current) => current.filter((_, i) => i !== index))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="topbar-actions">
            <button type="button" className="reset-button" onClick={() => setStep(1)}>
              Back
            </button>
            <button type="button" className="reset-button" onClick={() => setStep(3)}>
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="catalog-section">
          <h2>Clock</h2>
          <form className="catalog-form" onSubmit={(submit) => void onCreate(submit)}>
            <input type="date" value={planDate} onChange={(change) => setPlanDate(change.target.value)} required={!event?.eventDate} />
            <input value={timezone} onChange={(change) => setTimezone(change.target.value)} required />
            <select value={slotMinutes} onChange={(change) => setSlotMinutes(Number(change.target.value))}>
              <option value={5}>5 min</option>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
            </select>
            <input type="time" value={gridStart} onChange={(change) => setGridStart(change.target.value)} required />
            <input type="time" value={gridEnd} onChange={(change) => setGridEnd(change.target.value)} required />
            <button type="button" className="reset-button" onClick={() => setStep(2)}>
              Back
            </button>
            <button type="submit" disabled={busy || picked.length === 0}>
              {busy ? "Creating…" : "Create sheet"}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

export default NewSheetPage;
