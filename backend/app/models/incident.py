from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.sql import func

from app.db.base import Base


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    reporter_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    description = Column(String, nullable=True)
    status = Column(String, default="reported")
    location = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
