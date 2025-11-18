"""Background scheduler for automated monitoring."""
import asyncio
import logging
from datetime import datetime, time as dt_time
from typing import Optional
import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.monitoring_config import MonitoringConfig
from app.models.club import Club
from app.services.availability_service import availability_service

logger = logging.getLogger(__name__)


class MonitoringScheduler:
    """Background scheduler for monitoring clubs."""

    def __init__(self):
        """Initialize the scheduler."""
        self.scheduler = AsyncIOScheduler()
        self.running = False

    async def start(self):
        """Start the scheduler."""
        if self.running:
            logger.warning("Scheduler is already running")
            return

        logger.info("Starting monitoring scheduler")

        # Add the monitoring job to run every minute
        self.scheduler.add_job(
            self._check_and_monitor,
            IntervalTrigger(minutes=1),
            id="monitoring_job",
            name="Check and monitor clubs",
            replace_existing=True,
        )

        self.scheduler.start()
        self.running = True
        logger.info("Monitoring scheduler started")

    async def stop(self):
        """Stop the scheduler."""
        if not self.running:
            return

        logger.info("Stopping monitoring scheduler")
        self.scheduler.shutdown(wait=False)
        self.running = False
        logger.info("Monitoring scheduler stopped")

    async def _check_and_monitor(self):
        """
        Check all enabled monitoring configs and run monitoring if needed.

        This runs every minute and checks:
        1. Is monitoring enabled for the club?
        2. Is current time within the configured monitoring window?
        3. Has enough time passed since the last run?
        """
        logger.debug("Running monitoring check")

        async with AsyncSessionLocal() as db:
            try:
                # Get all enabled monitoring configs
                result = await db.execute(
                    select(MonitoringConfig)
                    .where(MonitoringConfig.enabled == True)
                    .join(Club)
                )
                configs = result.scalars().all()

                logger.info(f"Found {len(configs)} enabled monitoring configs")

                for config in configs:
                    try:
                        await self._process_monitoring_config(db, config)
                    except Exception as e:
                        logger.error(
                            f"Failed to process monitoring for club {config.club_id}: {e}",
                            exc_info=True,
                        )

            except Exception as e:
                logger.error(f"Error in monitoring check: {e}", exc_info=True)

    async def _process_monitoring_config(
        self, db: AsyncSession, config: MonitoringConfig
    ):
        """
        Process a single monitoring configuration.

        Args:
            db: Database session
            config: Monitoring configuration
        """
        # Get club
        result = await db.execute(select(Club).where(Club.id == config.club_id))
        club = result.scalar_one_or_none()

        if not club:
            logger.warning(f"Club {config.club_id} not found")
            return

        # Get current time in club's timezone
        club_tz = pytz.timezone(club.timezone or "UTC")
        current_time_utc = datetime.utcnow()
        current_time_local = current_time_utc.replace(tzinfo=pytz.UTC).astimezone(club_tz)

        # Check if we're within the monitoring window
        if not self._is_within_monitoring_window(
            current_time_local.time(),
            config.start_time_local,
            config.end_time_local,
        ):
            logger.debug(
                f"Club {club.name} ({config.club_id}): Outside monitoring window"
            )
            return

        # Check if enough time has passed since last run
        if not self._should_run_now(config, current_time_utc):
            logger.debug(
                f"Club {club.name} ({config.club_id}): Not enough time since last run"
            )
            return

        # Run monitoring
        logger.info(f"Running monitoring for club {club.name} ({config.club_id})")

        try:
            await availability_service.fetch_and_store_availability(
                db, config.club_id, config.days_ahead
            )

            # Update last run time
            config.last_run_at = current_time_utc
            await db.commit()

            logger.info(
                f"Successfully completed monitoring for club {club.name} ({config.club_id})"
            )

        except Exception as e:
            logger.error(
                f"Failed to fetch availability for club {club.name} ({config.club_id}): {e}",
                exc_info=True,
            )
            # Don't update last_run_at on failure so we can retry
            await db.rollback()

    def _is_within_monitoring_window(
        self,
        current_time: dt_time,
        start_time: Optional[dt_time],
        end_time: Optional[dt_time],
    ) -> bool:
        """
        Check if current time is within monitoring window.

        Args:
            current_time: Current time (local to club)
            start_time: Start of monitoring window
            end_time: End of monitoring window

        Returns:
            True if within window, False otherwise
        """
        # If no window is configured, always monitor
        if start_time is None or end_time is None:
            return True

        # Handle case where window crosses midnight
        if start_time <= end_time:
            return start_time <= current_time <= end_time
        else:
            return current_time >= start_time or current_time <= end_time

    def _should_run_now(
        self, config: MonitoringConfig, current_time: datetime
    ) -> bool:
        """
        Check if enough time has passed since last run.

        Args:
            config: Monitoring configuration
            current_time: Current time (UTC)

        Returns:
            True if should run now, False otherwise
        """
        if config.last_run_at is None:
            # Never run before, so run now
            return True

        # Calculate time since last run
        time_since_last_run = current_time - config.last_run_at
        minutes_since_last_run = time_since_last_run.total_seconds() / 60

        # Check if frequency interval has passed
        return minutes_since_last_run >= config.frequency_minutes


# Singleton instance
monitoring_scheduler = MonitoringScheduler()
