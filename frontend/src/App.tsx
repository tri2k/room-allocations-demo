import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";
import {
  ApiError,
  bulkCreateAllocations,
  createAllocation,
  deleteAllocation,
  loadActiveSchedule,
  patchAllocation,
  reseed
} from "./lib/api";
import AppNav from "./AppNav";
import { buildBuildingGroups, buildFloorGroups, buildGridSlots, orderColumns } from "./lib/grid";
import {
  buildMergeMeta,
  orderGroupRoomPatches,
  orderedRoomIds,
  resolveMemberIndex,
  runMemberIds,
  shouldExpandRun,
  type MergeMeta
} from "./lib/merge";
import { buildOverlapSet } from "./lib/overlap";
import { allocationStartSlot, buildIso, clamp, formatTimeLabel, getSlotCount, slotToTime, timeFromIso, timeToSlot } from "./lib/time";
import type { Activity, Allocation, Room, ScheduleState, TimeBlock } from "./types/schedule";

const SLOT_HEIGHT = 26;
const COLUMN_WIDTH = 98;
const TRANSPOSE_ROW_HEIGHT = 54;
const TRANSPOSE_SLOT_WIDTH = 42;
const TRANSPOSE_LABEL_WIDTH = 260;
const ORIENTATION_KEY = "room-allocations-demo:orientation";

type HeaderSelection = {
  roomIds: string[];
};

const roomTint = (type: Room["roomType"]): string => {
  if (type === "auditorium") return "#c8daf5";
  if (type === "large") return "#f8d7da";
  return "#d4edda";
};

type AllocationSelectEvent = {
  altKey: boolean;
  clientX: number;
  clientY: number;
  currentTarget: HTMLElement;
  horizontal: boolean;
};

