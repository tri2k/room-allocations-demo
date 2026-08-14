import { useEffect, useState } from "react";
import AppNav from "./AppNav";
import { ApiError, createEvent, getEvent, listEvents, patchEvent, setActiveEventId } from "./lib/api";
import type { EventInfo } from "./types/schedule";

function EventPage() {
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [selected, setSelected] = useState<EventInfo | null>(null);
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

  return (
    <div className="app catalog-app">
      <header className="topbar">
        <div>
          <h1>Events</h1>
          <p>Occasion labels. Clock fields here are defaults for new sheets only.</p>
        </div>
        <AppNav current="events" />
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
                eventDate: String(data.get("eventDate")) || null,
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
          <input name="eventDate" type="date" />
          <input name="timezone" defaultValue="America/Los_Angeles" required />
          <input name="slotMinutes" type="number" defaultValue={15} required />
          <input name="gridStart" type="time" defaultValue="07:00" required />
          <input name="gridEnd" type="time" defaultValue="16:15" required />
          <button type="submit">Create event</button>
        </form>
        {events.length === 0 ? <p>No events yet. Create one above, or Reset from a sheet after seeding.</p> : null}
        <ul className="catalog-list">
          {events.map((event) => (
            <li key={event.id}>
              <a
                className={selected?.id === event.id ? "event-pick is-current" : "event-pick"}
                href={`#/events/${event.id}/sheets`}
                onClick={() => setActiveEventId(event.id)}
              >
                <strong>{event.name}</strong>
                {event.eventDate ? ` · ${event.eventDate}` : " · no date"}
              </a>
              <button
                type="button"
                className="reset-button"
                onClick={() =>
                  void withError(async () => {
                    setActiveEventId(event.id);
                    setSelected(await getEvent(event.id));
                  })
                }
              >
                Defaults
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selected ? (
        <section className="catalog-section">
          <h2>{selected.name} defaults</h2>
          <form
            className="catalog-form"
            onSubmit={(submit) => {
              submit.preventDefault();
              const data = new FormData(submit.currentTarget);
              void withError(async () => {
                await patchEvent(selected.id, {
                  name: String(data.get("name")),
                  eventDate: String(data.get("eventDate")) || null,
                  timezone: String(data.get("timezone")),
                  slotMinutes: Number(data.get("slotMinutes")),
                  gridStart: String(data.get("gridStart")),
                  gridEnd: String(data.get("gridEnd"))
                });
                setToast("Updated event defaults");
                await load(selected.id);
              });
            }}
          >
            <input name="name" defaultValue={selected.name} key={`${selected.id}-name`} />
            <input
              name="eventDate"
              type="date"
              defaultValue={selected.eventDate ?? ""}
              key={`${selected.id}-date`}
            />
            <input name="timezone" defaultValue={selected.timezone} key={`${selected.id}-tz`} />
            <input name="slotMinutes" type="number" defaultValue={selected.slotMinutes} key={`${selected.id}-slot`} />
            <input name="gridStart" defaultValue={selected.gridStart} key={`${selected.id}-start`} />
            <input name="gridEnd" defaultValue={selected.gridEnd} key={`${selected.id}-end`} />
            <button type="submit">Save defaults</button>
            <a className="reset-button" href={`#/events/${selected.id}/sheets`}>
              Your sheets
            </a>
            <a className="reset-button" href={`#/events/${selected.id}/sheets/new`}>
              New sheet
            </a>
          </form>
          <p className="login-hint">Changing defaults does not rewrite sheets you already created.</p>
        </section>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

export default EventPage;
