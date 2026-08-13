import type { Allocation } from "../types/schedule";
import type { GridSlot } from "./grid";
import { clamp, timeFromIso } from "./time";

export type MergeMeta = {
  isLeader: boolean;
  span: number;
  /** Ordered allocation ids in the run (leaders only). */
  memberIds: string[];
};

export const barrierKey = (leftId: string, rightId: string): string =>
  [leftId, rightId].sort().join("|");

export const allocationTimeKey = (allocation: Allocation): string =>
  `${allocation.activityId}|${timeFromIso(allocation.startAt)}|${timeFromIso(allocation.endAt)}`;

/** Build display-merge metadata: adjacent rooms with same activity + exact times. */
export const buildMergeMeta = (
  gridSlots: GridSlot[],
  allocations: Allocation[],
  barriers: Set<string> = new Set()
): Map<string, MergeMeta> => {
  const meta = new Map<string, MergeMeta>();
  const slotColumns = gridSlots.map((slot) => (slot.type === "room" ? slot.column : null));
  const roomIndexById = new Map<string, number>();
  slotColumns.forEach((column, index) => {
    if (column) roomIndexById.set(column.room.id, index);
  });
  const roomKeyToAllocation = new Map<string, Map<string, Allocation>>();

  for (const column of slotColumns) {
    if (column) roomKeyToAllocation.set(column.room.id, new Map());
  }
  for (const allocation of allocations) {
    if (!roomIndexById.has(allocation.roomId)) continue;
    roomKeyToAllocation.get(allocation.roomId)?.set(allocationTimeKey(allocation), allocation);
  }

  for (const allocation of allocations) {
    const baseIndex = roomIndexById.get(allocation.roomId);
    if (baseIndex === undefined) continue;
    const key = allocationTimeKey(allocation);
    const leftColumn = slotColumns[baseIndex - 1];
    const leftAllocation = leftColumn ? roomKeyToAllocation.get(leftColumn.room.id)?.get(key) : undefined;
    if (leftAllocation && !barriers.has(barrierKey(leftAllocation.id, allocation.id))) {
      meta.set(allocation.id, { isLeader: false, span: 0, memberIds: [] });
      continue;
    }

    const memberIds = [allocation.id];
    let cursor = baseIndex + 1;
    let previousAllocation = allocation;
    while (cursor < slotColumns.length) {
      const nextColumn = slotColumns[cursor];
      if (!nextColumn) break;
      const nextAllocation = roomKeyToAllocation.get(nextColumn.room.id)?.get(key);
      if (!nextAllocation) break;
      if (barriers.has(barrierKey(previousAllocation.id, nextAllocation.id))) break;
      memberIds.push(nextAllocation.id);
      previousAllocation = nextAllocation;
      cursor += 1;
    }
    meta.set(allocation.id, { isLeader: true, span: memberIds.length, memberIds });
  }

  return meta;
};

