export type RoomType = "auditorium" | "small" | "large";

export type Building = {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
};

export type Floor = {
  id: string;
  buildingId: string;
  label: string;
  sortOrder: number;
};

export type Room = {
  id: string;
  buildingId: string;
  floorId: string | null;
  name: string;
  roomType: RoomType;
  capacity: number;
  optimalCapacity: number;
  sortOrder?: number;
  isActive?: boolean;
};

export type Activity = {
  id: string;
  name: string;
  color: string;
  defaultDurationMin: number;
  allowedRoomTypes?: string[];
};

export type TimeBlock = {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  color?: string;
};

export type Allocation = {
  id: string;
  roomId: string;
  activityId: string;
  startAt: string;
  endAt: string;
  notes?: string;
};

export type EventInfo = {
  id: string;
  name: string;
  eventDate: string;
  timezone: string;
  slotMinutes: number;
  gridStart: string;
  gridEnd: string;
};

export type ScheduleState = {
  event: EventInfo;
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  activities: Activity[];
  timeBlocks: TimeBlock[];
  allocations: Allocation[];
};
