import { useEffect, useState } from "react";
import AppNav from "./AppNav";
import {
  ApiError,
  createActivity,
  createEvent,
  createTimeBlock,
  deleteActivity,
  deleteTimeBlock,
  getEvent,
  listEvents,
  patchEvent,
  setActiveEventId,
  type EventDetail
} from "./lib/api";
import type { EventInfo } from "./types/schedule";

function EventPage() {
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [selected, setSelected] = useState<EventDetail | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = async (preferId?: string) => {
    const nextEvents = await listEvents();
    setEvents(nextEvents);
    const stored = preferId ?? localStorage.getItem("room-allocations-demo:eventId");
    const chosen = nextEvents.find((event) => event.id === stored) ?? nextEvents[0];
    if (!chosen) {
      setSelected(null);
      return;
    }
    setActiveEventId(chosen.id);
    setSelected(await getEvent(chosen.id));
  };

  useEffect(() => {
    void load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to load events");
    });
  }, []);

  const withError = async (action: () => Promise<void>) => {
    try {
      setError("");
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "Request failed");
    }
  };

  const selectEvent = (eventId: string) => {
    void withError(async () => {
      setActiveEventId(eventId);
      setSelected(await getEvent(eventId));
    });
  };

  return (
    <div className="app catalog-app">
      <header className="topbar">
        <div>
          <h1>Event</h1>
          <p>The day you are planning: metadata, activities, and the phase timeline.</p>
        </div>
        <AppNav current="event" />
      </header>

      {error ? <p className="catalog-error">{error}</p> : null}

      <section className="catalog-section">
        <h2>Events</h2>
        <form
          className="catalog-form"
          onSubmit={(submit) => {
            submit.preventDefault();
            const form = submit.currentTarget;
            const data = new FormData(form);
            void withError(async () => {
              const created = await createEvent({
                name: String(data.get("name")),
                eventDate: String(data.get("eventDate")),
                timezone: String(data.get("timezone")),
                slotMinutes: Number(data.get("slotMinutes")),
                gridStart: String(data.get("gridStart")),
                gridEnd: String(data.get("gridEnd"))
              });
              form.reset();
              setToast("Created event");
              await load(created.id);
            });
          }}
        >
          <input name="name" placeholder="Name (BmMT 2026)" required />
          <input name="eventDate" type="date" required />
          <input name="timezone" defaultValue="America/Los_Angeles" required />
          <input name="slotMinutes" type="number" defaultValue={15} required />
          <input name="gridStart" type="time" defaultValue="07:00" required />
          <input name="gridEnd" type="time" defaultValue="16:15" required />
          <button type="submit">Create event</button>
        </form>
        {events.length === 0 ? <p>No events yet. Create one above, or Reset on the schedule to seed the demo.</p> : null}
        <ul className="catalog-list">
          {events.map((event) => (
            <li key={event.id}>
              <button
                type="button"
                className={selected?.id === event.id ? "event-pick is-current" : "event-pick"}
                onClick={() => selectEvent(event.id)}
              >
                <strong>{event.name}</strong> · {event.eventDate}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selected ? (
        <>
          <section className="catalog-section">
            <h2>{selected.name}</h2>
            <form
              className="catalog-form"
              onSubmit={(submit) => {
                submit.preventDefault();
                const data = new FormData(submit.currentTarget);
                void withError(async () => {
                  await patchEvent(selected.id, {
                    name: String(data.get("name")),
                    eventDate: String(data.get("eventDate")),
                    timezone: String(data.get("timezone")),
                    slotMinutes: Number(data.get("slotMinutes")),
                    gridStart: String(data.get("gridStart")),
                    gridEnd: String(data.get("gridEnd"))
                  });
                  setToast("Updated event");
                  await load(selected.id);
                });
              }}
            >
              <input name="name" defaultValue={selected.name} key={`${selected.id}-name`} />
              <input name="eventDate" type="date" defaultValue={selected.eventDate} key={`${selected.id}-date`} />
              <input name="timezone" defaultValue={selected.timezone} key={`${selected.id}-tz`} />
              <input name="slotMinutes" type="number" defaultValue={selected.slotMinutes} key={`${selected.id}-slot`} />
              <input name="gridStart" defaultValue={selected.gridStart} key={`${selected.id}-start`} />
              <input name="gridEnd" defaultValue={selected.gridEnd} key={`${selected.id}-end`} />
              <button type="submit">Save event</button>
              <a className="reset-button" href="#/">
                Open schedule
              </a>
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
                  await createActivity(selected.id, {
                    name: String(data.get("name")),
                    color: String(data.get("color")),
                    defaultDurationMin: Number(data.get("defaultDurationMin"))
                  });
                  form.reset();
                  setToast("Created activity");
                  await load(selected.id);
                });
              }}
            >
              <input name="name" placeholder="Name" required />
              <input name="color" type="color" defaultValue="#ffcc80" />
              <input name="defaultDurationMin" type="number" placeholder="Minutes" required />
              <button type="submit">Add activity</button>
            </form>
            <ul className="catalog-list">
              {selected.activities.map((activity) => (
                <li key={activity.id}>
                  {activity.name}
                  <button
                    type="button"
                    onClick={() =>
                      void withError(async () => {
                        await deleteActivity(activity.id);
                        setToast("Deleted activity");
                        await load(selected.id);
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
                  await createTimeBlock(selected.id, {
                    label: String(data.get("label")),
                    startTime: String(data.get("startTime")),
                    endTime: String(data.get("endTime")),
                    color: String(data.get("color"))
                  });
                  form.reset();
                  setToast("Created time block");
                  await load(selected.id);
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
              {selected.timeBlocks.map((block) => (
                <li key={block.id}>
                  {block.label} {block.startTime}–{block.endTime}
                  <button
                    type="button"
                    onClick={() =>
                      void withError(async () => {
                        await deleteTimeBlock(block.id);
                        setToast("Deleted time block");
                        await load(selected.id);
                      })
                    }
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

export default EventPage;
