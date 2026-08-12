const toMinutes = (value: string): number => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const pad = (n: number): string => n.toString().padStart(2, "0");

const minutesToHHmm = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${pad(h)}:${pad(m)}`;
};

export const getSlotCount = (start: string, end: string, slotMinutes: number): number =>
  Math.floor((toMinutes(end) - toMinutes(start)) / slotMinutes);

export const slotToTime = (gridStart: string, slotMinutes: number, slotIndex: number): string =>
  minutesToHHmm(toMinutes(gridStart) + slotIndex * slotMinutes);

export const timeToSlot = (gridStart: string, slotMinutes: number, timeHHmm: string): number =>
  Math.floor((toMinutes(timeHHmm) - toMinutes(gridStart)) / slotMinutes);

export const allocationStartSlot = (
  _eventDate: string,
  gridStart: string,
  slotMinutes: number,
  iso: string
): number => {
  const hhmm = iso.slice(11, 16);
  return timeToSlot(gridStart, slotMinutes, hhmm);
};

export const buildIso = (eventDate: string, hhmm: string): string =>
  `${eventDate}T${hhmm}:00`;

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const formatTimeLabel = (hhmm: string): string => {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const meridiem = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${pad(minutes)} ${meridiem}`;
};
