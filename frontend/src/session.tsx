import { createContext, useContext } from "react";
import type { AuthUser } from "./lib/api";

export type SessionValue = {
  user: AuthUser;
  signOut: () => Promise<void>;
};

export const SessionContext = createContext<SessionValue | null>(null);

export const useSession = (): SessionValue => {
  const value = useContext(SessionContext);
  if (value === null) {
    throw new Error("useSession must be used while signed in");
  }
  return value;
};
