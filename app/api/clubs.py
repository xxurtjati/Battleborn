"""Club endpoints."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
import re

from app.core.database import get_db
from app.models.club import Club
from app.schemas.club import ClubCreate, ClubUpdate, ClubInDB, ClubSearchResult
from app.services.playtomic_client import playtomic_client

router = APIRouter(prefix="/clubs", tags=["clubs"])


class ClubFromURL(BaseModel):
    """Schema for creating a club from a Playtomic URL."""
    url: str
    name: str = None


@router.get("/search", response_model=List[ClubSearchResult])
async def search_clubs(
    query: str = Query(..., min_length=2, description="Search query for club name"),
):
    """
    Search for clubs on Playtomic.

    This endpoint searches the Playtomic public API for clubs matching the query.
    Returns a list of clubs with their basic information so you can select the correct one.

    Args:
        query: Search query (minimum 2 characters)

    Returns:
        List of club search results
    """
    try:
        results = await playtomic_client.search_clubs(query)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to search clubs: {str(e)}")


@router.post("/from-url", response_model=ClubInDB, status_code=201)
async def create_club_from_url(
    club_url: ClubFromURL,
    db: AsyncSession = Depends(get_db),
):
    """
    Create a club directly from a Playtomic URL.

    This is easier than searching! Just paste the club's Playtomic URL.

    Example URLs:
    - https://playtomic.com/clubs/mitte-charlotte
    - https://playtomic.com/clubs/mitte-charlotte?date=2025-12-02

    Args:
        club_url: Object containing the Playtomic URL and optional name
        db: Database session

    Returns:
        Created club
    """
    # Extract slug from URL
    # Supports: https://playtomic.com/clubs/mitte-charlotte or with query params
    pattern = r'playtomic\.com/clubs/([a-zA-Z0-9\-_]+)'
    match = re.search(pattern, club_url.url)

    if not match:
        raise HTTPException(
            status_code=400,
            detail="Invalid Playtomic URL. Expected format: https://playtomic.com/clubs/club-slug"
        )

    slug = match.group(1)

    # Use slug as playtomic_id (we can update this later if we find the real ID)
    club_name = club_url.name or slug.replace('-', ' ').title()

    # Check if club already exists
    result = await db.execute(
        select(Club).where(Club.slug == slug)
    )
    existing_club = result.scalar_one_or_none()

    if existing_club:
        raise HTTPException(
            status_code=400,
            detail=f"Club with slug '{slug}' already exists (ID: {existing_club.id})"
        )

    # Create club with minimal info
    db_club = Club(
        playtomic_id=slug,  # We'll use slug as ID for now
        slug=slug,
        name=club_name,
        timezone="Europe/Berlin",  # Default for Germany, can be updated later
    )

    db.add(db_club)
    await db.commit()
    await db.refresh(db_club)

    return db_club


@router.post("", response_model=ClubInDB, status_code=201)
async def create_club(
    club: ClubCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new club in the database.

    After searching for clubs, use this endpoint to save a selected club
    to the database for monitoring.

    Args:
        club: Club data from search results
        db: Database session

    Returns:
        Created club
    """
    # Check if club already exists
    result = await db.execute(
        select(Club).where(Club.playtomic_id == club.playtomic_id)
    )
    existing_club = result.scalar_one_or_none()

    if existing_club:
        raise HTTPException(
            status_code=400,
            detail=f"Club with playtomic_id {club.playtomic_id} already exists",
        )

    # Create new club
    db_club = Club(**club.model_dump())
    db.add(db_club)
    await db.commit()
    await db.refresh(db_club)

    return db_club


@router.get("", response_model=List[ClubInDB])
async def list_clubs(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    """
    List all clubs in the database.

    Args:
        skip: Number of records to skip
        limit: Maximum number of records to return
        db: Database session

    Returns:
        List of clubs
    """
    result = await db.execute(
        select(Club).offset(skip).limit(limit)
    )
    clubs = result.scalars().all()
    return clubs


@router.get("/{club_id}", response_model=ClubInDB)
async def get_club(
    club_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Get a specific club by ID.

    Args:
        club_id: Club ID
        db: Database session

    Returns:
        Club details
    """
    result = await db.execute(
        select(Club).where(Club.id == club_id)
    )
    club = result.scalar_one_or_none()

    if not club:
        raise HTTPException(status_code=404, detail="Club not found")

    return club


@router.patch("/{club_id}", response_model=ClubInDB)
async def update_club(
    club_id: int,
    club_update: ClubUpdate,
    db: AsyncSession = Depends(get_db),
):
    """
    Update a club's information.

    Args:
        club_id: Club ID
        club_update: Fields to update
        db: Database session

    Returns:
        Updated club
    """
    result = await db.execute(
        select(Club).where(Club.id == club_id)
    )
    club = result.scalar_one_or_none()

    if not club:
        raise HTTPException(status_code=404, detail="Club not found")

    # Update fields
    update_data = club_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(club, field, value)

    await db.commit()
    await db.refresh(club)

    return club


@router.delete("/{club_id}", status_code=204)
async def delete_club(
    club_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a club and all associated data.

    Args:
        club_id: Club ID
        db: Database session
    """
    result = await db.execute(
        select(Club).where(Club.id == club_id)
    )
    club = result.scalar_one_or_none()

    if not club:
        raise HTTPException(status_code=404, detail="Club not found")

    await db.delete(club)
    await db.commit()