function App() {
  const [state, setState] = useState<ScheduleState | null>(null);
  const [boot, setBoot] = useState<"loading" | "empty" | "ready" | "error">("loading");
  const [bootMessage, setBootMessage] = useState("");

  const reload = async () => {
    try {
      const next = await loadActiveSchedule();
      if (!next) {
        setState(null);
        setBoot("empty");
        return;
      }
      setState(next);
      setBoot("ready");
    } catch (error) {
      setBoot("error");
      setBootMessage(error instanceof Error ? error.message : "Failed to load schedule");
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const onReseed = async () => {
    await reseed();
    await reload();
  };

  if (boot === "loading") {
    return (
      <div className="boot-screen">
        <p>Loading schedule…</p>
      </div>
    );
  }

  if (boot === "empty") {
    return (
      <div className="boot-screen">
        <h1>No event to schedule</h1>
        <p>Create an event, or seed the BmMT demo.</p>
        <div className="topbar-actions">
          <a className="reset-button" href="#/event">
            Create event
          </a>
          <button
            className="reset-button"
            onClick={() => {
              void onReseed().catch((error: unknown) => {
                setBoot("error");
                setBootMessage(error instanceof Error ? error.message : "Reseed failed");
              });
            }}
          >
            Seed demo data
          </button>
        </div>
      </div>
    );
  }

  if (boot === "error" || !state) {
    return (
      <div className="boot-screen">
        <h1>Could not load schedule</h1>
        <p>{bootMessage}</p>
        <button className="reset-button" onClick={() => void reload()}>
          Retry
        </button>
      </div>
    );
  }

  return <ScheduleBoard state={state} setState={setState} reload={reload} onReseed={onReseed} />;
}

type ScheduleBoardProps = {
  state: ScheduleState;
  setState: Dispatch<SetStateAction<ScheduleState | null>>;
  reload: () => Promise<void>;
  onReseed: () => Promise<void>;
};

function ScheduleBoard({ state, setState, reload, onReseed }: ScheduleBoardProps) {
  const [selectedRoomIds, setSelectedRoomIds] = useState<HeaderSelection["roomIds"]>([]);
  const [selectedAllocationIds, setSelectedAllocationIds] = useState<string[]>([]);
  const selectedAllocationIdsRef = useRef<string[]>([]);
  const [collapsedBuildings, setCollapsedBuildings] = useState<Set<string>>(new Set());
  const [collapsedFloors, setCollapsedFloors] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string>("");
  const [orientation, setOrientation] = useState<"normal" | "transposed">(
    () => (localStorage.getItem(ORIENTATION_KEY) === "transposed" ? "transposed" : "normal")
  );
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  selectedAllocationIdsRef.current = selectedAllocationIds;

  const slotCount = useMemo(
    () => getSlotCount(state.event.gridStart, state.event.gridEnd, state.event.slotMinutes),
    [state.event.gridEnd, state.event.gridStart, state.event.slotMinutes]
  );

  const columns = useMemo(
    () => orderColumns(state.buildings, state.floors, state.rooms, collapsedBuildings, collapsedFloors),
    [state.buildings, state.floors, state.rooms, collapsedBuildings, collapsedFloors]
  );

  const gridSlots = useMemo(
    () => buildGridSlots(state.buildings, state.floors, state.rooms, collapsedBuildings, collapsedFloors),
    [state.buildings, state.floors, state.rooms, collapsedBuildings, collapsedFloors]
  );

  const overlapsSet = useMemo(() => buildOverlapSet(state.allocations), [state.allocations]);
  const activitiesById = useMemo(
    () => new Map(state.activities.map((activity) => [activity.id, activity])),
    [state.activities]
  );
  const mergedNormalMeta = useMemo(
    () => buildMergeMeta(gridSlots, state.allocations),
    [gridSlots, state.allocations]
  );
  const roomOrder = useMemo(() => orderedRoomIds(gridSlots), [gridSlots]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    localStorage.setItem(ORIENTATION_KEY, orientation);
  }, [orientation]);

  const setAllocationSelection = (ids: string[]) => {
    selectedAllocationIdsRef.current = ids;
    setSelectedAllocationIds(ids);
  };

  const resetToSeed = async () => {
    try {
      await onReseed();
      setSelectedRoomIds([]);
      setAllocationSelection([]);
      setCollapsedBuildings(new Set());
      setCollapsedFloors(new Set());
      setToast("Reset to seed schedule");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Reset failed");
    }
  };

  const replaceAllocations = (nextAllocations: Allocation[]) => {
    const byId = new Map(nextAllocations.map((allocation) => [allocation.id, allocation]));
    setState((previous) =>
      previous
        ? {
            ...previous,
            allocations: previous.allocations.map((entry) => byId.get(entry.id) ?? entry)
          }
        : previous
    );
  };

  const selectAllocationFromCard = (allocationId: string, event: AllocationSelectEvent) => {
    const run = runMemberIds(mergedNormalMeta, allocationId);
    if (event.altKey && run.length > 1) {
      const rect = event.currentTarget.getBoundingClientRect();
      const offset = event.horizontal ? event.clientY - rect.top : event.clientX - rect.left;
      const cell = event.horizontal ? TRANSPOSE_ROW_HEIGHT : COLUMN_WIDTH;
      const index = resolveMemberIndex(offset, cell, run.length);
      setAllocationSelection([run[index] ?? allocationId]);
      return;
    }
    setAllocationSelection(run);
  };

  const clearAllocationSelection = () => setAllocationSelection([]);

  /** Prefer current selection when it includes this id; else the full merged run (or solo). */
  const idsForEdit = (allocationId: string): string[] => {
    const selected = selectedAllocationIdsRef.current;
    if (selected.includes(allocationId)) return selected;
    return runMemberIds(mergedNormalMeta, allocationId);
  };

  const handleCreateFromPalette = async (activity: Activity, targetRoomIds: string[], startSlot: number) => {
    const durationSlots = Math.max(1, Math.round(activity.defaultDurationMin / state.event.slotMinutes));
    const clampedStart = clamp(startSlot, 0, slotCount - durationSlots);
    const startAt = buildIso(state.event.eventDate, slotToTime(state.event.gridStart, state.event.slotMinutes, clampedStart));
    const endAt = buildIso(
      state.event.eventDate,
      slotToTime(state.event.gridStart, state.event.slotMinutes, clampedStart + durationSlots)
    );

    try {
      if (targetRoomIds.length === 1) {
        const result = await createAllocation(state.event.id, {
          roomId: targetRoomIds[0],
          activityId: activity.id,
          startAt,
          endAt
        });
        setState((previous) =>
          previous ? { ...previous, allocations: [...previous.allocations, result.allocation] } : previous
        );
        const warning = result.warnings[0]?.message;
        setToast(warning ?? "Created 1 allocation");
        return;
      }

      const result = await bulkCreateAllocations(state.event.id, {
        roomIds: targetRoomIds,
        activityId: activity.id,
        startAt,
        endAt
      });
      if (result.created.length > 0) {
        await reload();
      }
      const skipped = result.skipped.length;
      if (result.created.length > 0 && skipped > 0) setToast(`Created ${result.created.length}, skipped ${skipped} overlaps`);
      else if (result.created.length > 0) {
        setToast(`Created ${result.created.length} allocation${result.created.length === 1 ? "" : "s"}`);
      } else setToast("No allocations created (overlap)");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) setToast("No allocations created (overlap)");
      else setToast(error instanceof Error ? error.message : "Create failed");
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const overId = String(event.over?.id ?? "");
    if (!overId.startsWith("cell:")) return;

    const [, roomId, slotRaw] = overId.split(":");
    const slotIndex = Number(slotRaw);
    const dragData = event.active.data.current as
      | { type: "palette"; activityId: string }
      | { type: "allocation"; allocationId: string }
      | undefined;
    if (!dragData) return;

    if (dragData.type === "palette") {
      const activity = activitiesById.get(dragData.activityId);
      if (!activity) return;
      const targetRoomIds = selectedRoomIds.length > 0 ? selectedRoomIds : [roomId];
      void handleCreateFromPalette(activity, targetRoomIds, slotIndex);
      return;
    }

    const source = state.allocations.find((allocation) => allocation.id === dragData.allocationId);
    if (!source) return;

    const editIds = idsForEdit(source.id);
    const members = editIds
      .map((id) => state.allocations.find((allocation) => allocation.id === id))
      .filter((allocation): allocation is Allocation => Boolean(allocation));
    if (members.length === 0) return;

    const durationSlots = Math.max(
      1,
      allocationStartSlot(state.event.eventDate, state.event.gridStart, state.event.slotMinutes, source.endAt) -
        allocationStartSlot(state.event.eventDate, state.event.gridStart, state.event.slotMinutes, source.startAt)
    );
    const clampedStart = clamp(slotIndex, 0, slotCount - durationSlots);
    const startAt = buildIso(state.event.eventDate, slotToTime(state.event.gridStart, state.event.slotMinutes, clampedStart));
    const endAt = buildIso(
      state.event.eventDate,
      slotToTime(state.event.gridStart, state.event.slotMinutes, clampedStart + durationSlots)
    );

    const sourceRoomIndex = roomOrder.indexOf(source.roomId);
    const dropRoomIndex = roomOrder.indexOf(roomId);
    if (sourceRoomIndex < 0 || dropRoomIndex < 0) return;
    const roomDelta = dropRoomIndex - sourceRoomIndex;

    const nextMembers: Allocation[] = [];
    for (const member of members) {
      const memberIndex = roomOrder.indexOf(member.roomId);
      if (memberIndex < 0) {
        setToast("Move blocked (room not visible)");
        return;
      }
      const nextRoomIndex = memberIndex + roomDelta;
      if (nextRoomIndex < 0 || nextRoomIndex >= roomOrder.length) {
        setToast("Move blocked (off grid)");
        return;
      }
      nextMembers.push({
        ...member,
        roomId: roomOrder[nextRoomIndex],
        startAt,
        endAt
      });
    }

    const previous = members;
    replaceAllocations(nextMembers);
    setAllocationSelection(nextMembers.map((allocation) => allocation.id));
    void persistAllocationPatches(previous, orderGroupRoomPatches(previous, nextMembers), (error) => {
      if (error instanceof ApiError && error.status === 409) setToast("Move blocked (overlap)");
      else setToast(error instanceof Error ? error.message : "Move failed");
    });
  };

  const persistAllocationPatches = async (
    previous: Allocation[],
    orderedNext: Allocation[],
    onError: (error: unknown) => void
  ) => {
    const applied: Allocation[] = [];
    try {
      for (const allocation of orderedNext) {
        const result = await patchAllocation(allocation.id, {
          roomId: allocation.roomId,
          startAt: allocation.startAt,
          endAt: allocation.endAt
        });
        applied.push(result.allocation);
      }
      replaceAllocations(applied);
    } catch (error) {
      for (const allocation of [...applied].reverse()) {
        const orig = previous.find((entry) => entry.id === allocation.id);
        if (!orig) continue;
        try {
          await patchAllocation(orig.id, {
            roomId: orig.roomId,
            startAt: orig.startAt,
            endAt: orig.endAt
          });
        } catch {
          /* keep restoring the rest */
        }
      }
      replaceAllocations(previous);
      onError(error);
    }
  };

  const onResize = (allocationId: string, direction: "start" | "end", deltaSlots: number) => {
    const editIds = idsForEdit(allocationId);
    const members = editIds
      .map((id) => state.allocations.find((entry) => entry.id === id))
      .filter((allocation): allocation is Allocation => Boolean(allocation));
    if (members.length === 0) return;

    const previous = members;
    const nextMembers: Allocation[] = [];
    for (const allocation of members) {
      const startSlot = allocationStartSlot(
        state.event.eventDate,
        state.event.gridStart,
        state.event.slotMinutes,
        allocation.startAt
      );
      const endSlot = allocationStartSlot(
        state.event.eventDate,
        state.event.gridStart,
        state.event.slotMinutes,
        allocation.endAt
      );
      const nextStart = direction === "start" ? clamp(startSlot + deltaSlots, 0, endSlot - 1) : startSlot;
      const nextEnd = direction === "end" ? clamp(endSlot + deltaSlots, nextStart + 1, slotCount) : endSlot;
      nextMembers.push({
        ...allocation,
        startAt: buildIso(state.event.eventDate, slotToTime(state.event.gridStart, state.event.slotMinutes, nextStart)),
        endAt: buildIso(state.event.eventDate, slotToTime(state.event.gridStart, state.event.slotMinutes, nextEnd))
      });
    }

    replaceAllocations(nextMembers);
    setAllocationSelection(nextMembers.map((allocation) => allocation.id));
    void persistAllocationPatches(previous, nextMembers, (error) => {
      if (error instanceof ApiError && error.status === 409) setToast("Resize blocked (overlap)");
      else setToast(error instanceof Error ? error.message : "Resize failed");
    });
  };

  const removeAllocations = async (allocationIds: string[]) => {
    const ids = Array.from(new Set(allocationIds));
    if (ids.length === 0) return;
    const previous = state.allocations;
    setState((current) =>
      current
        ? { ...current, allocations: current.allocations.filter((allocation) => !ids.includes(allocation.id)) }
        : current
    );
    setAllocationSelection([]);
    try {
      await Promise.all(ids.map((id) => deleteAllocation(id)));
      setToast(ids.length === 1 ? "Deleted allocation" : `Deleted ${ids.length} allocations`);
    } catch (error) {
      setState((current) => (current ? { ...current, allocations: previous } : current));
      setToast(error instanceof Error ? error.message : "Delete failed");
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      if (event.key === "Escape") {
        if (selectedAllocationIdsRef.current.length > 0) {
          event.preventDefault();
          setAllocationSelection([]);
          return;
        }
        if (selectedRoomIds.length > 0) {
          event.preventDefault();
          setSelectedRoomIds([]);
        }
        return;
      }

      if (selectedAllocationIdsRef.current.length === 0) return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      event.preventDefault();
      void removeAllocations(selectedAllocationIdsRef.current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedRoomIds, state.allocations]);

  const selectFloor = (floorId: string, append: boolean) => {
    const roomIds = state.rooms.filter((room) => room.floorId === floorId).map((room) => room.id);
    setSelectedRoomIds((previous) =>
      append ? Array.from(new Set([...previous, ...roomIds])) : Array.from(new Set(roomIds))
    );
  };

  const selectBuilding = (buildingId: string, append: boolean) => {
    const roomIds = state.rooms.filter((room) => room.buildingId === buildingId).map((room) => room.id);
    setSelectedRoomIds((previous) =>
      append ? Array.from(new Set([...previous, ...roomIds])) : Array.from(new Set(roomIds))
    );
  };

  const toggleRoom = (roomId: string) => {
    setSelectedRoomIds((previous) =>
      previous.includes(roomId) ? previous.filter((id) => id !== roomId) : [...previous, roomId]
    );
  };

  const buildingGroups = useMemo(
    () =>
      buildBuildingGroups(
        state.buildings,
        state.rooms,
        columns,
        state.floors,
        collapsedBuildings,
        collapsedFloors
      ),
    [state.buildings, state.rooms, state.floors, columns, collapsedBuildings, collapsedFloors]
  );
  const floorGroups = useMemo(
    () =>
      buildFloorGroups(
        state.buildings,
        state.floors,
        state.rooms,
        columns,
        collapsedBuildings,
        collapsedFloors
      ),
    [state.buildings, state.floors, state.rooms, columns, collapsedBuildings, collapsedFloors]
  );

  const headerSpan = useMemo(
    () => gridSlots.length,
    [gridSlots]
  );

  const toggleBuildingCollapsed = (buildingId: string) => {
    const willCollapse = !collapsedBuildings.has(buildingId);
    setCollapsedBuildings((previous) => {
      const next = new Set(previous);
      if (next.has(buildingId)) next.delete(buildingId);
      else next.add(buildingId);
      return next;
    });
    if (willCollapse) {
      const hiddenRoomIds = new Set(
        state.rooms.filter((room) => room.buildingId === buildingId).map((room) => room.id)
      );
      setSelectedRoomIds((selected) => selected.filter((id) => !hiddenRoomIds.has(id)));
    }
  };

  const toggleFloorCollapsed = (floorId: string) => {
    const willCollapse = !collapsedFloors.has(floorId);
    setCollapsedFloors((previous) => {
      const next = new Set(previous);
      if (next.has(floorId)) next.delete(floorId);
      else next.add(floorId);
      return next;
    });
    if (willCollapse) {
      const hiddenRoomIds = new Set(
        state.rooms.filter((room) => room.floorId === floorId).map((room) => room.id)
      );
      setSelectedRoomIds((selected) => selected.filter((id) => !hiddenRoomIds.has(id)));
    }
  };

  const buildingIdForSlot = (slot: (typeof gridSlots)[number]): string | null => {
    if (slot.type === "room") return slot.column.building.id;
    if (slot.id.startsWith("spacer-building-")) return slot.id.slice("spacer-building-".length);
    if (slot.id.startsWith("spacer-floor-")) {
      const floorId = slot.id.slice("spacer-floor-".length);
      return state.floors.find((floor) => floor.id === floorId)?.buildingId ?? null;
    }
    return null;
  };

  const transposeBuildingBands = useMemo(() => {
    const bands: Array<{
      id: string;
      buildingId: string;
      label: string;
      start: number;
      span: number;
      collapsed: boolean;
    }> = [];
    let index = 0;
    while (index < gridSlots.length) {
      const buildingId = buildingIdForSlot(gridSlots[index]);
      if (!buildingId) {
        index += 1;
        continue;
      }
      const building = state.buildings.find((entry) => entry.id === buildingId);
      let span = 1;
      while (index + span < gridSlots.length && buildingIdForSlot(gridSlots[index + span]) === buildingId) {
        span += 1;
      }
      bands.push({
        id: `band-building-${buildingId}-${index}`,
        buildingId,
        label: building?.code ?? "?",
        start: index,
        span,
        collapsed: collapsedBuildings.has(buildingId)
      });
      index += span;
    }
    return bands;
  }, [gridSlots, state.buildings, state.floors, collapsedBuildings]);

  const transposeFloorBands = useMemo(() => {
    const bands: Array<{
      id: string;
      floorId: string | null;
      buildingId: string;
      label: string;
      start: number;
      span: number;
      collapsed: boolean;
    }> = [];
    let index = 0;
    while (index < gridSlots.length) {
      const slot = gridSlots[index];
      const buildingId = buildingIdForSlot(slot);
      if (!buildingId) {
        index += 1;
        continue;
      }

      if (slot.type === "spacer" && slot.id.startsWith("spacer-building-")) {
        bands.push({
          id: `band-floor-building-collapsed-${buildingId}-${index}`,
          floorId: null,
          buildingId,
          label: "Collapsed",
          start: index,
          span: 1,
          collapsed: true
        });
        index += 1;
        continue;
      }

      const floorId =
        slot.type === "room"
          ? slot.column.floor?.id ?? null
          : slot.id.startsWith("spacer-floor-")
            ? slot.id.slice("spacer-floor-".length)
            : null;
      let span = 1;
      while (index + span < gridSlots.length) {
        const next = gridSlots[index + span];
        if (buildingIdForSlot(next) !== buildingId) break;
        if (next.type === "spacer" && next.id.startsWith("spacer-building-")) break;
        const nextFloorId =
          next.type === "room"
            ? next.column.floor?.id ?? null
            : next.id.startsWith("spacer-floor-")
              ? next.id.slice("spacer-floor-".length)
              : null;
        if (nextFloorId !== floorId) break;
        span += 1;
      }
      const floor = floorId ? state.floors.find((entry) => entry.id === floorId) : null;
      bands.push({
        id: `band-floor-${floorId ?? "none"}-${index}`,
        floorId,
        buildingId,
        label: floorId ? `F${floor?.label ?? "?"}` : "N/A",
        start: index,
        span,
        collapsed: Boolean(floorId && collapsedFloors.has(floorId))
      });
      index += span;
    }
    return bands;
  }, [gridSlots, state.buildings, state.floors, collapsedFloors]);

  const gridHeight = slotCount * SLOT_HEIGHT;
  const transposeWidth = slotCount * TRANSPOSE_SLOT_WIDTH;

  const getBlockSpan = (allocation: Allocation) =>
    Math.max(
      1,
      allocationStartSlot(state.event.eventDate, state.event.gridStart, state.event.slotMinutes, allocation.endAt) -
        allocationStartSlot(state.event.eventDate, state.event.gridStart, state.event.slotMinutes, allocation.startAt)
    );

  const blockTitle = (activity: Activity, allocation: Allocation) =>
    `${activity.name} (${timeFromIso(allocation.startAt)}-${timeFromIso(allocation.endAt)})`;

  const phaseBounds = (block: TimeBlock) => {
    const start = timeToSlot(state.event.gridStart, state.event.slotMinutes, block.startTime);
    const end = timeToSlot(state.event.gridStart, state.event.slotMinutes, block.endTime);
    return { start: clamp(start, 0, slotCount), end: clamp(end, 0, slotCount) };
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="app">
        <header className="topbar">
          <div>
            <h1>{state.event.name} Room Schedule</h1>
            <p>Drag from palette, bulk assign by floor. Schedule is saved on the server.</p>
          </div>
          <div className="topbar-actions">
            <AppNav current="schedule" />
            <button
              onClick={() => setOrientation((previous) => (previous === "normal" ? "transposed" : "normal"))}
              className="reset-button"
            >
              {orientation === "normal" ? "Transpose" : "Normal View"}
            </button>
            {selectedRoomIds.length > 0 ? (
              <button
                type="button"
                className="reset-button"
                onClick={() => setSelectedRoomIds([])}
                title="Stop bulk-assigning to selected rooms"
              >
                Clear selection ({selectedRoomIds.length})
              </button>
            ) : null}
            <button onClick={() => void resetToSeed()} className="reset-button">
              Reset
            </button>
          </div>
        </header>

        <div className="workspace">
          <aside className="palette">
            <h2>Activity Palette</h2>
            {state.activities.map((activity) => (
              <PaletteItem key={activity.id} activity={activity} />
            ))}
          </aside>

          <div className="schedule-wrap">
            <div className="schedule" style={{ minWidth: Math.max(columns.length, headerSpan) * COLUMN_WIDTH + 120 }}>
              {orientation === "normal" ? (
                <div className="schedule-headers">
                  <div className="header-row building-row" style={{ marginLeft: 120 }}>
                    {buildingGroups.map((group) => (
                      <button
                        key={group.building.id}
                        className={`header-button building ${group.collapsed ? "collapsed" : ""}`}
                        style={{ width: group.span * COLUMN_WIDTH }}
                        title={group.collapsed ? "Click to expand" : "Click to select · Double-click to collapse"}
                        onClick={(event) => {
                          if (event.detail > 1) return;
                          if (group.collapsed) {
                            toggleBuildingCollapsed(group.building.id);
                            return;
                          }
                          selectBuilding(group.building.id, event.shiftKey);
                        }}
                        onDoubleClick={() => {
                          if (!group.collapsed) toggleBuildingCollapsed(group.building.id);
                        }}
                      >
                        <span className="collapse-marker" aria-hidden>
                          {group.collapsed ? "▸" : "▾"}
                        </span>
                        <strong>{group.building.code}</strong> {group.building.name}
                      </button>
                    ))}
                  </div>

                  <div className="header-row floor-row" style={{ marginLeft: 120 }}>
                    {floorGroups.map((group) => (
                      <button
                        key={group.id}
                        className={`header-button floor ${group.collapsed ? "collapsed" : ""}`}
                        style={{ width: group.span * COLUMN_WIDTH }}
                        title={
                          group.collapsed
                            ? group.floorId
                              ? "Click to expand"
                              : "Building collapsed"
                            : group.floorId
                              ? "Click to select · Double-click to collapse"
                              : undefined
                        }
                        onClick={(event) => {
                          if (event.detail > 1) return;
                          if (group.collapsed && group.floorId) {
                            toggleFloorCollapsed(group.floorId);
                            return;
                          }
                          if (group.collapsed && !group.floorId) {
                            toggleBuildingCollapsed(group.buildingId);
                            return;
                          }
                          if (group.floorId) selectFloor(group.floorId, event.shiftKey);
                        }}
                        onDoubleClick={() => {
                          if (group.collapsed) return;
                          if (group.floorId) toggleFloorCollapsed(group.floorId);
                        }}
                      >
                        {group.floorId ? (
                          <>
                            <span className="collapse-marker" aria-hidden>
                              {group.collapsed ? "▸" : "▾"}
                            </span>
                            {group.label}
                          </>
                        ) : (
                          group.label
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="header-row room-row">
                    <div className="time-header">Time</div>
                    {gridSlots.map((slot) =>
                      slot.type === "spacer" ? (
                        <div
                          key={slot.id}
                          className="room-header-spacer"
                          style={{ width: COLUMN_WIDTH }}
                          aria-hidden
                        />
                      ) : (
                        <button
                          key={slot.column.room.id}
                          className={`room-header ${selectedRoomIds.includes(slot.column.room.id) ? "selected" : ""}`}
                          style={{ width: COLUMN_WIDTH, background: roomTint(slot.column.room.roomType) }}
                          onClick={(event) => {
                            if (event.shiftKey) toggleRoom(slot.column.room.id);
                            else setSelectedRoomIds([slot.column.room.id]);
                          }}
                        >
                          <div>{slot.column.building.code + slot.column.room.name}</div>
                          <small>
                            {slot.column.room.roomType} ({slot.column.room.capacity}/{slot.column.room.optimalCapacity})
                          </small>
                        </button>
                      )
                    )}
                  </div>
                </div>
              ) : null}

              {orientation === "normal" ? (
                <div className="grid-body">
                  <div className="time-gutter" style={{ height: gridHeight }}>
                    {Array.from({ length: slotCount }).map((_, slotIndex) => {
                      const label = slotToTime(state.event.gridStart, state.event.slotMinutes, slotIndex);
                      return (
                        <div key={label} className="time-cell" style={{ height: SLOT_HEIGHT }}>
                          {slotIndex % 2 === 0 ? formatTimeLabel(label) : ""}
                        </div>
                      );
                    })}
                    {state.timeBlocks.map((block) => {
                      const bounds = phaseBounds(block);
                      return (
                        <div
                          key={block.id}
                          className="phase-band"
                          style={{
                            top: bounds.start * SLOT_HEIGHT,
                            height: Math.max(1, bounds.end - bounds.start) * SLOT_HEIGHT,
                            backgroundColor: block.color ?? "#f0f0f0"
                          }}
                        >
                          {block.label}
                        </div>
                      );
                    })}
                  </div>

                  <div className="rooms-grid">
                    {gridSlots.map((slot) =>
                      slot.type === "spacer" ? (
                        <div
                          key={slot.id}
                          className="room-column-spacer"
                          style={{ width: COLUMN_WIDTH, height: gridHeight }}
                          aria-hidden
                        />
                      ) : (
                        <RoomColumn
                          key={slot.column.room.id}
                          roomId={slot.column.room.id}
                          slotCount={slotCount}
                          slotHeight={SLOT_HEIGHT}
                          allocations={state.allocations.filter(
                            (allocation) => allocation.roomId === slot.column.room.id
                          )}
                          activitiesById={activitiesById}
                          overlapIds={overlapsSet}
                          selected={selectedRoomIds.includes(slot.column.room.id)}
                          eventDate={state.event.eventDate}
                          gridStart={state.event.gridStart}
                          slotMinutes={state.event.slotMinutes}
                          onResize={onResize}
                          onDelete={(id) => void removeAllocations(idsForEdit(id))}
                          selectedAllocationIds={selectedAllocationIds}
                          onSelectAllocation={selectAllocationFromCard}
                          onClearAllocationSelection={clearAllocationSelection}
                          blockTitle={blockTitle}
                          mergeMeta={mergedNormalMeta}
                        />
                      )
                    )}
                  </div>
                </div>
              ) : (
                <div className="transpose-shell">
                  <div className="transpose-headers">
                    <div className="transpose-corner" style={{ width: TRANSPOSE_LABEL_WIDTH }}>
                      Time
                    </div>
                    <div className="transpose-header-cols" style={{ width: transposeWidth }}>
                      <div className="transpose-phase-strip" style={{ width: transposeWidth }}>
                        {state.timeBlocks.map((block) => {
                          const bounds = phaseBounds(block);
                          return (
                            <div
                              key={block.id}
                              className="transpose-phase-block"
                              style={{
                                left: bounds.start * TRANSPOSE_SLOT_WIDTH,
                                width: Math.max(1, bounds.end - bounds.start) * TRANSPOSE_SLOT_WIDTH,
                                background: block.color ?? "#e5e7eb"
                              }}
                            >
                              {block.label}
                            </div>
                          );
                        })}
                      </div>

                      <div className="transpose-time-header" style={{ width: transposeWidth }}>
                        {Array.from({ length: slotCount }).map((_, slotIndex) => {
                          const hhmm = slotToTime(state.event.gridStart, state.event.slotMinutes, slotIndex);
                          return (
                            <div key={hhmm} className="transpose-time-cell" style={{ width: TRANSPOSE_SLOT_WIDTH }}>
                              {slotIndex % 2 === 0 ? hhmm : ""}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div
                    className="transpose-grid"
                    style={{
                      gridTemplateColumns: `32px 32px 196px ${transposeWidth}px`,
                      gridTemplateRows: `repeat(${gridSlots.length}, ${TRANSPOSE_ROW_HEIGHT}px)`
                    }}
                  >
                    {transposeBuildingBands.map((band) => (
                      <button
                        key={band.id}
                        className={`transpose-sideways building ${band.collapsed ? "collapsed" : ""}`}
                        style={{ gridColumn: "1", gridRow: `${band.start + 1} / span ${band.span}` }}
                        title={
                          band.collapsed
                            ? "Click to expand"
                            : "Click to select · Double-click to collapse"
                        }
                        onClick={(event) => {
                          if (event.detail > 1) return;
                          if (band.collapsed) {
                            toggleBuildingCollapsed(band.buildingId);
                            return;
                          }
                          selectBuilding(band.buildingId, event.shiftKey);
                        }}
                        onDoubleClick={() => {
                          if (!band.collapsed) toggleBuildingCollapsed(band.buildingId);
                        }}
                      >
                        <span>
                          <span className="collapse-marker" aria-hidden>
                            {band.collapsed ? "▸" : "▾"}
                          </span>
                          {band.label}
                        </span>
                      </button>
                    ))}

                    {transposeFloorBands.map((band) => (
                      <button
                        key={band.id}
                        className={`transpose-sideways floor ${band.collapsed ? "collapsed" : ""}`}
                        style={{ gridColumn: "2", gridRow: `${band.start + 1} / span ${band.span}` }}
                        title={
                          band.collapsed
                            ? band.floorId
                              ? "Click to expand"
                              : "Building collapsed"
                            : band.floorId
                              ? "Click to select · Double-click to collapse"
                              : undefined
                        }
                        onClick={(event) => {
                          if (event.detail > 1) return;
                          if (band.collapsed && band.floorId) {
                            toggleFloorCollapsed(band.floorId);
                            return;
                          }
                          if (band.collapsed && !band.floorId) {
                            toggleBuildingCollapsed(band.buildingId);
                            return;
                          }
                          if (band.floorId) selectFloor(band.floorId, event.shiftKey);
                        }}
                        onDoubleClick={() => {
                          if (band.collapsed) return;
                          if (band.floorId) toggleFloorCollapsed(band.floorId);
                        }}
                      >
                        <span>
                          {band.floorId || band.collapsed ? (
                            <span className="collapse-marker" aria-hidden>
                              {band.collapsed ? "▸" : "▾"}
                            </span>
                          ) : null}
                          {band.label}
                        </span>
                      </button>
                    ))}

                    {gridSlots.map((slot, rowIndex) => {
                      if (slot.type === "spacer") {
                        return (
                          <Fragment key={slot.id}>
                            <div
                              className="transpose-room-label-spacer"
                              style={{ gridColumn: "3", gridRow: `${rowIndex + 1}` }}
                              aria-hidden
                            />
                            <div
                              className="transpose-room-track-spacer"
                              style={{
                                width: transposeWidth,
                                height: TRANSPOSE_ROW_HEIGHT,
                                gridColumn: "4",
                                gridRow: `${rowIndex + 1}`
                              }}
                              aria-hidden
                            />
                          </Fragment>
                        );
                      }

                      const column = slot.column;
                      const roomAllocations = state.allocations.filter((allocation) => allocation.roomId === column.room.id);
                      return (
                        <Fragment key={column.room.id}>
                          <button
                            className={`transpose-room-label ${selectedRoomIds.includes(column.room.id) ? "selected" : ""}`}
                            style={{ background: roomTint(column.room.roomType), gridColumn: "3", gridRow: `${rowIndex + 1}` }}
                            onClick={(event) => {
                              if (event.shiftKey) toggleRoom(column.room.id);
                              else setSelectedRoomIds([column.room.id]);
                            }}
                          >
                            <div>{column.building.code + column.room.name}</div>
                            <small>
                              {column.room.roomType} ({column.room.capacity}/{column.room.optimalCapacity})
                            </small>
                          </button>
                          <div
                            className="transpose-room-track"
                            style={{
                              width: transposeWidth,
                              height: TRANSPOSE_ROW_HEIGHT,
                              gridColumn: "4",
                              gridRow: `${rowIndex + 1}`
                            }}
                            onClick={() => clearAllocationSelection()}
                          >
                            {Array.from({ length: slotCount }).map((_, slotIndex) => (
                              <DroppableCellHorizontal
                                key={`${column.room.id}:${slotIndex}`}
                                roomId={column.room.id}
                                slotIndex={slotIndex}
                                slotWidth={TRANSPOSE_SLOT_WIDTH}
                              />
                            ))}
                            {roomAllocations.map((allocation) => {
                              const activity = activitiesById.get(allocation.activityId);
                              if (!activity) return null;
                              const runIds = runMemberIds(mergedNormalMeta, allocation.id);
                              const expanded = shouldExpandRun(runIds, selectedAllocationIds);
                              const merged = mergedNormalMeta.get(allocation.id);
                              if (merged && !merged.isLeader && !expanded) return null;
                              const startSlot = allocationStartSlot(
                                state.event.eventDate,
                                state.event.gridStart,
                                state.event.slotMinutes,
                                allocation.startAt
                              );
                              const span = getBlockSpan(allocation);
                              const roomSpan = expanded ? 1 : (merged?.span ?? 1);
                              return (
                                <AllocationCardHorizontal
                                  key={allocation.id}
                                  allocation={allocation}
                                  activity={activity}
                                  left={startSlot * TRANSPOSE_SLOT_WIDTH}
                                  width={span * TRANSPOSE_SLOT_WIDTH - 2}
                                  height={roomSpan * TRANSPOSE_ROW_HEIGHT - 2}
                                  gridExtent={slotCount * TRANSPOSE_SLOT_WIDTH}
                                  overlap={overlapsSet.has(allocation.id)}
                                  selected={selectedAllocationIds.includes(allocation.id)}
                                  blockTitle={
                                    runIds.length > 1
                                      ? `${blockTitle(activity, allocation)} · Click all · Alt-click one room`
                                      : blockTitle(activity, allocation)
                                  }
                                  onSelect={(id, selectEvent) => selectAllocationFromCard(id, selectEvent)}
                                  onDelete={(id) => void removeAllocations(idsForEdit(id))}
                                  onResize={onResize}
                                />
                              );
                            })}
                          </div>
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {toast ? <div className="toast">{toast}</div> : null}
      </div>
    </DndContext>
  );
}

type PaletteItemProps = {
  activity: Activity;
};

function PaletteItem({ activity }: PaletteItemProps) {
  const nodeRef = useRef<HTMLButtonElement | null>(null);
  const originRef = useRef<{ left: number; top: number } | null>(null);
  const draggable = useDraggable({
    id: `palette:${activity.id}`,
    data: { type: "palette", activityId: activity.id }
  });

  const setRefs = (node: HTMLButtonElement | null) => {
    nodeRef.current = node;
    draggable.setNodeRef(node);
  };

  const listeners = {
    ...draggable.listeners,
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      originRef.current = { left: rect.left, top: rect.top };
      draggable.listeners?.onPointerDown?.(event);
    }
  };

  const origin = originRef.current;
  const floating = draggable.isDragging && origin;

  return (
    <button
      ref={setRefs}
      {...listeners}
      {...draggable.attributes}
      className={`palette-item ${draggable.isDragging ? "is-dragging" : ""}`}
      style={
        floating
          ? {
              position: "fixed",
              left: origin.left,
              top: origin.top,
              width: nodeRef.current?.offsetWidth,
              zIndex: 10000,
              background: activity.color,
              transform: CSS.Translate.toString(draggable.transform),
              boxShadow: "0 12px 32px rgba(15, 23, 42, 0.35)",
              cursor: "grabbing",
              margin: 0,
              opacity: 0.95
            }
          : { background: activity.color }
      }
    >
      {activity.name}
    </button>
  );
}

type RoomColumnProps = {
  roomId: string;
  slotCount: number;
  slotHeight: number;
  allocations: Allocation[];
  activitiesById: Map<string, Activity>;
  overlapIds: Set<string>;
  selected: boolean;
  eventDate: string;
  gridStart: string;
  slotMinutes: number;
  onResize: (allocationId: string, direction: "start" | "end", deltaSlots: number) => void;
  onDelete: (allocationId: string) => void;
  selectedAllocationIds: string[];
  onSelectAllocation: (allocationId: string, event: AllocationSelectEvent) => void;
  onClearAllocationSelection: () => void;
  blockTitle: (activity: Activity, allocation: Allocation) => string;
  mergeMeta: Map<string, MergeMeta>;
};

function RoomColumn({
  roomId,
  slotCount,
  slotHeight,
  allocations,
  activitiesById,
  overlapIds,
  selected,
  eventDate,
  gridStart,
  slotMinutes,
  onResize,
  onDelete,
  selectedAllocationIds,
  onSelectAllocation,
  onClearAllocationSelection,
  blockTitle,
  mergeMeta
}: RoomColumnProps) {
  return (
    <div
      className={`room-column ${selected ? "selected" : ""}`}
      style={{ width: COLUMN_WIDTH }}
      onClick={() => onClearAllocationSelection()}
    >
      {Array.from({ length: slotCount }).map((_, slotIndex) => (
        <DroppableCell key={`${roomId}:${slotIndex}`} roomId={roomId} slotIndex={slotIndex} slotHeight={slotHeight} />
      ))}

      {allocations.map((allocation) => {
        const activity = activitiesById.get(allocation.activityId);
        if (!activity) return null;
        const runIds = runMemberIds(mergeMeta, allocation.id);
        const expanded = shouldExpandRun(runIds, selectedAllocationIds);
        const merged = mergeMeta.get(allocation.id);
        if (merged && !merged.isLeader && !expanded) return null;
        const startSlot = allocationStartSlot(eventDate, gridStart, slotMinutes, allocation.startAt);
        const endSlot = allocationStartSlot(eventDate, gridStart, slotMinutes, allocation.endAt);
        const span = Math.max(1, endSlot - startSlot);
        const roomSpan = expanded ? 1 : (merged?.span ?? 1);
        const width = roomSpan * COLUMN_WIDTH - 4;
        const title =
          runIds.length > 1
            ? `${blockTitle(activity, allocation)} · Click all · Alt-click one room`
            : blockTitle(activity, allocation);

        return (
          <AllocationCard
            key={allocation.id}
            allocation={allocation}
            activity={activity}
            top={startSlot * slotHeight}
            height={span * slotHeight - 2}
            width={width}
            gridExtent={slotCount * slotHeight}
            overlap={overlapIds.has(allocation.id)}
            onResize={onResize}
            onDelete={onDelete}
            selected={selectedAllocationIds.includes(allocation.id)}
            onSelect={onSelectAllocation}
            title={title}
          />
        );
      })}
    </div>
  );
}

function DroppableCell({ roomId, slotIndex, slotHeight }: { roomId: string; slotIndex: number; slotHeight: number }) {
  const droppable = useDroppable({ id: `cell:${roomId}:${slotIndex}` });
  return (
    <div
      ref={droppable.setNodeRef}
      className={`slot-cell ${droppable.isOver ? "over" : ""}`}
      style={{ height: slotHeight }}
    />
  );
}

function DroppableCellHorizontal({ roomId, slotIndex, slotWidth }: { roomId: string; slotIndex: number; slotWidth: number }) {
  const droppable = useDroppable({ id: `cell:${roomId}:${slotIndex}` });
  return (
    <div
      ref={droppable.setNodeRef}
      className={`slot-cell-horizontal ${droppable.isOver ? "over" : ""}`}
      style={{ width: slotWidth }}
    />
  );
}

type AllocationCardProps = {
  allocation: Allocation;
  activity: Activity;
  top: number;
  height: number;
  width: number;
  gridExtent: number;
  overlap: boolean;
  onResize: (allocationId: string, direction: "start" | "end", deltaSlots: number) => void;
  onDelete: (allocationId: string) => void;
  selected: boolean;
  onSelect: (allocationId: string, event: AllocationSelectEvent) => void;
  title: string;
};

function AllocationCard({
  allocation,
  activity,
  top,
  height,
  width,
  gridExtent,
  overlap,
  onResize,
  onDelete,
  selected,
  onSelect,
  title
}: AllocationCardProps) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const originRef = useRef<{ left: number; top: number } | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const [resizePreview, setResizePreview] = useState<{ top: number; height: number } | null>(null);
  const draggable = useDraggable({
    id: `allocation:${allocation.id}`,
    data: {
      type: "allocation",
      allocationId: allocation.id,
      width,
      height,
      horizontal: false
    }
  });

  useEffect(() => () => resizeCleanupRef.current?.(), []);

  const setRefs = (node: HTMLDivElement | null) => {
    nodeRef.current = node;
    draggable.setNodeRef(node);
  };

  const toSelectEvent = (event: React.PointerEvent | React.MouseEvent): AllocationSelectEvent => ({
    altKey: event.altKey,
    clientX: event.clientX,
    clientY: event.clientY,
    currentTarget: event.currentTarget as HTMLElement,
    horizontal: false
  });

  const listeners = {
    ...draggable.listeners,
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if ((event.target as HTMLElement).closest(".resize-handle, .allocation-delete")) return;
      onSelect(allocation.id, toSelectEvent(event));
      const rect = event.currentTarget.getBoundingClientRect();
      originRef.current = { left: rect.left, top: rect.top };
      draggable.listeners?.onPointerDown?.(event);
    }
  };

  const onHandlePointerDown = (direction: "start" | "end") => (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    onSelect(allocation.id, toSelectEvent(event));
    resizeCleanupRef.current?.();

    const initialY = event.clientY;
    const baseTop = top;
    const baseHeight = height;
    const minHeight = SLOT_HEIGHT - 2;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaY = moveEvent.clientY - initialY;
      if (direction === "start") {
        const nextTop = clamp(baseTop + deltaY, 0, baseTop + baseHeight - minHeight);
        setResizePreview({ top: nextTop, height: baseTop + baseHeight - nextTop });
      } else {
        setResizePreview({
          top: baseTop,
          height: clamp(baseHeight + deltaY, minHeight, gridExtent - baseTop)
        });
      }
    };

    const finish = (upEvent: PointerEvent) => {
      const slots = Math.round((upEvent.clientY - initialY) / SLOT_HEIGHT);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      resizeCleanupRef.current = null;
      if (slots !== 0) onResize(allocation.id, direction, slots);
      setResizePreview(null);
    };

    resizeCleanupRef.current = () => {
      setResizePreview(null);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      resizeCleanupRef.current = null;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    onPointerMove(event.nativeEvent);
  };

  const origin = originRef.current;
  const floating = draggable.isDragging && origin;
  const displayTop = resizePreview?.top ?? top;
  const displayHeight = resizePreview?.height ?? height;

  return (
    <div
      ref={setRefs}
      className={`allocation ${overlap ? "overlap" : ""} ${selected ? "selected" : ""} ${draggable.isDragging ? "is-dragging" : ""}`}
      style={
        floating
          ? {
              position: "fixed",
              left: origin.left,
              top: origin.top,
              width,
              height: displayHeight,
              background: activity.color,
              transform: CSS.Translate.toString(draggable.transform),
              zIndex: 10000,
              boxShadow: "0 12px 32px rgba(15, 23, 42, 0.35)",
              cursor: "grabbing",
              margin: 0,
              opacity: 0.95
            }
          : {
              top: displayTop,
              height: displayHeight,
              width,
              background: activity.color
            }
      }
      {...listeners}
      {...draggable.attributes}
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(allocation.id, toSelectEvent(event));
      }}
    >
      <div className="resize-handle top" onPointerDown={onHandlePointerDown("start")} />
      <button
        className="allocation-delete"
        type="button"
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect(allocation.id, toSelectEvent(event));
        }}
        onClick={(event) => {
          event.stopPropagation();
          onDelete(allocation.id);
        }}
        title="Delete allocation"
      >
        ×
      </button>
      <span>{activity.name}</span>
      <div className="resize-handle bottom" onPointerDown={onHandlePointerDown("end")} />
    </div>
  );
}

type AllocationCardHorizontalProps = {
  allocation: Allocation;
  activity: Activity;
  left: number;
  width: number;
  height: number;
  gridExtent: number;
  overlap: boolean;
  selected: boolean;
  blockTitle: string;
  onSelect: (allocationId: string, event: AllocationSelectEvent) => void;
  onDelete: (allocationId: string) => void;
  onResize: (allocationId: string, direction: "start" | "end", deltaSlots: number) => void;
};

function AllocationCardHorizontal({
  allocation,
  activity,
  left,
  width,
  height,
  gridExtent,
  overlap,
  selected,
  blockTitle,
  onSelect,
  onDelete,
  onResize
}: AllocationCardHorizontalProps) {
  const originRef = useRef<{ left: number; top: number } | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const [resizePreview, setResizePreview] = useState<{ left: number; width: number } | null>(null);
  const draggable = useDraggable({
    id: `allocation:${allocation.id}`,
    data: {
      type: "allocation",
      allocationId: allocation.id,
      width,
      height,
      horizontal: true
    }
  });

  useEffect(() => () => resizeCleanupRef.current?.(), []);

  const toSelectEvent = (event: React.PointerEvent | React.MouseEvent): AllocationSelectEvent => ({
    altKey: event.altKey,
    clientX: event.clientX,
    clientY: event.clientY,
    currentTarget: event.currentTarget as HTMLElement,
    horizontal: true
  });

  const listeners = {
    ...draggable.listeners,
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if ((event.target as HTMLElement).closest(".resize-handle, .allocation-delete")) return;
      onSelect(allocation.id, toSelectEvent(event));
      const rect = event.currentTarget.getBoundingClientRect();
      originRef.current = { left: rect.left, top: rect.top };
      draggable.listeners?.onPointerDown?.(event);
    }
  };

  const onHandlePointerDown = (direction: "start" | "end") => (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    onSelect(allocation.id, toSelectEvent(event));
    resizeCleanupRef.current?.();

    const initialX = event.clientX;
    const baseLeft = left;
    const baseWidth = width;
    const minWidth = TRANSPOSE_SLOT_WIDTH - 2;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - initialX;
      if (direction === "start") {
        const nextLeft = clamp(baseLeft + deltaX, 0, baseLeft + baseWidth - minWidth);
        setResizePreview({ left: nextLeft, width: baseLeft + baseWidth - nextLeft });
      } else {
        setResizePreview({
          left: baseLeft,
          width: clamp(baseWidth + deltaX, minWidth, gridExtent - baseLeft)
        });
      }
    };

    const finish = (upEvent: PointerEvent) => {
      const slots = Math.round((upEvent.clientX - initialX) / TRANSPOSE_SLOT_WIDTH);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      resizeCleanupRef.current = null;
      if (slots !== 0) onResize(allocation.id, direction, slots);
      setResizePreview(null);
    };

    resizeCleanupRef.current = () => {
      setResizePreview(null);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      resizeCleanupRef.current = null;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    onPointerMove(event.nativeEvent);
  };

  const origin = originRef.current;
  const floating = draggable.isDragging && origin;
  const displayLeft = resizePreview?.left ?? left;
  const displayWidth = resizePreview?.width ?? width;

  return (
    <div
      ref={draggable.setNodeRef}
      className={`allocation horizontal ${overlap ? "overlap" : ""} ${selected ? "selected" : ""} ${draggable.isDragging ? "is-dragging" : ""}`}
      style={
        floating
          ? {
              position: "fixed",
              left: origin.left,
              top: origin.top,
              width: displayWidth,
              height,
              background: activity.color,
              transform: CSS.Translate.toString(draggable.transform),
              zIndex: 10000,
              boxShadow: "0 12px 32px rgba(15, 23, 42, 0.35)",
              cursor: "grabbing",
              margin: 0,
              opacity: 0.95
            }
          : {
              left: displayLeft,
              width: displayWidth,
              height,
              background: activity.color
            }
      }
      {...listeners}
      {...draggable.attributes}
      title={blockTitle}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(allocation.id, toSelectEvent(event));
      }}
    >
      <div className="resize-handle left" onPointerDown={onHandlePointerDown("start")} />
      <button
        className="allocation-delete"
        type="button"
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect(allocation.id, toSelectEvent(event));
        }}
        onClick={(event) => {
          event.stopPropagation();
          onDelete(allocation.id);
        }}
      >
        ×
      </button>
      <span>{activity.name}</span>
      <div className="resize-handle right" onPointerDown={onHandlePointerDown("end")} />
    </div>
  );
}

export default App;
