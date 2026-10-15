import os
import uuid
import json
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import get_current_user, router as auth_router
from app.db.session import get_async_session
from app.models.emergency import EmergencyContact, EmergencyEvent
from app.models.user import User
from app.schemas.emergency import (
    EmergencyContactInput,
    EmergencyContactRead,
    EmergencyContactsUpdateRequest,
    EmergencyCreate,
    EmergencyRead,
)
from app.services.emergency_dispatch import dispatch_emergency

try:
    from google import genai
    from google.genai import types
except Exception:  # pragma: no cover
    genai = None
    types = None


class ChatRequest(BaseModel):
    message: str


api_router = APIRouter()

api_router.include_router(auth_router, prefix="/auth", tags=["auth"])


@api_router.get("/emergency-contacts", response_model=list[EmergencyContactRead])
async def list_emergency_contacts(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_session)
):
    result = await db.execute(select(EmergencyContact).where(EmergencyContact.user_id == current_user.id).order_by(EmergencyContact.priority))
    return result.scalars().all()


async def _replace_emergency_contacts(
    payload: EmergencyContactsUpdateRequest,
    current_user: User,
    db: AsyncSession,
):
    await db.execute(delete(EmergencyContact).where(EmergencyContact.user_id == current_user.id))
    records = [
        EmergencyContact(
            user_id=current_user.id,
            name=contact.name,
            phone=contact.phone_number,
            relationship=contact.relationship,
            priority=priority,
        )
        for priority, contact in enumerate(payload.contacts, start=1)
    ]
    db.add_all(records)
    await db.commit()
    for record in records:
        await db.refresh(record)
    return records


