"""Monitoring configuration model."""
from sqlalchemy import Column, Integer, Boolean, String, ForeignKey, DateTime, Time
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class MonitoringConfig(Base):
    """Represents monitoring configuration for a club."""

    __tablename__ = "monitoring_configs"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    enabled = Column(Boolean, default=False, nullable=False)
    frequency_minutes = Column(Integer, default=15, nullable=False)
    start_time_local = Column(Time, nullable=True)  # Start time in club's local timezone
    end_time_local = Column(Time, nullable=True)    # End time in club's local timezone
    days_ahead = Column(Integer, default=7, nullable=False)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    club = relationship("Club", back_populates="monitoring_config")
