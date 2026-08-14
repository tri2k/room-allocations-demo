import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Catalog from "./Catalog";
import EventPage from "./EventPage";
import Login from "./Login";
import NewSheetPage from "./NewSheetPage";
import SheetSettings from "./SheetSettings";
import SheetsPage from "./SheetsPage";
import { ApiError, getMe, logout, setUnauthorizedHandler, type AuthUser } from "./lib/api";
import { parseHash } from "./lib/hash";
import { SessionContext } from "./session";
import "./styles.css";

function Root() {
  const [hash, setHash] = useState(window.location.hash);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [boot, setBoot] = useState<"loading" | "ready" | "error">("loading");
  const [bootMessage, setBootMessage] = useState("");

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    void getMe()
      .then((next) => {
        setUser(next);
        setBoot("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          setUser(null);
          setBoot("ready");
          return;
        }
        setBoot("error");
        setBootMessage(error instanceof Error ? error.message : "Failed to restore session");
      });
  }, []);

  const route = parseHash(hash);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      if (parseHash(window.location.hash).name !== "login") {
        window.location.hash = "#/login";
      }
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (boot !== "ready") return;
    if (user === null && route.name !== "login") {
      window.location.hash = "#/login";
    } else if (user !== null && route.name === "login") {
      window.location.hash = "#/events";
    }
  }, [boot, user, route.name]);

  const signOut = async () => {
    try {
      await logout();
    } catch {
      /* still clear the local session */
    }
    setUser(null);
    window.location.hash = "#/login";
  };

  if (boot === "loading") {
    return (
      <div className="boot-screen">
        <p>Loading…</p>
      </div>
    );
  }

  if (boot === "error") {
    return (
      <div className="boot-screen">
        <h1>Could not reach the API</h1>
        <p>{bootMessage}</p>
      </div>
    );
  }

  if (user === null) {
    return (
      <Login
        onSignedIn={(next) => {
          setUser(next);
          window.location.hash = "#/events";
        }}
      />
    );
  }

  let page = null;
  if (route.name === "catalog") page = <Catalog />;
  else if (route.name === "eventSheets") page = <SheetsPage eventId={route.eventId} />;
  else if (route.name === "newSheet") page = <NewSheetPage eventId={route.eventId} />;
  else if (route.name === "sheet") page = <App sheetId={route.sheetId} />;
  else if (route.name === "sheetSettings") page = <SheetSettings sheetId={route.sheetId} />;
  else page = <EventPage />;

  return <SessionContext.Provider value={{ user, signOut }}>{page}</SessionContext.Provider>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
