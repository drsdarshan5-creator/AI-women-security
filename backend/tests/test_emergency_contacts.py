import asyncio

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.api.v1.auth import get_current_user
from app.db.base import Base
from app.db.session import get_async_session
from app.main import app
from app.models.user import User


def test_one_to_three_emergency_contacts_remain_saved_between_requests(tmp_path):
    database_path = tmp_path / "contacts.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{database_path}",
        poolclass=NullPool,
    )
    test_session_factory = sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def create_test_database():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with test_session_factory() as session:
            session.add(
                User(
                    id=1,
                    name="Test User",
                    email="contacts@example.test",
                    hashed_password="not-used",
                )
            )
            await session.commit()

    asyncio.run(create_test_database())

    async def override_get_async_session():
        async with test_session_factory() as session:
            yield session

    async def override_get_current_user():
        return User(
            id=1,
            name="Test User",
            email="contacts@example.test",
            hashed_password="not-used",
        )

    previous_session_override = app.dependency_overrides.get(get_async_session)
    previous_user_override = app.dependency_overrides.get(get_current_user)
    app.dependency_overrides[get_async_session] = override_get_async_session
    app.dependency_overrides[get_current_user] = override_get_current_user

    all_contacts = [
        {"name": "Contact One", "phone_number": "9876543210", "relationship": "Friend"},
        {"name": "Contact Two", "phone_number": "9876543211", "relationship": "Family"},
        {"name": "Contact Three", "phone_number": "9876543212", "relationship": "Colleague"},
    ]

    try:
        with TestClient(app) as client:
            for count in (1, 2, 3):
                contacts = all_contacts[:count]
                saved = client.put("/api/v1/emergency-contacts", json={"contacts": contacts})
                assert saved.status_code == 200
                assert [contact["phone"] for contact in saved.json()] == [
                    contact["phone_number"] for contact in contacts
                ]

                reloaded = client.get("/api/v1/emergency-contacts")
                assert reloaded.status_code == 200
                assert [contact["phone"] for contact in reloaded.json()] == [
                    contact["phone_number"] for contact in contacts
                ]

            remaining_contacts = all_contacts[:2]
            removed = client.put(
                "/api/v1/emergency-contacts",
                json={"contacts": remaining_contacts},
            )
            assert removed.status_code == 200
            reloaded = client.get("/api/v1/emergency-contacts")
            assert [contact["phone"] for contact in reloaded.json()] == [
                contact["phone_number"] for contact in remaining_contacts
            ]
            cleared = client.put("/api/v1/emergency-contacts", json={"contacts": []})
            assert cleared.status_code == 200
            assert cleared.json() == []
            reloaded = client.get("/api/v1/emergency-contacts")
            assert reloaded.status_code == 200
            assert reloaded.json() == []
    finally:
        if previous_session_override is None:
            app.dependency_overrides.pop(get_async_session, None)
        else:
            app.dependency_overrides[get_async_session] = previous_session_override
        if previous_user_override is None:
            app.dependency_overrides.pop(get_current_user, None)
        else:
            app.dependency_overrides[get_current_user] = previous_user_override
        asyncio.run(engine.dispose())