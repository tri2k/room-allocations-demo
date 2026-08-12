import { DndContext, type DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  Fragment,
  useEffect,
  useMemo,
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

type MergeMeta = {
  isLeader: boolean;
  span: number;
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
    try {
      await reseed();
      await reload();
    } catch (error) {
      setBoot("error");
      setBootMessage(error instanceof Error ? error.message : "Reseed failed");
    }
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
          <button className="reset-button" onClick={() => void onReseed()}>
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
  const [selectedAllocationId, setSelectedAllocationId] = useState<string | null>(null);
  const [collapsedBuildings, setCollapsedBuildings] = useState<Set<string>>(new Set());
  const [collapsedFloors, setCollapsedFloors] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string>("");
  const [orientation, setOrientation] = useState<"normal" | "transposed">(
    () => (localStorage.getItem(ORIENTATION_KEY) === "transposed" ? "transposed" : "normal")
  );

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
  const mergedNormalMeta = useMemo(() => {
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
    for (const allocation of state.allocations) {
      if (!roomIndexById.has(allocation.roomId)) continue;
      const key = `${allocation.activityId}|${allocation.startAt}|${allocation.endAt}`;
      roomKeyToAllocation.get(allocation.roomId)?.set(key, allocation);
    }

    for (const allocation of state.allocations) {
      const baseIndex = roomIndexById.get(allocation.roomId);
      if (baseIndex === undefined) continue;
      const key = `${allocation.activityId}|${allocation.startAt}|${allocation.endAt}`;

      const leftRoomId = slotRoomIds[baseIndex - 1];
      if (leftRoomId && roomKeyToAllocation.get(leftRoomId)?.has(key)) {
        meta.set(allocation.id, { isLeader: false, span: 0 });
        continue;
      }

      let span = 1;
      let cursor = baseIndex + 1;
      while (cursor < slotRoomIds.length) {
        const nextRoomId = slotRoomIds[cursor];
        if (!nextRoomId) break;
        if (!roomKeyToAllocation.get(nextRoomId)?.has(key)) break;
        span += 1;
        cursor += 1;
      }
      meta.set(allocation.id, { isLeader: true, span });
    }

    return meta;
  }, [gridSlots, state.allocations]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    localStorage.setItem(ORIENTATION_KEY, orientation);
  }, [orientation]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!selectedAllocationId) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      event.preventDefault();
      void removeAllocation(selectedAllocationId);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedAllocationId]);

  const resetToSeed = async () => {
    await onReseed();
    setSelectedRoomIds([]);
    setSelectedAllocationId(null);
    setCollapsedBuildings(new Set());
    setCollapsedFloors(new Set());
    setToast("Reset to seed schedule");
  };

  const replaceAllocation = (allocation: Allocation) => {
    setState((previous) =>
      previous
        ? {
            ...previous,
            allocations: previous.allocations.map((entry) => (entry.id === allocation.id ? allocation : entry))
          }
        : previous
    );
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

    const next = { ...source, roomId, startAt, endAt };
    replaceAllocation(next);
    void (async () => {
      try {
        const result = await patchAllocation(source.id, { roomId, startAt, endAt });
        replaceAllocation(result.allocation);
      } catch (error) {
        replaceAllocation(source);
        if (error instanceof ApiError && error.status === 409) setToast("Move blocked (overlap)");
        else setToast(error instanceof Error ? error.message : "Move failed");
      }
    })();
  };

  const onResize = (allocationId: string, direction: "start" | "end", deltaSlots: number) => {
    const allocation = state.allocations.find((entry) => entry.id === allocationId);
    if (!allocation) return;

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
    const next = {
      ...allocation,
      startAt: buildIso(state.event.eventDate, slotToTime(state.event.gridStart, state.event.slotMinutes, nextStart)),
      endAt: buildIso(state.event.eventDate, slotToTime(state.event.gridStart, state.event.slotMinutes, nextEnd))
    };
    replaceAllocation(next);
    void (async () => {
      try {
        const result = await patchAllocation(allocation.id, { startAt: next.startAt, endAt: next.endAt });
        replaceAllocation(result.allocation);
      } catch (error) {
        replaceAllocation(allocation);
        if (error instanceof ApiError && error.status === 409) setToast("Resize blocked (overlap)");
        else setToast(error instanceof Error ? error.message : "Resize failed");
      }
    })();
  };

  const removeAllocation = async (allocationId: string) => {
    const previous = state.allocations;
    setState((current) =>
      current
        ? { ...current, allocations: current.allocations.filter((allocation) => allocation.id !== allocationId) }
        : current
    );
    setSelectedAllocationId((current) => (current === allocationId ? null : current));
    try {
      await deleteAllocation(allocationId);
      setToast("Deleted allocation");
    } catch (error) {
      setState((current) => (current ? { ...current, allocations: previous } : current));
      setToast(error instanceof Error ? error.message : "Delete failed");
    }
  };

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
  const transposeBuildingBands = useMemo(() => {
    const bands: Array<{ id: string; buildingId: string; label: string; start: number; span: number }> = [];
    let index = 0;
    while (index < columns.length) {
      const current = columns[index];
      let span = 1;
      while (index + span < columns.length && columns[index + span].building.id === current.building.id) {
        span += 1;
      }
      bands.push({
        id: `band-building-${current.building.id}-${index}`,
        buildingId: current.building.id,
        label: current.building.code,
        start: index,
        span
      });
      index += span;
    }
    return bands;
  }, [columns]);

  const transposeFloorBands = useMemo(() => {
    const bands: Array<{ id: string; floorId: string | null; label: string; start: number; span: number }> = [];
    let index = 0;
    while (index < columns.length) {
      const current = columns[index];
      const floorId = current.floor?.id ?? null;
      let span = 1;
      while (index + span < columns.length && (columns[index + span].floor?.id ?? null) === floorId) {
        span += 1;
      }
      bands.push({
        id: `band-floor-${floorId ?? "none"}-${index}`,
        floorId,
        label: floorId ? `F${current.floor?.label}` : "N/A",
        start: index,
        span
      });
      index += span;
    }
    return bands;
  }, [columns]);

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
    <DndContext onDragEnd={handleDragEnd}>
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
                <>
                  <div className="header-row building-row" style={{ marginLeft: 120 }}>
                    {buildingGroups.map((group) => (
                      <button
                        key={group.building.id}
                        className={`header-button building ${group.collapsed ? "collapsed" : ""}`}
                        style={{ width: group.span * COLUMN_WIDTH }}
                        title={group.collapsed ? "Double-click to expand" : "Click to select · Double-click to collapse"}
                        onClick={(event) => {
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
                              ? "Click or double-click to expand"
                              : "Building collapsed"
                            : group.floorId
                              ? "Click to select · Double-click to collapse"
                              : undefined
                        }
                        onClick={(event) => {
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
                </>
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
                          onDelete={(id) => void removeAllocation(id)}
                          selectedAllocationId={selectedAllocationId}
                          onSelectAllocation={setSelectedAllocationId}
                          blockTitle={blockTitle}
                          mergeMeta={mergedNormalMeta}
                        />
                      )
                    )}
                  </div>
                </div>
              ) : (
                <div className="transpose-shell">
                  <div className="transpose-phase-strip" style={{ marginLeft: TRANSPOSE_LABEL_WIDTH, width: transposeWidth }}>
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

                  <div className="transpose-time-header" style={{ marginLeft: TRANSPOSE_LABEL_WIDTH, width: transposeWidth }}>
                    {Array.from({ length: slotCount }).map((_, slotIndex) => {
                      const hhmm = slotToTime(state.event.gridStart, state.event.slotMinutes, slotIndex);
                      return (
                        <div key={hhmm} className="transpose-time-cell" style={{ width: TRANSPOSE_SLOT_WIDTH }}>
                          {slotIndex % 2 === 0 ? hhmm : ""}
                        </div>
                      );
                    })}
                  </div>

                  <div
                    className="transpose-grid"
                    style={{
                      gridTemplateColumns: `32px 32px 196px ${transposeWidth}px`,
                      gridTemplateRows: `repeat(${columns.length}, ${TRANSPOSE_ROW_HEIGHT}px)`
                    }}
                  >
                    {transposeBuildingBands.map((band) => (
                      <button
                        key={band.id}
                        className="transpose-sideways building"
                        style={{ gridColumn: "1", gridRow: `${band.start + 1} / span ${band.span}` }}
                        onClick={(event) => selectBuilding(band.buildingId, event.shiftKey)}
                        title={band.label}
                      >
                        <span>{band.label}</span>
                      </button>
                    ))}

                    {transposeFloorBands.map((band) => (
                      <button
                        key={band.id}
                        className="transpose-sideways floor"
                        style={{ gridColumn: "2", gridRow: `${band.start + 1} / span ${band.span}` }}
                        onClick={(event) => {
                          if (band.floorId) selectFloor(band.floorId, event.shiftKey);
                        }}
                        title={band.label}
                      >
                        <span>{band.label}</span>
                      </button>
                    ))}

                    {columns.map((column, rowIndex) => {
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
                            onClick={() => setSelectedAllocationId(null)}
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
                              const merged = mergedNormalMeta.get(allocation.id);
                              if (merged && !merged.isLeader) return null;
                              const startSlot = allocationStartSlot(
                                state.event.eventDate,
                                state.event.gridStart,
                                state.event.slotMinutes,
                                allocation.startAt
                              );
                              const span = getBlockSpan(allocation);
                              return (
                                <AllocationCardHorizontal
                                  key={allocation.id}
                                  allocation={allocation}
                                  activity={activity}
                                  left={startSlot * TRANSPOSE_SLOT_WIDTH}
                                  width={span * TRANSPOSE_SLOT_WIDTH - 2}
                                  height={(merged?.span ?? 1) * TRANSPOSE_ROW_HEIGHT - 2}
                                  overlap={overlapsSet.has(allocation.id)}
                                  selected={selectedAllocationId === allocation.id}
                                  blockTitle={blockTitle(activity, allocation)}
                                  onSelect={setSelectedAllocationId}
                                  onDelete={(id) => void removeAllocation(id)}
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
  const draggable = useDraggable({
    id: `palette:${activity.id}`,
    data: { type: "palette", activityId: activity.id }
  });

  return (
    <button
      ref={draggable.setNodeRef}
      {...draggable.listeners}
      {...draggable.attributes}
      className="palette-item"
      style={{
        background: activity.color,
        transform: CSS.Translate.toString(draggable.transform),
        opacity: draggable.isDragging ? 0.6 : 1
      }}
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
  selectedAllocationId: string | null;
  onSelectAllocation: (allocationId: string | null) => void;
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
  selectedAllocationId,
  onSelectAllocation,
  blockTitle,
  mergeMeta
}: RoomColumnProps) {
  return (
    <div
      className={`room-column ${selected ? "selected" : ""}`}
      style={{ width: COLUMN_WIDTH }}
      onClick={() => onSelectAllocation(null)}
    >
      {Array.from({ length: slotCount }).map((_, slotIndex) => (
        <DroppableCell key={`${roomId}:${slotIndex}`} roomId={roomId} slotIndex={slotIndex} slotHeight={slotHeight} />
      ))}

      {allocations.map((allocation) => {
        const activity = activitiesById.get(allocation.activityId);
        if (!activity) return null;
        const merged = mergeMeta.get(allocation.id);
        if (merged && !merged.isLeader) return null;
        const startSlot = allocationStartSlot(eventDate, gridStart, slotMinutes, allocation.startAt);
        const endSlot = allocationStartSlot(eventDate, gridStart, slotMinutes, allocation.endAt);
        const span = Math.max(1, endSlot - startSlot);
        const width = ((merged?.span ?? 1) * COLUMN_WIDTH) - 4;

        return (
          <AllocationCard
            key={allocation.id}
            allocation={allocation}
            activity={activity}
            top={startSlot * slotHeight}
            height={span * slotHeight - 2}
            width={width}
            overlap={overlapIds.has(allocation.id)}
            onResize={onResize}
            onDelete={onDelete}
            selected={selectedAllocationId === allocation.id}
            onSelect={onSelectAllocation}
            title={blockTitle(activity, allocation)}
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
  overlap: boolean;
  onResize: (allocationId: string, direction: "start" | "end", deltaSlots: number) => void;
  onDelete: (allocationId: string) => void;
  selected: boolean;
  onSelect: (allocationId: string | null) => void;
  title: string;
};

function AllocationCard({
  allocation,
  activity,
  top,
  height,
  width,
  overlap,
  onResize,
  onDelete,
  selected,
  onSelect,
  title
}: AllocationCardProps) {
  const draggable = useDraggable({
    id: `allocation:${allocation.id}`,
    data: { type: "allocation", allocationId: allocation.id }
  });

  const onHandlePointerDown = (direction: "start" | "end") => (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    const initialY = event.clientY;
    const onPointerUp = (upEvent: PointerEvent) => {
      const slots = Math.round((upEvent.clientY - initialY) / SLOT_HEIGHT);
      if (slots !== 0) onResize(allocation.id, direction, slots);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointerup", onPointerUp);
  };

  return (
    <div
      ref={draggable.setNodeRef}
      className={`allocation ${overlap ? "overlap" : ""} ${selected ? "selected" : ""}`}
      style={{
        top,
        height,
        width,
        background: activity.color,
        transform: CSS.Translate.toString(draggable.transform),
        opacity: draggable.isDragging ? 0.75 : 1
      }}
      {...draggable.listeners}
      {...draggable.attributes}
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(allocation.id);
      }}
    >
      <div className="resize-handle top" onPointerDown={onHandlePointerDown("start")} />
      <button
        className="allocation-delete"
        type="button"
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect(allocation.id);
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
  overlap: boolean;
  selected: boolean;
  blockTitle: string;
  onSelect: (allocationId: string | null) => void;
  onDelete: (allocationId: string) => void;
  onResize: (allocationId: string, direction: "start" | "end", deltaSlots: number) => void;
};

function AllocationCardHorizontal({
  allocation,
  activity,
  left,
  width,
  height,
  overlap,
  selected,
  blockTitle,
  onSelect,
  onDelete,
  onResize
}: AllocationCardHorizontalProps) {
  const draggable = useDraggable({
    id: `allocation:${allocation.id}`,
    data: { type: "allocation", allocationId: allocation.id }
  });

  const onHandlePointerDown = (direction: "start" | "end") => (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    const initialX = event.clientX;
    const onPointerUp = (upEvent: PointerEvent) => {
      const slots = Math.round((upEvent.clientX - initialX) / TRANSPOSE_SLOT_WIDTH);
      if (slots !== 0) onResize(allocation.id, direction, slots);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointerup", onPointerUp);
  };

  return (
    <div
      ref={draggable.setNodeRef}
      className={`allocation horizontal ${overlap ? "overlap" : ""} ${selected ? "selected" : ""}`}
      style={{
        left,
        width,
        height,
        background: activity.color,
        transform: CSS.Translate.toString(draggable.transform),
        opacity: draggable.isDragging ? 0.75 : 1
      }}
      {...draggable.listeners}
      {...draggable.attributes}
      title={blockTitle}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(allocation.id);
      }}
    >
      <div className="resize-handle left" onPointerDown={onHandlePointerDown("start")} />
      <button
        className="allocation-delete"
        type="button"
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect(allocation.id);
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
