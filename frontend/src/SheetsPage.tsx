import { useEffect, useState } from "react";
import AppNav from "./AppNav";
import { ApiError, deleteSheet, getEvent, listSheets } from "./lib/api";
import type { EventInfo, SheetInfo } from "./types/schedule";

function SheetsPage({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = async () => {
    setEvent(await getEvent(eventId));
    setSheets(await listSheets(eventId));
  };

  useEffect(() => {
    void load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to load sheets");
    });
  }, [eventId]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  return (
    <div className="app catalog-app">
      <header className="topbar">
        <div>
          <h1>{event ? `${event.name} sheets` : "Sheets"}</h1>
          <p>Your private plans for this event. Other people cannot see these.</p>
        </div>
        <AppNav current="events" />
      </header>

      {error ? <p className="catalog-error">{error}</p> : null}

      <section className="catalog-section">
        <h2>Your plans</h2>
        <div className="topbar-actions" style={{ marginBottom: 12 }}>
          <a className="reset-button" href={`#/events/${eventId}/sheets/new`}>
            New sheet
          </a>
          <a className="reset-button" href="#/events">
            Event defaults
          </a>
        </div>
        {sheets.length === 0 ? <p>No plans yet. Create a sheet to open the grid.</p> : null}
        <ul className="catalog-list">
          {sheets.map((sheet) => (
            <li key={sheet.id}>
              <a className="event-pick" href={`#/sheets/${sheet.id}`}>
                <strong>{sheet.title}</strong> · {sheet.planDate} · {sheet.slotMinutes} min slots
              </a>
              <a className="reset-button" href={`#/sheets/${sheet.id}/settings`}>
                Settings
              </a>
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      await deleteSheet(sheet.id);
                      setToast("Deleted sheet");
                      await load();
                    } catch (err) {
                      setError(err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "Delete failed");
                    }
                  })();
                }}
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

export default SheetsPage;
