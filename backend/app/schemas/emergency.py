from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator


class ContactEntry(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone_number: str = Field(min_length=10, max_length=10)
    relationship: str = Field(min_length=1, max_length=80)

    @field_validator("name", "relationship")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field is required.")
        return value

    @field_validator("phone_number")
    @classmethod
    def validate_phone_number(cls, value: str) -> str:
        if len(value) != 10 or not value.isascii() or not value.isdecimal():
            raise ValueError("Invalid Phone Number. Must be exactly 10 digits.")
        return value


class EmergencyContactsUpdateRequest(BaseModel):
    contacts: list[ContactEntry] = Field(min_length=3, max_length=3)

    @model_validator(mode="after")
    def validate_unique_phone_numbers(self):
        phone_numbers = [contact.phone_number for contact in self.contacts]
        if len(set(phone_numbers)) != 3:
            raise ValueError("Emergency contacts must have 3 unique phone numbers.")
        return self


class EmergencyContactInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=3, max_length=32)
    relationship: str | None = Field(default=None, max_length=80)
    priority: int = Field(default=1, ge=1, le=10)
    push_token: str | None = Field(default=None, max_length=512)


class EmergencyContactRead(EmergencyContactInput):
    id: int

    class Config:
        from_attributes = True


class EmergencyCreate(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=128)
    emergency_type: str = Field(default="sos", min_length=1, max_length=80)
    trigger: str = Field(default="manual", min_length=1, max_length=80)
    latitude: float | None = None
    longitude: float | None = None
    live_location: dict[str, Any] | None = None


class EmergencyRead(BaseModel):
    emergency_id: str
    user_name: str
    emergency_type: str
    trigger: str
    latitude: float | None
    longitude: float | None
    maps_url: str | None
    live_location: dict[str, Any] | None
    status: str
    created_at: datetime | None

    @field_validator("live_location", mode="before")
    @classmethod
    def parse_live_location(cls, value):
        if isinstance(value, str):
            import json
            return json.loads(value)
        return value

    class Config:
        from_attributes = True
