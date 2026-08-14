export type AppRoute =
  | { name: "login" }
  | { name: "catalog" }
  | { name: "events" }
  | { name: "eventSheets"; eventId: string }
  | { name: "newSheet"; eventId: string }
  | { name: "sheet"; sheetId: string }
  | { name: "sheetSettings"; sheetId: string };

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

const pathFromHash = (hash: string): string => {
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  return (trimmed.split("?")[0] || "/").replace(/\/+$/, "") || "/";
};

export const parseHash = (hash: string): AppRoute => {
  const path = pathFromHash(hash);
  if (path === "/login") return { name: "login" };
  if (path === "/catalog") return { name: "catalog" };
  if (path === "/events" || path === "/event" || path === "/") return { name: "events" };
  const newSheet = path.match(new RegExp(`^/events/(${UUID})/sheets/new$`));
  if (newSheet) return { name: "newSheet", eventId: newSheet[1] };
  const sheets = path.match(new RegExp(`^/events/(${UUID})/sheets$`));
  if (sheets) return { name: "eventSheets", eventId: sheets[1] };
  const settings = path.match(new RegExp(`^/sheets/(${UUID})/settings$`));
  if (settings) return { name: "sheetSettings", sheetId: settings[1] };
  const sheet = path.match(new RegExp(`^/sheets/(${UUID})$`));
  if (sheet) return { name: "sheet", sheetId: sheet[1] };
  return { name: "events" };
};
