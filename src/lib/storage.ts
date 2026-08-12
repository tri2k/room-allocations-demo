import type { ScheduleState } from "../types/schedule";

const STORAGE_KEY = "room-allocations-demo:v1";

export const loadState = (): ScheduleState | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ScheduleState;
  } catch {
    return null;
  }
};

export const saveState = (state: ScheduleState): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const clearState = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};
