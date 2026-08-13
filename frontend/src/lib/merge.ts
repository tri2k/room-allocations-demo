import type { Allocation } from "../types/schedule";
import type { GridSlot } from "./grid";
import { clamp } from "./time";

export type MergeMeta = {
  isLeader: boolean;
  span: number;
  /** Ordered allocation ids in the run (leaders only). */
  memberIds: string[];
};

/** Build display-merge metadata: adjacent rooms with same activity + exact times. */
export const buildMergeMeta = (gridSlots: GridSlot[], allocations: Allocation[]): Map<string, MergeMeta> => {
  const meta = new Map<string, MergeMeta>();
  const slotRoomIds = gridSlots.map((slot) => (slot.type === "room" ? slot.column.room.id : null));
  const roomIndexById = new Map<string, number>();
  slotRoomIds.forEach((roomId, index) => {
    if (roomId) roomIndexById.set(roomId, index);
  });
  const roomKeyToAllocation = new Map<string, Map<string, Allocation>>();

  for (const roomId of slotRoomIds) {
    if (roomId) roomKeyToAllocation.set(roomId, new Map());
  }
  for (const allocation of allocations) {
    if (!roomIndexById.has(allocation.roomId)) continue;
    const key = `${allocation.activityId}|${allocation.startAt}|${allocation.endAt}`;
    roomKeyToAllocation.get(allocation.roomId)?.set(key, allocation);
  }

  for (const allocation of allocations) {
    const baseIndex = roomIndexById.get(allocation.roomId);
    if (baseIndex === undefined) continue;
    const key = `${allocation.activityId}|${allocation.startAt}|${allocation.endAt}`;

    const leftRoomId = slotRoomIds[baseIndex - 1];
    if (leftRoomId && roomKeyToAllocation.get(leftRoomId)?.has(key)) {
      meta.set(allocation.id, { isLeader: false, span: 0, memberIds: [] });
      continue;
    }

    const memberIds = [allocation.id];
    let cursor = baseIndex + 1;
    while (cursor < slotRoomIds.length) {
      const nextRoomId = slotRoomIds[cursor];
      if (!nextRoomId) break;
      const nextAllocation = roomKeyToAllocation.get(nextRoomId)?.get(key);
      if (!nextAllocation) break;
      memberIds.push(nextAllocation.id);
      cursor += 1;
    }
    meta.set(allocation.id, { isLeader: true, span: memberIds.length, memberIds });
  }

  return meta;
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

/**
 * Order group room moves so a member vacates a destination before a sibling lands there.
 * Parallel patches 409 when a merged run slides into its own rooms.
 */
export const orderGroupRoomPatches = (current: Allocation[], next: Allocation[]): Allocation[] => {
  const nextById = new Map(next.map((allocation) => [allocation.id, allocation]));
  const currentById = new Map(current.map((allocation) => [allocation.id, allocation]));
  const occupant = new Map(current.map((allocation) => [allocation.roomId, allocation.id]));
  const remaining = new Set(current.map((allocation) => allocation.id));
  const ordered: Allocation[] = [];

  while (remaining.size > 0) {
    const ready = [...remaining].filter((id) => {
      const dest = nextById.get(id)?.roomId;
      if (!dest) return true;
      const blocker = occupant.get(dest);
      return blocker === undefined || blocker === id || !remaining.has(blocker);
    });
    if (ready.length === 0) {
      for (const id of remaining) {
        const item = nextById.get(id);
        if (item) ordered.push(item);
      }
      break;
    }
    for (const id of ready) {
      remaining.delete(id);
      const cur = currentById.get(id);
      if (cur) occupant.delete(cur.roomId);
      const item = nextById.get(id);
      if (item) ordered.push(item);
    }
  }
  return ordered;
};