@api_router.put("/contacts", response_model=list[EmergencyContactRead])
async def replace_contacts(
    payload: EmergencyContactsUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await _replace_emergency_contacts(payload, current_user, db)


@api_router.put("/emergency-contacts", response_model=list[EmergencyContactRead])
async def replace_emergency_contacts(
    payload: EmergencyContactsUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await _replace_emergency_contacts(payload, current_user, db)


@api_router.post("/emergencies", response_model=EmergencyRead, status_code=202)
async def create_emergency(
    payload: EmergencyCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_session),
):
    existing = await db.execute(
        select(EmergencyEvent).where(
            EmergencyEvent.user_id == current_user.id,
            EmergencyEvent.idempotency_key == payload.idempotency_key,
        )
    )
    event = existing.scalar_one_or_none()
    if event is not None:
        return event

    maps_url = None
    if payload.latitude is not None and payload.longitude is not None:
        maps_url = f"https://maps.google.com/?q={payload.latitude},{payload.longitude}"

    event = EmergencyEvent(
        emergency_id=f"EM-{uuid.uuid4().hex.upper()}",
        user_id=current_user.id,
        user_name=current_user.name,
        emergency_type=payload.emergency_type,
        trigger=payload.trigger,
        latitude=payload.latitude,
        longitude=payload.longitude,
        maps_url=maps_url,
        live_location=json.dumps(payload.live_location) if payload.live_location else None,
        idempotency_key=payload.idempotency_key,
        status="received",
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    background_tasks.add_task(dispatch_emergency, event.emergency_id)
    return event


@api_router.post("/emergencies/{emergency_id}/location", response_model=EmergencyRead)
async def update_emergency_location(
    emergency_id: str,
    payload: dict,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_session),
):
    result = await db.execute(select(EmergencyEvent).where(EmergencyEvent.emergency_id == emergency_id, EmergencyEvent.user_id == current_user.id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Emergency event not found")
    event.latitude = payload.get("latitude", event.latitude)
    event.longitude = payload.get("longitude", event.longitude)
    event.maps_url = f"https://maps.google.com/?q={event.latitude},{event.longitude}" if event.latitude is not None and event.longitude is not None else event.maps_url
    event.live_location = json.dumps(payload)
    await db.commit()
    await db.refresh(event)
    return event


@api_router.get("/emergencies", response_model=list[EmergencyRead])
async def list_emergencies(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_session)
):
    result = await db.execute(
        select(EmergencyEvent).where(EmergencyEvent.user_id == current_user.id).order_by(EmergencyEvent.created_at.desc())
    )
    return result.scalars().all()


@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "AI Women's Security API"}


@api_router.get("/evidence")
async def list_evidence(
    report_type: Optional[Literal["sos_hardware", "manual_public"]] = Query(
        default=None,
        description="Filter evidence by report source: sos_hardware or manual_public",
    )
):
    """
    Returns officer evidence separated by report source.

    Examples:
    - /api/v1/evidence?report_type=sos_hardware
    - /api/v1/evidence?report_type=manual_public
    - /api/v1/evidence
    """
    mock_records = [
        {
            "id": "evidence-1",
            "report_type": "sos_hardware",
            "hardware_id": "sos-1725200000000",
            "timestamp": 1725200000000,
            "location": {"latitude": 12.9716, "longitude": 77.5946},
            "audio_uri": "https://example.com/audio.mp3",
            "video_uri": "https://example.com/video.mp4",
            "photo_uri": "https://example.com/photo.jpg",
        },
        {
            "id": "public-report-1",
            "report_type": "manual_public",
            "title": "Harassment at bus stop",
            "category": "Harassment",
            "description": "A person followed me after the bus stop.",
            "location": "Near MG Road",
            "timestamp": 1725203600000,
            "photo_uri": "https://example.com/public-photo.jpg",
        },
    ]

    filtered = mock_records if report_type is None else [
        item for item in mock_records if item.get("report_type") == report_type
    ]

    return {
        "report_type": report_type,
        "count": len(filtered),
        "items": filtered,
    }


@api_router.post("/incidents/report")
async def submit_public_incident(payload: dict):
    """Manual community reports must always be tagged as manual_public."""
    payload["report_type"] = "manual_public"
    payload.setdefault("timestamp", __import__("time").time() * 1000)
    return {
        "ok": True,
        "message": "Public manual report stored successfully.",
        "record": payload,
    }


@api_router.post("/evidence/sos")
async def submit_sos_evidence(payload: dict):
    """Automated SOS hardware sessions must always be tagged as sos_hardware."""
    payload["report_type"] = "sos_hardware"
    payload.setdefault("timestamp", __import__("time").time() * 1000)
    return {
        "ok": True,
        "message": "SOS hardware evidence stored successfully.",
        "record": payload,
    }


@api_router.post("/chat")
async def chat_with_assistant(payload: ChatRequest):
    """Women Safety Assistant powered by Gemini."""
    message = (payload.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required.")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured on the backend.")

    if genai is None or types is None:
        raise HTTPException(status_code=500, detail="google-genai is not installed.")

    model_name = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

    try:
        # Do not inherit a machine-wide proxy implicitly. In particular, dev
        # environments can export a placeholder proxy that is not running.
        # Set GEMINI_PROXY_URL explicitly when this backend needs a proxy.
        client_args = {"trust_env": False}
        proxy_url = os.getenv("GEMINI_PROXY_URL")
        if proxy_url:
            client_args["proxy"] = proxy_url
        client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(client_args=client_args, timeout=120_000),
        )
        system_instruction = (
            "You are a calm, helpful, and empowering Women Safety Assistant. "
            "Give practical advice on personal safety, emergency preparedness, legal rights, "
            "domestic safety, harassment prevention, documentation strategies, immediate actions, "
            "and how to contact trusted help. Keep responses reassuring, clear, and actionable. "
            "Avoid judgmental language. Encourage reaching out to trusted people, local authorities, "
            "or emergency services when the situation is urgent. Do not invent local laws, phone numbers, "
            "or facts. Ask for the user's country or region when location-specific guidance is needed, "
            "and clearly label general information versus legal advice."
        )

        response = client.models.generate_content(
            model=model_name,
            contents=message,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                max_output_tokens=800,
                temperature=0.2,
            ),
        )
        reply = getattr(response, "text", None) or "I’m here to help. Please share your situation and I’ll offer practical guidance."
        return {"reply": reply.strip()}
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Chat generation failed: {str(exc)}") from exc
