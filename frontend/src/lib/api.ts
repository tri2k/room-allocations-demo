import type { Activity, Allocation, Building, EventInfo, Floor, Room, ScheduleState, TimeBlock } from "../types/schedule";

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = typeof body?.detail === "string" ? body.detail : `Request failed (${response.status})`;
    throw new ApiError(response.status, detail);
  }
  return body as T;
};

export type Warning = { code: string; message: string };

export type AllocationWrite = {
  allocation: Allocation;
  warnings: Warning[];
};

export type BulkAllocationWrite = {
  created: string[];
  skipped: Array<{ roomId: string; reason: string }>;
  warnings: Warning[];
};

const EVENT_KEY = "room-allocations-demo:eventId";

export const listEvents = (): Promise<EventInfo[]> => request("/api/v1/events");

export const getSchedule = (eventId: string): Promise<ScheduleState> =>
  request(`/api/v1/events/${eventId}/schedule`);

export const setActiveEventId = (eventId: string): void => {
  localStorage.setItem(EVENT_KEY, eventId);
};

export const loadActiveSchedule = async (): Promise<ScheduleState | null> => {
  const events = await listEvents();
  if (events.length === 0) return null;
  const stored = localStorage.getItem(EVENT_KEY);
  const chosen = events.find((event) => event.id === stored) ?? events[0];
  setActiveEventId(chosen.id);
  return getSchedule(chosen.id);
};

export const createEvent = (body: {
  name: string;
  eventDate: string;
  timezone: string;
  slotMinutes?: number;
  gridStart?: string;
  gridEnd?: string;
}): Promise<EventInfo> => request("/api/v1/events", { method: "POST", body: JSON.stringify(body) });

export const createAllocation = (
  eventId: string,
  body: { roomId: string; activityId: string; startAt: string; endAt: string; notes?: string }
): Promise<AllocationWrite> =>
  request(`/api/v1/events/${eventId}/allocations`, { method: "POST", body: JSON.stringify(body) });

export const bulkCreateAllocations = (
  eventId: string,
  body: { roomIds: string[]; activityId: string; startAt: string; endAt: string; notes?: string }
): Promise<BulkAllocationWrite> =>
  request(`/api/v1/events/${eventId}/allocations/bulk`, { method: "POST", body: JSON.stringify(body) });

export const patchAllocation = (
  allocationId: string,
  body: { roomId?: string; startAt?: string; endAt?: string; notes?: string }
): Promise<AllocationWrite> =>
  request(`/api/v1/allocations/${allocationId}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteAllocation = (allocationId: string): Promise<void> =>
  request(`/api/v1/allocations/${allocationId}`, { method: "DELETE" });

export const reseed = (): Promise<EventInfo> => request("/api/v1/dev/reseed", { method: "POST" });

export const listBuildings = (): Promise<Building[]> => request("/api/v1/buildings");
export const createBuilding = (body: { code: string; name: string }): Promise<Building> =>
  request("/api/v1/buildings", { method: "POST", body: JSON.stringify(body) });
export const patchBuilding = (id: string, body: Partial<Building>): Promise<Building> =>
  request(`/api/v1/buildings/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteBuilding = (id: string): Promise<Building> =>
  request(`/api/v1/buildings/${id}`, { method: "DELETE" });

export const listFloors = (buildingId: string): Promise<Floor[]> =>
  request(`/api/v1/buildings/${buildingId}/floors`);
export const createFloor = (buildingId: string, body: { label: string; sortOrder: number }): Promise<Floor> =>
  request(`/api/v1/buildings/${buildingId}/floors`, { method: "POST", body: JSON.stringify(body) });
export const deleteFloor = (id: string): Promise<void> => request(`/api/v1/floors/${id}`, { method: "DELETE" });

export const listRooms = (params?: { buildingId?: string; floorId?: string; isActive?: boolean }): Promise<Room[]> => {
  const search = new URLSearchParams();
  if (params?.buildingId) search.set("buildingId", params.buildingId);
  if (params?.floorId) search.set("floorId", params.floorId);
  if (params?.isActive !== undefined) search.set("isActive", String(params.isActive));
  const suffix = search.toString() ? `?${search}` : "";
  return request(`/api/v1/rooms${suffix}`);
};

export const createRoom = (body: {
  buildingId: string;
  floorId: string | null;
  name: string;
  roomType: Room["roomType"];
  capacity: number;
  optimalCapacity: number;
}): Promise<Room> => request("/api/v1/rooms", { method: "POST", body: JSON.stringify(body) });

export const patchRoom = (id: string, body: Partial<Room>): Promise<Room> =>
  request(`/api/v1/rooms/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteRoom = (id: string): Promise<Room> => request(`/api/v1/rooms/${id}`, { method: "DELETE" });

export type EventDetail = EventInfo & { activities: Activity[]; timeBlocks: TimeBlock[] };

export const getEvent = (id: string): Promise<EventDetail> => request(`/api/v1/events/${id}`);
export const patchEvent = (id: string, body: Partial<EventInfo>): Promise<EventInfo> =>
  request(`/api/v1/events/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const createActivity = (
  eventId: string,
  body: { name: string; color: string; defaultDurationMin: number }
): Promise<Activity> =>
  request(`/api/v1/events/${eventId}/activities`, { method: "POST", body: JSON.stringify(body) });

export const patchActivity = (id: string, body: Partial<Activity>): Promise<Activity> =>
  request(`/api/v1/activities/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteActivity = (id: string): Promise<void> =>
  request(`/api/v1/activities/${id}`, { method: "DELETE" });

export const createTimeBlock = (
  eventId: string,
  body: { label: string; startTime: string; endTime: string; color?: string }
): Promise<TimeBlock> =>
  request(`/api/v1/events/${eventId}/time-blocks`, { method: "POST", body: JSON.stringify(body) });

export const deleteTimeBlock = (id: string): Promise<void> =>
  request(`/api/v1/time-blocks/${id}`, { method: "DELETE" });
