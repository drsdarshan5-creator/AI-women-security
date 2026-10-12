from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from app.db.base import Base


class EmergencyEvent(Base):
    __tablename__ = "emergency_events"
    __table_args__ = (UniqueConstraint("user_id", "idempotency_key", name="uq_emergency_user_idempotency"),)

    id = Column(Integer, primary_key=True, index=True)
    emergency_id = Column(String, unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    user_name = Column(String, nullable=False)
    emergency_type = Column(String, nullable=False, default="sos")
    trigger = Column(String, nullable=False, default="manual")
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    maps_url = Column(String, nullable=True)
    live_location = Column(Text, nullable=True)
    idempotency_key = Column(String, nullable=False)
    status = Column(String, nullable=False, default="received")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    received_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    dispatched_at = Column(DateTime(timezone=True), nullable=True)


class EmergencyDelivery(Base):
    __tablename__ = "emergency_deliveries"

    id = Column(Integer, primary_key=True, index=True)
    emergency_id = Column(String, ForeignKey("emergency_events.emergency_id"), nullable=False, index=True)
    channel = Column(String, nullable=False)
    recipient = Column(String, nullable=True)
    status = Column(String, nullable=False, default="pending")
    attempts = Column(Integer, nullable=False, default=0)
    provider_message_id = Column(String, nullable=True)
    error = Column(Text, nullable=True)
    dispatched_at = Column(DateTime(timezone=True), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class EmergencyContact(Base):
    __tablename__ = "emergency_contacts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    relationship = Column(String, nullable=True)
    priority = Column(Integer, nullable=False, default=1)
    push_token = Column(String, nullable=True)