/** Adjacent same-activity/time rooms that are only separate because of split barriers. */
export const collectBarrierSeparatedGroup = (
  allocationId: string,
  gridSlots: GridSlot[],
  allocations: Allocation[],
  barriers: Set<string>
): Allocation[] | null => {
  const source = allocations.find((allocation) => allocation.id === allocationId);
  if (!source) return null;

  const slotColumns = gridSlots.map((slot) => (slot.type === "room" ? slot.column : null));
  const byRoomId = new Map(allocations.map((allocation) => [allocation.roomId, allocation]));
  const timeKey = allocationTimeKey(source);
  const startIndex = slotColumns.findIndex((column) => column?.room.id === source.roomId);
  if (startIndex === -1) return null;

  let leftIndex = startIndex;
  while (leftIndex > 0) {
    const leftColumn = slotColumns[leftIndex - 1];
    const rightColumn = slotColumns[leftIndex];
    const leftAllocation = leftColumn ? byRoomId.get(leftColumn.room.id) : undefined;
    const rightAllocation = rightColumn ? byRoomId.get(rightColumn.room.id) : undefined;
    if (!leftAllocation || !rightAllocation || allocationTimeKey(leftAllocation) !== timeKey) break;
    if (!barriers.has(barrierKey(leftAllocation.id, rightAllocation.id))) break;
    leftIndex -= 1;
  }

  let rightIndex = startIndex;
  while (rightIndex < slotColumns.length - 1) {
    const leftColumn = slotColumns[rightIndex];
    const rightColumn = slotColumns[rightIndex + 1];
    const leftAllocation = leftColumn ? byRoomId.get(leftColumn.room.id) : undefined;
    const rightAllocation = rightColumn ? byRoomId.get(rightColumn.room.id) : undefined;
    if (!leftAllocation || !rightAllocation || allocationTimeKey(rightAllocation) !== timeKey) break;
    if (!barriers.has(barrierKey(leftAllocation.id, rightAllocation.id))) break;
    rightIndex += 1;
  }

  const group: Allocation[] = [];
  for (let index = leftIndex; index <= rightIndex; index += 1) {
    const column = slotColumns[index];
    const allocation = column ? byRoomId.get(column.room.id) : undefined;
    if (allocation && allocationTimeKey(allocation) === timeKey) group.push(allocation);
  }
  return group.length > 1 ? group : null;
};

export const runMemberIds = (meta: Map<string, MergeMeta>, allocationId: string): string[] => {
  const direct = meta.get(allocationId);
  if (direct?.isLeader && direct.memberIds.length > 0) return direct.memberIds;
  for (const entry of meta.values()) {
    if (entry.isLeader && entry.memberIds.includes(allocationId)) return entry.memberIds;
  }
  return [allocationId];
};

/** Expand a merged run into per-room cards when selection is a proper subset. */
export const shouldExpandRun = (memberIds: string[], selectedIds: string[]): boolean => {
  if (memberIds.length <= 1) return false;
  const selectedInRun = selectedIds.filter((id) => memberIds.includes(id));
  return selectedInRun.length > 0 && selectedInRun.length < memberIds.length;
};

export const resolveMemberIndex = (offsetPx: number, cellSize: number, span: number): number =>
  clamp(Math.floor(offsetPx / cellSize), 0, Math.max(0, span - 1));

export const orderedRoomIds = (gridSlots: GridSlot[]): string[] =>
  gridSlots.filter((slot): slot is Extract<GridSlot, { type: "room" }> => slot.type === "room").map((slot) => slot.column.room.id);

/** Pixel drag → slot/room deltas. Drops inside the current run stay time-only. */
export const computeMoveDeltas = (input: {
  orientation: "normal" | "transposed";
  pointerDelta: { x: number; y: number };
  dropRoomIndex: number | null;
  memberRoomIndexes: number[];
  slotSize: number;
  roomSize: number;
}): { slotDelta: number; roomDelta: number } => {
  let slotDelta =
    input.orientation === "normal"
      ? Math.round(input.pointerDelta.y / input.slotSize)
      : Math.round(input.pointerDelta.x / input.slotSize);
  let roomDelta =
    input.orientation === "normal"
      ? Math.round(input.pointerDelta.x / input.roomSize)
      : Math.round(input.pointerDelta.y / input.roomSize);

  if (input.memberRoomIndexes.length === 0) return { slotDelta, roomDelta };

  const minRoomIndex = Math.min(...input.memberRoomIndexes);
  const maxRoomIndex = Math.max(...input.memberRoomIndexes);
  const dropInsideRun =
    input.dropRoomIndex !== null &&
    input.dropRoomIndex >= minRoomIndex &&
    input.dropRoomIndex <= maxRoomIndex;

  if (dropInsideRun || (input.memberRoomIndexes.length > 1 && input.dropRoomIndex === null)) {
    roomDelta = 0;
  }

  return { slotDelta, roomDelta };
};
