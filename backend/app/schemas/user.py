from typing import Optional

from pydantic import BaseModel, EmailStr


class UserBase(BaseModel):
    email: EmailStr


class UserCreate(UserBase):
    name: str
    phone: str
    password: str


class UserLogin(BaseModel):
    identifier: str
    password: str


class UserRead(UserBase):
    id: int
    name: str
    phone: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserRead

    class Config:
        orm_mode = True
