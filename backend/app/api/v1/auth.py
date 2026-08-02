from datetime import datetime, timedelta
import re
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
from passlib.hash import pbkdf2_sha256
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_async_session
from app.models.user import User
from app.schemas.user import Token, UserCreate, UserLogin

router = APIRouter()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pbkdf2_sha256.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pbkdf2_sha256.hash(password)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta if expires_delta is not None else timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def normalize_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = re.sub(r"[^0-9]", "", phone)
    return digits if digits else None


@router.post("/register", response_model=Token)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_async_session)):
    normalized_email = user_in.email.lower().strip()
    normalized_phone = normalize_phone(user_in.phone)

    # Check email conflict first
    result = await db.execute(select(User).where(User.email == normalized_email))
    existing_email_user = result.scalar_one_or_none()
    if existing_email_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered.",
        )

    # Check phone conflict only if phone was provided
    if normalized_phone:
        result = await db.execute(select(User).where(User.phone == normalized_phone))
        existing_phone_user = result.scalar_one_or_none()
        if existing_phone_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Phone number already registered.",
            )

    user = User(
        email=normalized_email,
        name=user_in.name.strip(),
        phone=normalized_phone,
        hashed_password=get_password_hash(user_in.password),
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token({"sub": user.email, "user_id": user.id})

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user,
    }


@router.post("/login", response_model=Token)
async def login(user_in: UserLogin, db: AsyncSession = Depends(get_async_session)):
    identifier = user_in.identifier.strip()

    # If identifier looks like an email, compare lowercased email
    if "@" in identifier:
        normalized_identifier = identifier.lower()
        result = await db.execute(select(User).where(User.email == normalized_identifier))
    else:
        # Normalize phone identifier
        normalized_phone = normalize_phone(identifier)
        result = await db.execute(select(User).where(User.phone == (normalized_phone or identifier)))

    user = result.scalar_one_or_none()

    if not user or not verify_password(user_in.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
        )

    access_token = create_access_token({"sub": user.email, "user_id": user.id})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user,
    }
