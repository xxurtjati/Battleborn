"""Availability snapshot model."""
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Date, Time, Numeric, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class AvailabilitySnapshot(Base):
    """Represents a snapshot of court availability at a specific time."""

    __tablename__ = "availability_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False, index=True)
    court_id = Column(Integer, ForeignKey("courts.id", ondelete="CASCADE"), nullable=False, index=True)
    snapshot_time = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)  # Date of the slot (local to club)
    start_time = Column(Time, nullable=False)  # Start time of the slot
    end_time = Column(Time, nullable=False)    # End time of the slot
    status = Column(String, nullable=False)    # booked, free, closed, unknown
    price = Column(Numeric(10, 2), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    club = relationship("Club", back_populates="availability_snapshots")
    court = relationship("Court", back_populates="availability_snapshots")

    # Indexes for efficient querying
    __table_args__ = (
        Index("ix_snapshots_club_date", "club_id", "date"),
        Index("ix_snapshots_club_date_court", "club_id", "date", "court_id"),
        Index("ix_snapshots_club_snapshot_time", "club_id", "snapshot_time"),
    )
