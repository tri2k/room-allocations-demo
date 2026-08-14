export type AppPage = "login" | "catalog" | "event" | "schedule";

export const pageFromHash = (hash: string): AppPage => {
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  const path = (trimmed.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  if (path === "/login") return "login";
  if (path === "/catalog") return "catalog";
  if (path === "/event") return "event";
  return "schedule";
};
