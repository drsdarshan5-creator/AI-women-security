from pydantic import BaseModel


class IncidentCreate(BaseModel):
    reporter_id: int
    description: str | None = None
    latitude: float
    longitude: float


class IncidentRead(BaseModel):
    id: int
    reporter_id: int
    description: str | None = None
    status: str

    class Config:
        orm_mode = True
