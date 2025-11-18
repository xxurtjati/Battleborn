"""Court model."""
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Court(Base):
    """Represents a court at a Playtomic club."""

    __tablename__ = "courts"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False, index=True)
    playtomic_court_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    sport_type = Column(String, nullable=True)  # e.g., "padel", "tennis"
    surface_type = Column(String, nullable=True)  # e.g., "indoor", "outdoor"
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    club = relationship("Club", back_populates="courts")
    availability_snapshots = relationship("AvailabilitySnapshot", back_populates="court", cascade="all, delete-orphan")

    # Unique constraint: one court per club with same playtomic_court_id
    __table_args__ = (
        {"schema": None},
    )
