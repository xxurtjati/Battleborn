"""Monitoring configuration endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.club import Club
from app.models.monitoring_config import MonitoringConfig
from app.schemas.monitoring import (
    MonitoringConfigCreate,
    MonitoringConfigUpdate,
    MonitoringConfigInDB,
)

router = APIRouter(prefix="/clubs/{club_id}/monitoring", tags=["monitoring"])


@router.post("", response_model=MonitoringConfigInDB, status_code=201)
async def create_monitoring_config(
    club_id: int,
    config: MonitoringConfigCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Create monitoring configuration for a club.

    This enables automated monitoring of availability at regular intervals.

    Args:
        club_id: Club ID
        config: Monitoring configuration
        db: Database session

    Returns:
        Created monitoring configuration
    """
    # Verify club exists
    result = await db.execute(select(Club).where(Club.id == club_id))
    club = result.scalar_one_or_none()

    if not club:
        raise HTTPException(status_code=404, detail="Club not found")

    # Check if config already exists
    result = await db.execute(
        select(MonitoringConfig).where(MonitoringConfig.club_id == club_id)
    )
    existing_config = result.scalar_one_or_none()

    if existing_config:
        raise HTTPException(
            status_code=400,
            detail="Monitoring config already exists for this club. Use PATCH to update.",
        )

    # Create config
    config_data = config.model_dump()
    config_data["club_id"] = club_id
    db_config = MonitoringConfig(**config_data)
    db.add(db_config)
    await db.commit()
    await db.refresh(db_config)

    return db_config


@router.get("", response_model=MonitoringConfigInDB)
async def get_monitoring_config(
    club_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Get monitoring configuration for a club.

    Args:
        club_id: Club ID
        db: Database session

    Returns:
        Monitoring configuration
    """
    result = await db.execute(
        select(MonitoringConfig).where(MonitoringConfig.club_id == club_id)
    )
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(
            status_code=404,
            detail="No monitoring config found for this club",
        )

    return config


@router.patch("", response_model=MonitoringConfigInDB)
async def update_monitoring_config(
    club_id: int,
    config_update: MonitoringConfigUpdate,
    db: AsyncSession = Depends(get_db),
):
    """
    Update monitoring configuration for a club.

    Args:
        club_id: Club ID
        config_update: Fields to update
        db: Database session

    Returns:
        Updated monitoring configuration
    """
    result = await db.execute(
        select(MonitoringConfig).where(MonitoringConfig.club_id == club_id)
    )
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(
            status_code=404,
            detail="No monitoring config found for this club",
        )

    # Update fields
    update_data = config_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(config, field, value)

    await db.commit()
    await db.refresh(config)

    return config


@router.delete("", status_code=204)
async def delete_monitoring_config(
    club_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Delete monitoring configuration for a club.

    This stops automated monitoring for the club.

    Args:
        club_id: Club ID
        db: Database session
    """
    result = await db.execute(
        select(MonitoringConfig).where(MonitoringConfig.club_id == club_id)
    )
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(
            status_code=404,
            detail="No monitoring config found for this club",
        )

    await db.delete(config)
    await db.commit()
