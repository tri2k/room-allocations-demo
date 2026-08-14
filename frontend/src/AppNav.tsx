import type { ReactNode } from "react";
import { useSession } from "./session";

type AppNavProps = {
  current: "events" | "catalog" | "schedule";
  extra?: ReactNode;
};

function AppNav({ current, extra }: AppNavProps) {
  const { user, signOut } = useSession();
  return (
    <div className="topbar-actions">
      <nav className="app-nav">
        <a className={current === "events" ? "reset-button is-current" : "reset-button"} href="#/events">
          Events
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
