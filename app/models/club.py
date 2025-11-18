"""Club model."""
from sqlalchemy import Column, Integer, String, Float, DateTime, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Club(Base):
    """Represents a Playtomic club."""

    __tablename__ = "clubs"

    id = Column(Integer, primary_key=True, index=True)
    playtomic_id = Column(String, unique=True, nullable=False, index=True)
    slug = Column(String, unique=True, nullable=True, index=True)
    name = Column(String, nullable=False)
    address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    country = Column(String, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    timezone = Column(String, nullable=True, default="UTC")
    operating_hours = Column(JSON, nullable=True)  # Store as JSON: {"monday": {"open": "08:00", "close": "23:00"}, ...}
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    courts = relationship("Court", back_populates="club", cascade="all, delete-orphan")
    monitoring_config = relationship("MonitoringConfig", back_populates="club", uselist=False, cascade="all, delete-orphan")
    availability_snapshots = relationship("AvailabilitySnapshot", back_populates="club", cascade="all, delete-orphan")
