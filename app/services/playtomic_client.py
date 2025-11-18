"""Playtomic API client.

This module handles all interactions with Playtomic's public endpoints.
It respects rate limits and implements politeness measures.

IMPORTANT: Before using this client, you need to discover the actual API endpoints
by inspecting the Playtomic website in your browser:

1. Open https://playtomic.com in Chrome/Firefox with Developer Tools
2. Go to Network tab
3. Search for a club (e.g., type "Madrid" in the search box)
4. Look for XHR/Fetch requests to find the search endpoint
5. Select a club and check the calendar/booking interface
6. Look for requests that return availability data

Update the endpoint URLs in this file based on your findings.
"""
import asyncio
import logging
from typing import List, Dict, Any, Optional
from datetime import date, datetime
import httpx
from app.core.config import settings
from app.schemas.club import ClubSearchResult

logger = logging.getLogger(__name__)


class PlaytomicClient:
    """Client for interacting with Playtomic's public API."""

    def __init__(self):
        """Initialize the Playtomic client."""
        self.base_url = settings.PLAYTOMIC_BASE_URL
        self.api_base_url = settings.PLAYTOMIC_API_BASE_URL
        self.request_delay = settings.REQUEST_DELAY_SECONDS
        self.max_retries = settings.MAX_RETRIES
        self._last_request_time = 0.0

        # TODO: Discover these endpoints by inspecting the Playtomic website
        # These are placeholder URLs - replace with actual endpoints
        self.endpoints = {
            "search": f"{self.api_base_url}/tenants/search",  # Example endpoint
            "club_details": f"{self.api_base_url}/tenants/{{club_id}}",
            "availability": f"{self.api_base_url}/availability/{{club_id}}/{{date}}",
        }

    async def _rate_limit(self):
        """Implement rate limiting with politeness delay."""
        current_time = asyncio.get_event_loop().time()
        time_since_last_request = current_time - self._last_request_time

        if time_since_last_request < self.request_delay:
            await asyncio.sleep(self.request_delay - time_since_last_request)

        self._last_request_time = asyncio.get_event_loop().time()

    async def _make_request(
        self,
        method: str,
        url: str,
        params: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Make an HTTP request with retry logic and rate limiting.

        Args:
            method: HTTP method (GET, POST, etc.)
            url: Request URL
            params: Query parameters
            json_data: JSON body data

        Returns:
            Response JSON data

        Raises:
            httpx.HTTPError: If request fails after retries
        """
        await self._rate_limit()

        async with httpx.AsyncClient() as client:
            for attempt in range(self.max_retries):
                try:
                    logger.info(f"Making {method} request to {url} (attempt {attempt + 1}/{self.max_retries})")

                    response = await client.request(
                        method=method,
                        url=url,
                        params=params,
                        json=json_data,
                        timeout=30.0,
                    )
                    response.raise_for_status()

                    return response.json()

                except httpx.HTTPError as e:
                    logger.warning(f"Request failed (attempt {attempt + 1}/{self.max_retries}): {e}")

                    if attempt == self.max_retries - 1:
                        raise

                    # Exponential backoff
                    await asyncio.sleep(2 ** attempt)

            raise httpx.HTTPError("Max retries exceeded")

    async def search_clubs(self, query: str) -> List[ClubSearchResult]:
        """
        Search for clubs by name.

        NOTE: You need to discover the actual search endpoint by inspecting
        the Playtomic website's network traffic. This is a placeholder implementation.

        Args:
            query: Search query string

        Returns:
            List of club search results

        Example of what to look for in browser DevTools:
            Request: GET https://playtomic.com/api/v1/tenants/search?query=Madrid
            Response: {
                "results": [
                    {
                        "tenant_id": "abc123",
                        "tenant_name": "Club Padel Madrid",
                        "address": "Calle Example 123",
                        "city": "Madrid",
                        "country": "Spain",
                        ...
                    }
                ]
            }
        """
        logger.info(f"Searching for clubs with query: {query}")

        # TODO: Replace with actual endpoint discovered from browser inspection
        # This is a placeholder that will need to be updated
        try:
            data = await self._make_request(
                method="GET",
                url=self.endpoints["search"],
                params={"query": query, "sport": "PADEL"},  # Adjust params based on actual API
            )

            # TODO: Adjust this parsing based on actual API response structure
            results = []
            for item in data.get("results", []):
                results.append(
                    ClubSearchResult(
                        playtomic_id=item.get("tenant_id"),
                        name=item.get("tenant_name"),
                        address=item.get("address"),
                        city=item.get("city"),
                        country=item.get("country"),
                        latitude=item.get("latitude"),
                        longitude=item.get("longitude"),
                        slug=item.get("slug"),
                    )
                )

            logger.info(f"Found {len(results)} clubs")
            return results

        except Exception as e:
            logger.error(f"Failed to search clubs: {e}")
            raise

    async def get_club_details(self, club_id: str) -> Dict[str, Any]:
        """
        Get detailed information about a specific club.

        Args:
            club_id: Playtomic club ID

        Returns:
            Club details
        """
        logger.info(f"Fetching details for club: {club_id}")

        url = self.endpoints["club_details"].format(club_id=club_id)
        return await self._make_request("GET", url)

    async def get_availability(
        self, club_id: str, target_date: date
    ) -> Dict[str, Any]:
        """
        Get availability for a specific club and date.

        NOTE: You need to discover the actual availability endpoint by:
        1. Going to a club's booking page on Playtomic
        2. Selecting different dates in the calendar
        3. Observing the XHR requests in Network tab

        Args:
            club_id: Playtomic club ID
            target_date: Date to fetch availability for

        Returns:
            Availability data with courts and time slots

        Example of what to look for in browser DevTools:
            Request: GET https://playtomic.com/api/v1/availability/abc123/2024-01-15
            Response: {
                "courts": [
                    {
                        "court_id": "court_1",
                        "court_name": "Court 1",
                        "slots": [
                            {
                                "start_time": "08:00",
                                "end_time": "09:30",
                                "available": true,
                                "price": 25.0
                            },
                            ...
                        ]
                    }
                ]
            }
        """
        logger.info(f"Fetching availability for club {club_id} on {target_date}")

        date_str = target_date.strftime("%Y-%m-%d")
        url = self.endpoints["availability"].format(
            club_id=club_id, date=date_str
        )

        return await self._make_request("GET", url)

    async def get_availability_range(
        self, club_id: str, start_date: date, days: int = 7
    ) -> List[Dict[str, Any]]:
        """
        Get availability for a date range.

        Args:
            club_id: Playtomic club ID
            start_date: Start date
            days: Number of days to fetch

        Returns:
            List of availability data for each date
        """
        logger.info(
            f"Fetching availability range for club {club_id}: "
            f"{start_date} + {days} days"
        )

        results = []
        for day_offset in range(days):
            target_date = start_date + asyncio.timedelta(days=day_offset)

            try:
                data = await self.get_availability(club_id, target_date)
                results.append({"date": target_date, "data": data})
            except Exception as e:
                logger.error(
                    f"Failed to fetch availability for {target_date}: {e}"
                )
                # Continue with other dates even if one fails
                continue

        return results


# Singleton instance
playtomic_client = PlaytomicClient()
