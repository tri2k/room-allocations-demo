from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.booking import get_active_building
from app.db import get_db
from app.errors import not_found
from app.models import Building, Floor
from app.schemas import BuildingCreate, BuildingOut, BuildingUpdate, FloorCreate, FloorOut
from app.serialize import building_out, floor_out
from app.write import commit_or_conflict

router = APIRouter(prefix="/api/v1", tags=["buildings"])


def _building(db: Session, building_id: UUID) -> Building:
    row = db.get(Building, building_id)
    if row is None:
        raise not_found("Building")
    return row


@router.get("/buildings", response_model=list[BuildingOut])
def list_buildings(db: Session = Depends(get_db)) -> list[BuildingOut]:
    rows = db.scalars(select(Building).order_by(Building.code)).all()
    return [building_out(row) for row in rows]


@router.post("/buildings", response_model=BuildingOut, status_code=201)
def create_building(body: BuildingCreate, db: Session = Depends(get_db)) -> BuildingOut:
    row = Building(code=body.code, name=body.name, address=body.address, tags=body.tags)
    db.add(row)
    commit_or_conflict(db)
    db.refresh(row)
    return building_out(row)


@router.get("/buildings/{building_id}", response_model=BuildingOut)
def get_building(building_id: UUID, db: Session = Depends(get_db)) -> BuildingOut:
    return building_out(_building(db, building_id))


@router.patch("/buildings/{building_id}", response_model=BuildingOut)
def update_building(building_id: UUID, body: BuildingUpdate, db: Session = Depends(get_db)) -> BuildingOut:
    row = _building(db, building_id)
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(row, key, value)
    commit_or_conflict(db)
    db.refresh(row)
    return building_out(row)


@router.delete("/buildings/{building_id}", response_model=BuildingOut)
def delete_building(building_id: UUID, db: Session = Depends(get_db)) -> BuildingOut:
    row = _building(db, building_id)
    row.is_active = False
    db.commit()
    db.refresh(row)
    return building_out(row)


@router.get("/buildings/{building_id}/floors", response_model=list[FloorOut])
def list_floors(building_id: UUID, db: Session = Depends(get_db)) -> list[FloorOut]:
    _building(db, building_id)
    rows = db.scalars(select(Floor).where(Floor.building_id == building_id).order_by(Floor.sort_order)).all()
    return [floor_out(row) for row in rows]


@router.post("/buildings/{building_id}/floors", response_model=FloorOut, status_code=201)
def create_floor(building_id: UUID, body: FloorCreate, db: Session = Depends(get_db)) -> FloorOut:
    get_active_building(db, building_id)
    row = Floor(building_id=building_id, label=body.label, sort_order=body.sort_order)
    db.add(row)
    commit_or_conflict(db)
    db.refresh(row)
    return floor_out(row)
