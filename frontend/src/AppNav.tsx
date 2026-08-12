type AppNavProps = {
  current: "schedule" | "event" | "catalog";
};

function AppNav({ current }: AppNavProps) {
  return (
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
  );
}

export default AppNav;
