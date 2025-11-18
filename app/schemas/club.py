"""Club schemas."""
from pydantic import BaseModel, ConfigDict
from typing import Optional, Dict, Any
from datetime import datetime


class ClubBase(BaseModel):
    """Base club schema."""

    name: str
    playtomic_id: str
    slug: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    timezone: Optional[str] = "UTC"
    operating_hours: Optional[Dict[str, Any]] = None


class ClubCreate(ClubBase):
    """Schema for creating a club."""

    pass


class ClubUpdate(BaseModel):
    """Schema for updating a club."""

    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    timezone: Optional[str] = None
    operating_hours: Optional[Dict[str, Any]] = None


class ClubInDB(ClubBase):
    """Schema for club from database."""

    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ClubSearchResult(BaseModel):
    """Schema for club search results from Playtomic."""

    playtomic_id: str
    name: str
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    slug: Optional[str] = None
