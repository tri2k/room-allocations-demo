import type { ReactNode } from "react";
import { useSession } from "./session";

type AppNavProps = {
  current: "schedule" | "event" | "catalog";
  extra?: ReactNode;
};

function AppNav({ current, extra }: AppNavProps) {
  const { user, signOut } = useSession();
  return (
    <div className="topbar-actions">
      <nav className="app-nav">
        <a className={current === "schedule" ? "reset-button is-current" : "reset-button"} href="#/">
          Schedule
        </a>
        <a className={current === "event" ? "reset-button is-current" : "reset-button"} href="#/event">
          Event
        </a>
        <a className={current === "catalog" ? "reset-button is-current" : "reset-button"} href="#/catalog">
          Catalog
        </a>
      </nav>
      {extra}
      <span className="session-email" title={user.email}>
        {user.email}
      </span>
      <button type="button" className="reset-button" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}

export default AppNav;
