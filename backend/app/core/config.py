from pathlib import Path
from typing import List

from pydantic import AnyHttpUrl, validator
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Women's Security"
    DEBUG: bool = True

    BACKEND_CORS_ORIGINS: List[AnyHttpUrl] = [
        "http://localhost",
        "http://localhost:19006",
        "http://127.0.0.1",
        "http://10.0.2.2",
        "http://10.245.81.156",
    ]

    DATABASE_URL: str = "sqlite+aiosqlite:///" + str(BASE_DIR / "backend_dev.db")

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    SECRET_KEY: str = "change-this-secret-key"
    ALGORITHM: str = "HS256"
    SMS_PROVIDER: str = ""
    SMS_FROM_NUMBER: str = ""
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    FCM_SERVER_KEY: str = ""
    WHATSAPP_ENABLED: bool = False
    WHATSAPP_ACCESS_TOKEN: str = ""
    WHATSAPP_PHONE_NUMBER_ID: str = ""

    @validator("BACKEND_CORS_ORIGINS", pre=True)
    def assemble_cors_origins(cls, value):
        if isinstance(value, str) and not value.startswith("["):
            return [i.strip() for i in value.split(",")]
        return value

    @property
    def CORS_ORIGINS(self) -> List[str]:
        return [str(origin) for origin in self.BACKEND_CORS_ORIGINS]


settings = Settings()
