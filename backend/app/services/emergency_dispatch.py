import asyncio
import base64
import json
import logging
from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.emergency import EmergencyContact, EmergencyDelivery, EmergencyEvent
from sqlalchemy import select

logger = logging.getLogger(__name__)


def _message(event: EmergencyEvent) -> str:
    location = event.maps_url or "Location unavailable"
    coordinates = f"{event.latitude}, {event.longitude}" if event.latitude is not None and event.longitude is not None else "unavailable"
    timestamp = event.created_at.isoformat() if event.created_at else datetime.now(timezone.utc).isoformat()
    return (
        f"EMERGENCY ALERT | ID: {event.emergency_id} | User: {event.user_name} | "
        f"Type: {event.emergency_type} | Coordinates: {coordinates} | Maps: {location} | Time: {timestamp}"
    )


def _post_form(url: str, data: dict, headers: dict | None = None) -> dict:
    request = Request(url, data=urlencode(data).encode(), headers=headers or {}, method="POST")
    with urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode() or "{}")


def _send_twilio_sms(phone: str, body: str) -> str:
    if not all((settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN, settings.SMS_FROM_NUMBER)):
        raise RuntimeError("Twilio SMS is not configured")
    token = base64.b64encode(f"{settings.TWILIO_ACCOUNT_SID}:{settings.TWILIO_AUTH_TOKEN}".encode()).decode()
    result = _post_form(
        f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json",
        {"From": settings.SMS_FROM_NUMBER, "To": phone, "Body": body},
        {"Authorization": f"Basic {token}"},
    )
    return result.get("sid", "")


async def _deliver(delivery_id: int, event: EmergencyEvent, channel: str, recipient: str | None) -> None:
    body = _message(event)
    status = "failed"
    provider_id = None
    error = None
    for attempt in range(1, 4):
        try:
            if channel == "sms":
                provider_id = await asyncio.to_thread(_send_twilio_sms, recipient, body)
            elif channel == "whatsapp":
                raise RuntimeError("Official WhatsApp provider adapter is not configured")
            elif channel == "push":
                raise RuntimeError("FCM device token is not configured for this contact")
            elif channel == "rescue_dashboard":
                logger.info("Emergency %s dispatched to rescue dashboard", event.emergency_id)
            else:
                raise RuntimeError(f"Unknown emergency channel: {channel}")
            status = "sent"
            error = None
            break
        except Exception as exc:
            error = str(exc)
            logger.warning("Emergency %s delivery attempt %s failed on %s: %s", event.emergency_id, attempt, channel, error)
            if attempt < 3:
                await asyncio.sleep(2 ** (attempt - 1))

    async with AsyncSessionLocal() as db:
        delivery = await db.get(EmergencyDelivery, delivery_id)
        if delivery:
            delivery.status = status
            delivery.attempts = 3 if status == "failed" else 1
            delivery.provider_message_id = provider_id
            delivery.error = error
            delivery.dispatched_at = datetime.now(timezone.utc)
            if status == "sent":
                delivery.delivered_at = datetime.now(timezone.utc)
            await db.commit()


async def dispatch_emergency(emergency_id: str) -> None:
    async with AsyncSessionLocal() as db:
        event_result = await db.execute(select(EmergencyEvent).where(EmergencyEvent.emergency_id == emergency_id))
        event = event_result.scalar_one_or_none()
        if event is None:
            logger.error("Cannot dispatch unknown emergency %s", emergency_id)
            return

        contacts_result = await db.execute(
            select(EmergencyContact).where(EmergencyContact.user_id == event.user_id).order_by(EmergencyContact.priority)
        )
        contacts = contacts_result.scalars().all()
        deliveries = [EmergencyDelivery(emergency_id=emergency_id, channel="rescue_dashboard")]
        deliveries.extend(EmergencyDelivery(emergency_id=emergency_id, channel="sms", recipient=contact.phone) for contact in contacts)
        if settings.WHATSAPP_ENABLED:
            deliveries.extend(EmergencyDelivery(emergency_id=emergency_id, channel="whatsapp", recipient=contact.phone) for contact in contacts)
        db.add_all(deliveries)
        event.status = "dispatching"
        event.dispatched_at = datetime.now(timezone.utc)
        await db.commit()
        for delivery in deliveries:
            await db.refresh(delivery)

    await asyncio.gather(*(_deliver(delivery.id, event, delivery.channel, delivery.recipient) for delivery in deliveries))
    async with AsyncSessionLocal() as db:
        event = (await db.execute(select(EmergencyEvent).where(EmergencyEvent.emergency_id == emergency_id))).scalar_one()
        event.status = "processed"
        await db.commit()
