import type { Allocation } from "../types/schedule";

export const overlaps = (a: Allocation, b: Allocation): boolean =>
  a.roomId === b.roomId && a.startAt < b.endAt && b.startAt < a.endAt;

export const buildOverlapSet = (allocations: Allocation[]): Set<string> => {
  const overlapIds = new Set<string>();
  for (let i = 0; i < allocations.length; i += 1) {
    for (let j = i + 1; j < allocations.length; j += 1) {
      if (overlaps(allocations[i], allocations[j])) {
        overlapIds.add(allocations[i].id);
        overlapIds.add(allocations[j].id);
      }
    }
  }
  return overlapIds;
};
