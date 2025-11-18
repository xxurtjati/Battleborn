"""Availability service for processing and storing availability data."""
import logging
from typing import List, Dict, Any
from datetime import date, datetime, time as dt_time
from decimal import Decimal
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.club import Club
from app.models.court import Court
from app.models.availability_snapshot import AvailabilitySnapshot
from app.schemas.availability import (
    AvailabilitySlot,
    AvailabilityResponse,
    UtilizationCurrent,
    UtilizationDaily,
)
from app.services.playtomic_client import playtomic_client

logger = logging.getLogger(__name__)


class AvailabilityService:
    """Service for managing availability data."""

    async def fetch_and_store_availability(
        self,
        db: AsyncSession,
        club_id: int,
        days: int = 7,
    ) -> AvailabilityResponse:
        """
        Fetch availability from Playtomic and store in database.

        Args:
            db: Database session
            club_id: Internal club ID
            days: Number of days ahead to fetch

        Returns:
            AvailabilityResponse with fetched data
        """
        # Get club from database
        result = await db.execute(select(Club).where(Club.id == club_id))
        club = result.scalar_one_or_none()

        if not club:
            raise ValueError(f"Club {club_id} not found")

        logger.info(f"Fetching availability for club {club.name} ({club_id})")

        # Fetch availability from Playtomic
        today = date.today()
        availability_data = await playtomic_client.get_availability_range(
            club.playtomic_id, today, days
        )

        all_slots = []
        snapshot_time = datetime.utcnow()

        for date_data in availability_data:
            target_date = date_data["date"]
            raw_data = date_data["data"]

            # Process and store availability data
            slots = await self._process_and_store_availability(
                db, club, target_date, raw_data, snapshot_time
            )
            all_slots.extend(slots)

        await db.commit()

        return AvailabilityResponse(
            club_id=club.id,
            club_name=club.name,
            fetch_time=snapshot_time,
            slots=all_slots,
        )

    async def _process_and_store_availability(
        self,
        db: AsyncSession,
        club: Club,
        target_date: date,
        raw_data: Dict[str, Any],
        snapshot_time: datetime,
    ) -> List[AvailabilitySlot]:
        """
        Process raw availability data and store in database.

        This method needs to be adapted based on the actual structure
        of the Playtomic API response.

        Args:
            db: Database session
            club: Club instance
            target_date: Date of availability
            raw_data: Raw data from Playtomic API
            snapshot_time: Time when snapshot was taken

        Returns:
            List of processed availability slots
        """
        slots = []

        # TODO: Adjust this parsing based on actual Playtomic API response
        # This is a placeholder structure
        courts_data = raw_data.get("courts", [])

        for court_data in courts_data:
            court_id_playtomic = court_data.get("court_id")
            court_name = court_data.get("court_name")

            # Get or create court
            court = await self._get_or_create_court(
                db, club, court_id_playtomic, court_name
            )

            # Process time slots
            time_slots = court_data.get("slots", [])

            for slot_data in time_slots:
                start_time = self._parse_time(slot_data.get("start_time"))
                end_time = self._parse_time(slot_data.get("end_time"))
                is_available = slot_data.get("available", False)
                price = slot_data.get("price")

                # Determine status
                status = "free" if is_available else "booked"
                if slot_data.get("closed"):
                    status = "closed"

                # Create snapshot
                snapshot = AvailabilitySnapshot(
                    club_id=club.id,
                    court_id=court.id,
                    snapshot_time=snapshot_time,
                    date=target_date,
                    start_time=start_time,
                    end_time=end_time,
                    status=status,
                    price=Decimal(str(price)) if price else None,
                )
                db.add(snapshot)

                # Add to response
                slots.append(
                    AvailabilitySlot(
                        court_id=court.id,
                        court_name=court.name,
                        date=target_date,
                        start_time=start_time,
                        end_time=end_time,
                        status=status,
                        price=Decimal(str(price)) if price else None,
                    )
                )

        return slots

    async def _get_or_create_court(
        self,
        db: AsyncSession,
        club: Club,
        playtomic_court_id: str,
        court_name: str,
    ) -> Court:
        """Get existing court or create new one."""
        result = await db.execute(
            select(Court).where(
                and_(
                    Court.club_id == club.id,
                    Court.playtomic_court_id == playtomic_court_id,
                )
            )
        )
        court = result.scalar_one_or_none()

        if not court:
            court = Court(
                club_id=club.id,
                playtomic_court_id=playtomic_court_id,
                name=court_name,
            )
            db.add(court)
            await db.flush()

        return court

    def _parse_time(self, time_str: str) -> dt_time:
        """Parse time string to time object."""
        try:
            # Handle various time formats
            if ":" in time_str:
                parts = time_str.split(":")
                hour = int(parts[0])
                minute = int(parts[1]) if len(parts) > 1 else 0
                return dt_time(hour=hour, minute=minute)
            else:
                # Assume it's just hours
                return dt_time(hour=int(time_str), minute=0)
        except Exception as e:
            logger.error(f"Failed to parse time '{time_str}': {e}")
            return dt_time(hour=0, minute=0)

    async def get_current_utilization(
        self, db: AsyncSession, club_id: int
    ) -> UtilizationCurrent:
        """
        Get current utilization for today.

        Args:
            db: Database session
            club_id: Club ID

        Returns:
            Current utilization data
        """
        # Get club
        result = await db.execute(select(Club).where(Club.id == club_id))
        club = result.scalar_one_or_none()

        if not club:
            raise ValueError(f"Club {club_id} not found")

        today = date.today()

        # Get latest snapshots for today
        # We want the most recent snapshot for each court/time slot combination
        subquery = (
            select(
                AvailabilitySnapshot.court_id,
                AvailabilitySnapshot.start_time,
                func.max(AvailabilitySnapshot.snapshot_time).label("max_snapshot_time"),
            )
            .where(
                and_(
                    AvailabilitySnapshot.club_id == club_id,
                    AvailabilitySnapshot.date == today,
                )
            )
            .group_by(AvailabilitySnapshot.court_id, AvailabilitySnapshot.start_time)
            .subquery()
        )

        result = await db.execute(
            select(AvailabilitySnapshot)
            .join(
                subquery,
                and_(
                    AvailabilitySnapshot.court_id == subquery.c.court_id,
                    AvailabilitySnapshot.start_time == subquery.c.start_time,
                    AvailabilitySnapshot.snapshot_time == subquery.c.max_snapshot_time,
                ),
            )
            .where(AvailabilitySnapshot.club_id == club_id)
        )
        snapshots = result.scalars().all()

        # Calculate statistics
        total_slots = len(snapshots)
        booked_slots = sum(1 for s in snapshots if s.status == "booked")
        free_slots = sum(1 for s in snapshots if s.status == "free")
        closed_slots = sum(1 for s in snapshots if s.status == "closed")

        booked_percentage = (booked_slots / total_slots * 100) if total_slots > 0 else 0
        free_percentage = (free_slots / total_slots * 100) if total_slots > 0 else 0

        return UtilizationCurrent(
            club_id=club.id,
            club_name=club.name,
            date=today,
            total_slots=total_slots,
            booked_slots=booked_slots,
            free_slots=free_slots,
            closed_slots=closed_slots,
            booked_percentage=round(booked_percentage, 2),
            free_percentage=round(free_percentage, 2),
        )

    async def get_daily_utilization(
        self, db: AsyncSession, club_id: int, from_date: date, to_date: date
    ) -> List[UtilizationDaily]:
        """
        Get daily utilization for a date range.

        Args:
            db: Database session
            club_id: Club ID
            from_date: Start date
            to_date: End date

        Returns:
            List of daily utilization data
        """
        # For each date, get the latest snapshot per court/time slot
        daily_data = []

        current_date = from_date
        while current_date <= to_date:
            # Get latest snapshots for this date
            subquery = (
                select(
                    AvailabilitySnapshot.court_id,
                    AvailabilitySnapshot.start_time,
                    func.max(AvailabilitySnapshot.snapshot_time).label("max_snapshot_time"),
                )
                .where(
                    and_(
                        AvailabilitySnapshot.club_id == club_id,
                        AvailabilitySnapshot.date == current_date,
                    )
                )
                .group_by(AvailabilitySnapshot.court_id, AvailabilitySnapshot.start_time)
                .subquery()
            )

            result = await db.execute(
                select(AvailabilitySnapshot)
                .join(
                    subquery,
                    and_(
                        AvailabilitySnapshot.court_id == subquery.c.court_id,
                        AvailabilitySnapshot.start_time == subquery.c.start_time,
                        AvailabilitySnapshot.snapshot_time == subquery.c.max_snapshot_time,
                    ),
                )
                .where(AvailabilitySnapshot.club_id == club_id)
            )
            snapshots = result.scalars().all()

            total_slots = len(snapshots)
            if total_slots > 0:
                booked_slots = sum(1 for s in snapshots if s.status == "booked")
                free_slots = sum(1 for s in snapshots if s.status == "free")
                closed_slots = sum(1 for s in snapshots if s.status == "closed")

                booked_percentage = (booked_slots / total_slots * 100)
                free_percentage = (free_slots / total_slots * 100)

                daily_data.append(
                    UtilizationDaily(
                        date=current_date,
                        total_slots=total_slots,
                        booked_slots=booked_slots,
                        free_slots=free_slots,
                        closed_slots=closed_slots,
                        booked_percentage=round(booked_percentage, 2),
                        free_percentage=round(free_percentage, 2),
                    )
                )

            current_date += datetime.timedelta(days=1)

        return daily_data


# Singleton instance
availability_service = AvailabilityService()
