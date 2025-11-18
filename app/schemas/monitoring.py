"""Monitoring configuration schemas."""
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional
from datetime import datetime, time


class MonitoringConfigBase(BaseModel):
    """Base monitoring config schema."""

    enabled: bool = False
    frequency_minutes: int = Field(default=15, ge=1, le=1440)
    start_time_local: Optional[time] = None
    end_time_local: Optional[time] = None
    days_ahead: int = Field(default=7, ge=1, le=30)


class MonitoringConfigCreate(MonitoringConfigBase):
    """Schema for creating monitoring config."""

    club_id: int


class MonitoringConfigUpdate(BaseModel):
    """Schema for updating monitoring config."""

    enabled: Optional[bool] = None
    frequency_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    start_time_local: Optional[time] = None
    end_time_local: Optional[time] = None
    days_ahead: Optional[int] = Field(default=None, ge=1, le=30)


class MonitoringConfigInDB(MonitoringConfigBase):
    """Schema for monitoring config from database."""

    id: int
    club_id: int
    last_run_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
