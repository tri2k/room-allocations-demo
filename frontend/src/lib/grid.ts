import type { Building, Floor, Room } from "../types/schedule";

export type GridColumn = {
  building: Building;
  floor: Floor | null;
  room: Room;
};

export type BuildingGroup = {
  building: Building;
  /** Visible room columns under this building (0 when collapsed). */
  count: number;
  /** Header width in column units (at least 1 so collapsed headers stay clickable). */
  span: number;
  collapsed: boolean;
};

export type FloorGroup = {
  id: string;
  label: string;
  count: number;
  span: number;
  floorId: string | null;
  buildingId: string;
  collapsed: boolean;
};

/** Room columns interleaved with spacers so collapsed headers keep alignment. */
export type GridSlot =
  | { type: "room"; column: GridColumn }
  | { type: "spacer"; id: string };

export const orderColumns = (
  buildings: Building[],
  floors: Floor[],
  rooms: Room[],
  collapsedBuildings: Set<string>,
  collapsedFloors: Set<string>
): GridColumn[] =>
  buildings.flatMap((building) => {
    if (collapsedBuildings.has(building.id)) return [];
    const buildingFloors = floors
      .filter((floor) => floor.buildingId === building.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const byFloors = buildingFloors.flatMap((floor) => {
      if (collapsedFloors.has(floor.id)) return [];
      return rooms
        .filter((room) => room.buildingId === building.id && room.floorId === floor.id)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
        .map((room) => ({ building, floor, room }));
    });

    const noFloor = rooms
      .filter((room) => room.buildingId === building.id && room.floorId === null)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((room) => ({ building, floor: null, room }));

    return [...byFloors, ...noFloor];
  });

const roomsInBuilding = (rooms: Room[], buildingId: string): number =>
  rooms.filter((room) => room.buildingId === buildingId).length;

export const buildBuildingGroups = (
  buildings: Building[],
  rooms: Room[],
  columns: GridColumn[],
  floors: Floor[],
  collapsedBuildings: Set<string>,
  collapsedFloors: Set<string>
): BuildingGroup[] =>
  buildings
    .filter((building) => roomsInBuilding(rooms, building.id) > 0)
    .map((building) => {
      const collapsed = collapsedBuildings.has(building.id);
      const count = columns.filter((column) => column.building.id === building.id).length;
      if (collapsed) {
        return { building, count: 0, span: 1, collapsed: true };
      }
      const buildingFloors = floors.filter((floor) => floor.buildingId === building.id);
      const collapsedFloorStubs = buildingFloors.filter(
        (floor) =>
          collapsedFloors.has(floor.id) && rooms.some((room) => room.floorId === floor.id)
      ).length;
      const span = Math.max(1, count + collapsedFloorStubs);
      return { building, count, span, collapsed: false };
    });

export const buildFloorGroups = (
  buildings: Building[],
  floors: Floor[],
  rooms: Room[],
  columns: GridColumn[],
  collapsedBuildings: Set<string>,
  collapsedFloors: Set<string>
): FloorGroup[] => {
  const groups: FloorGroup[] = [];
  for (const building of buildings) {
    if (roomsInBuilding(rooms, building.id) === 0) continue;

    if (collapsedBuildings.has(building.id)) {
      groups.push({
        id: `${building.id}:building-collapsed`,
        label: "Collapsed",
        count: 0,
        span: 1,
        floorId: null,
        buildingId: building.id,
        collapsed: true
      });
      continue;
    }

    const buildingFloors = floors
      .filter((floor) => floor.buildingId === building.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    for (const floor of buildingFloors) {
      const floorRooms = rooms.filter((room) => room.floorId === floor.id);
      if (floorRooms.length === 0) continue;
      if (collapsedFloors.has(floor.id)) {
        groups.push({
          id: `${building.id}:${floor.id}:collapsed`,
          label: `Floor ${floor.label}`,
          count: 0,
          span: 1,
          floorId: floor.id,
          buildingId: building.id,
          collapsed: true
        });
        continue;
      }
      const count = columns.filter((column) => column.floor?.id === floor.id).length;
      groups.push({
        id: `${building.id}:${floor.id}`,
        label: `Floor ${floor.label}`,
        count,
        span: Math.max(1, count),
        floorId: floor.id,
        buildingId: building.id,
        collapsed: false
      });
    }

    const noFloorColumns = columns.filter(
      (column) => column.building.id === building.id && column.floor === null
    );
    if (noFloorColumns.length > 0) {
      groups.push({
        id: `${building.id}:none`,
        label: "No floor",
        count: noFloorColumns.length,
        span: noFloorColumns.length,
        floorId: null,
        buildingId: building.id,
        collapsed: false
      });
    }
  }
  return groups;
};

export const buildGridSlots = (
  buildings: Building[],
  floors: Floor[],
  rooms: Room[],
  collapsedBuildings: Set<string>,
  collapsedFloors: Set<string>
): GridSlot[] => {
  const slots: GridSlot[] = [];
  for (const building of buildings) {
    if (roomsInBuilding(rooms, building.id) === 0) continue;

    if (collapsedBuildings.has(building.id)) {
      slots.push({ type: "spacer", id: `spacer-building-${building.id}` });
      continue;
    }

    const buildingFloors = floors
      .filter((floor) => floor.buildingId === building.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    for (const floor of buildingFloors) {
      const floorRooms = rooms
        .filter((room) => room.buildingId === building.id && room.floorId === floor.id)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
      if (floorRooms.length === 0) continue;
      if (collapsedFloors.has(floor.id)) {
        slots.push({ type: "spacer", id: `spacer-floor-${floor.id}` });
        continue;
      }
      for (const room of floorRooms) {
        slots.push({ type: "room", column: { building, floor, room } });
      }
    }

    const noFloor = rooms
      .filter((room) => room.buildingId === building.id && room.floorId === null)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const room of noFloor) {
      slots.push({ type: "room", column: { building, floor: null, room } });
    }
  }
  return slots;
};

