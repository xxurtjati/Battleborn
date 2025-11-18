"""Availability endpoints."""
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.availability import (
    AvailabilityResponse,
    UtilizationCurrent,
    UtilizationHistory,
)
from app.services.availability_service import availability_service

router = APIRouter(prefix="/clubs/{club_id}", tags=["availability"])


@router.post("/fetch-availability", response_model=AvailabilityResponse)
async def fetch_availability(
    club_id: int,
    days: int = Query(default=7, ge=1, le=30, description="Number of days ahead to fetch"),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch availability data for a club.

    This endpoint fetches availability from Playtomic for the specified club
    for today and the next N days, and stores it in the database.

    Args:
        club_id: Club ID
        days: Number of days to fetch (1-30)
        db: Database session

    Returns:
        Availability data
    """
    try:
        result = await availability_service.fetch_and_store_availability(
            db, club_id, days
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch availability: {str(e)}",
        )


@router.get("/utilization/current", response_model=UtilizationCurrent)
async def get_current_utilization(
    club_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Get current utilization for today.

    Returns the latest snapshot data showing how many slots are booked vs free.

    Args:
        club_id: Club ID
        db: Database session

    Returns:
        Current utilization data
    """
    try:
        result = await availability_service.get_current_utilization(db, club_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get utilization: {str(e)}",
        )


@router.get("/utilization/daily", response_model=UtilizationHistory)
async def get_daily_utilization(
    club_id: int,
    from_date: date = Query(default=None, description="Start date (defaults to 7 days ago)"),
    to_date: date = Query(default=None, description="End date (defaults to today)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Get historical daily utilization.

    Returns utilization statistics for each day in the specified date range.

    Args:
        club_id: Club ID
        from_date: Start date (defaults to 7 days ago)
        to_date: End date (defaults to today)
        db: Database session

    Returns:
        Historical utilization data
    """
    # Default date range: last 7 days
    if to_date is None:
        to_date = date.today()
    if from_date is None:
        from_date = to_date - timedelta(days=7)

    if from_date > to_date:
        raise HTTPException(
            status_code=400,
            detail="from_date must be before or equal to to_date",
        )

    try:
        daily_data = await availability_service.get_daily_utilization(
            db, club_id, from_date, to_date
        )

        # Get club name
        from sqlalchemy import select
        from app.models.club import Club

        result = await db.execute(select(Club).where(Club.id == club_id))
        club = result.scalar_one_or_none()

        if not club:
            raise HTTPException(status_code=404, detail="Club not found")

        return UtilizationHistory(
            club_id=club_id,
            club_name=club.name,
            from_date=from_date,
            to_date=to_date,
            daily_data=daily_data,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get utilization: {str(e)}",
        )
