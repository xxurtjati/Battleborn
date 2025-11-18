"""Availability schemas."""
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date, time
from decimal import Decimal


class AvailabilitySlot(BaseModel):
    """Schema for a single availability slot."""

    court_id: int
    court_name: str
    date: date
    start_time: time
    end_time: time
    status: str  # booked, free, closed, unknown
    price: Optional[Decimal] = None


class AvailabilityResponse(BaseModel):
    """Schema for availability response."""

    club_id: int
    club_name: str
    fetch_time: datetime
    slots: List[AvailabilitySlot]


class UtilizationCurrent(BaseModel):
    """Schema for current utilization."""

    club_id: int
    club_name: str
    date: date
    total_slots: int
    booked_slots: int
    free_slots: int
    closed_slots: int
    booked_percentage: float
    free_percentage: float
    hourly_breakdown: Optional[List[dict]] = None


class UtilizationDaily(BaseModel):
    """Schema for daily utilization."""

    date: date
    total_slots: int
    booked_slots: int
    free_slots: int
    closed_slots: int
    booked_percentage: float
    free_percentage: float


class UtilizationHistory(BaseModel):
    """Schema for historical utilization."""

    club_id: int
    club_name: str
    from_date: date
    to_date: date
    daily_data: List[UtilizationDaily]
