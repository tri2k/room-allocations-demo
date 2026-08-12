import type { Building, Floor, Room } from "../types/schedule";

export type GridColumn = {
  building: Building;
  floor: Floor | null;
  room: Room;
};

export type BuildingGroup = {
  building: Building;
  count: number;
};

export type FloorGroup = {
  id: string;
  label: string;
  count: number;
  floorId: string | null;
};

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

export const buildBuildingGroups = (buildings: Building[], columns: GridColumn[]): BuildingGroup[] =>
  buildings
    .map((building) => ({
      building,
      count: columns.filter((column) => column.building.id === building.id).length
    }))
    .filter((group) => group.count > 0);

export const buildFloorGroups = (buildings: Building[], columns: GridColumn[]): FloorGroup[] => {
  const groups: FloorGroup[] = [];
  for (const building of buildings) {
    const buildingColumns = columns.filter((column) => column.building.id === building.id);
    let index = 0;
    while (index < buildingColumns.length) {
      const current = buildingColumns[index];
      const floorId = current.floor?.id ?? null;
      let span = 1;
      while (index + span < buildingColumns.length && (buildingColumns[index + span].floor?.id ?? null) === floorId) {
        span += 1;
      }
      groups.push({
        id: `${building.id}:${floorId ?? "none"}:${index}`,
        label: floorId ? `Floor ${current.floor?.label}` : "No floor",
        count: span,
        floorId
      });
      index += span;
    }
  }
  return groups;
};
