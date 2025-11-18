"""Main FastAPI application."""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import clubs, availability, monitoring
from app.core.config import settings
from app.services.scheduler import monitoring_scheduler

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    logger.info("Starting Playtomic Availability Monitor")
    logger.info(f"Debug mode: {settings.DEBUG}")

    # Start the monitoring scheduler
    await monitoring_scheduler.start()

    yield

    # Shutdown
    logger.info("Shutting down Playtomic Availability Monitor")
    await monitoring_scheduler.stop()


# Create FastAPI app
app = FastAPI(
    title="Playtomic Availability Monitor",
    description="Monitor and track Playtomic club availability over time",
    version="1.0.0",
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(clubs.router)
app.include_router(availability.router)
app.include_router(monitoring.router)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "scheduler_running": monitoring_scheduler.running,
    }
