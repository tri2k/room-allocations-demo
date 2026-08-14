import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Catalog from "./Catalog";
import EventPage from "./EventPage";
import Login from "./Login";
import { ApiError, getMe, logout, setUnauthorizedHandler, type AuthUser } from "./lib/api";
import { pageFromHash } from "./lib/hash";
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

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      if (pageFromHash(window.location.hash) !== "login") {
        window.location.hash = "#/login";
      }
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const page = pageFromHash(hash);

  useEffect(() => {
    if (boot !== "ready") return;
    if (user === null && page !== "login") {
      window.location.hash = "#/login";
    } else if (user !== null && page === "login") {
      window.location.hash = "#/";
    }
  }, [boot, user, page]);

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
    return <Login onSignedIn={setUser} />;
  }

  return (
    <SessionContext.Provider value={{ user, signOut }}>
      {page === "catalog" ? <Catalog /> : page === "event" ? <EventPage /> : <App />}
    </SessionContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
