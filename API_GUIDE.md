# API Guide - Playtomic Availability Monitor

Complete guide to using the REST API.

## Base URL

```
http://localhost:8000
```

In production, replace with your domain.

## Authentication

Currently, the API does not require authentication. In production, you should add authentication middleware.

## Response Format

All endpoints return JSON responses.

Success response:
```json
{
  "data": { ... }
}
```

Error response:
```json
{
  "detail": "Error message"
}
```

## Endpoints

### Health Check

Check if the service is running and healthy.

**Request:**
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "scheduler_running": true
}
```

---

## Club Management

### Search Clubs

Search for clubs on Playtomic by name.

**Request:**
```http
GET /clubs/search?query=Madrid
```

**Parameters:**
- `query` (required): Search query, minimum 2 characters

**Response:**
```json
[
  {
    "playtomic_id": "abc123",
    "name": "Club Padel Madrid Centro",
    "address": "Calle Example 123",
    "city": "Madrid",
    "country": "Spain",
    "latitude": 40.4168,
    "longitude": -3.7038,
    "slug": "club-padel-madrid-centro"
  },
  ...
]
```

**Example with curl:**
```bash
curl "http://localhost:8000/clubs/search?query=Madrid"
```

**Example with Python:**
```python
import requests

response = requests.get(
    "http://localhost:8000/clubs/search",
    params={"query": "Madrid"}
)
clubs = response.json()
print(f"Found {len(clubs)} clubs")
```

---

### Create Club

Add a club to your monitoring database.

**Request:**
```http
POST /clubs
Content-Type: application/json

{
  "playtomic_id": "abc123",
  "name": "Club Padel Madrid Centro",
  "address": "Calle Example 123",
  "city": "Madrid",
  "country": "Spain",
  "latitude": 40.4168,
  "longitude": -3.7038,
  "slug": "club-padel-madrid-centro",
  "timezone": "Europe/Madrid"
}
```

**Required Fields:**
- `playtomic_id`: Unique ID from Playtomic
- `name`: Club name

**Optional Fields:**
- `slug`, `address`, `city`, `country`, `latitude`, `longitude`, `timezone`, `operating_hours`

**Response:**
```json
{
  "id": 1,
  "playtomic_id": "abc123",
  "name": "Club Padel Madrid Centro",
  "address": "Calle Example 123",
  "city": "Madrid",
  "country": "Spain",
  "latitude": 40.4168,
  "longitude": -3.7038,
  "slug": "club-padel-madrid-centro",
  "timezone": "Europe/Madrid",
  "operating_hours": null,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": null
}
```

**Status Codes:**
- `201`: Club created successfully
- `400`: Club already exists or validation error
- `422`: Invalid request format

**Example with curl:**
```bash
curl -X POST http://localhost:8000/clubs \
  -H "Content-Type: application/json" \
  -d '{
    "playtomic_id": "abc123",
    "name": "Club Padel Madrid Centro",
    "city": "Madrid",
    "country": "Spain"
  }'
```

---

### List Clubs

Get all clubs in your database.

**Request:**
```http
GET /clubs?skip=0&limit=100
```

**Parameters:**
- `skip` (optional): Number of records to skip (default: 0)
- `limit` (optional): Maximum records to return (default: 100)

**Response:**
```json
[
  {
    "id": 1,
    "playtomic_id": "abc123",
    "name": "Club Padel Madrid Centro",
    ...
  },
  ...
]
```

---

### Get Club Details

Get a specific club by ID.

**Request:**
```http
GET /clubs/{club_id}
```

**Response:**
```json
{
  "id": 1,
  "playtomic_id": "abc123",
  "name": "Club Padel Madrid Centro",
  ...
}
```

**Status Codes:**
- `200`: Success
- `404`: Club not found

---

### Update Club

Update club information.

**Request:**
```http
PATCH /clubs/{club_id}
Content-Type: application/json

{
  "timezone": "Europe/Madrid",
  "operating_hours": {
    "monday": {"open": "08:00", "close": "23:00"},
    "tuesday": {"open": "08:00", "close": "23:00"}
  }
}
```

**Response:**
```json
{
  "id": 1,
  "timezone": "Europe/Madrid",
  "operating_hours": { ... },
  ...
}
```

---

### Delete Club

Delete a club and all associated data.

**Request:**
```http
DELETE /clubs/{club_id}
```

**Response:**
- Status: `204 No Content`

**Warning:** This will delete:
- The club
- All courts
- All monitoring configs
- All availability snapshots

---

## Availability

### Fetch Availability

Fetch availability from Playtomic and store in database.

**Request:**
```http
POST /clubs/{club_id}/fetch-availability?days=7
```

**Parameters:**
- `days` (optional): Number of days ahead to fetch (1-30, default: 7)

**Response:**
```json
{
  "club_id": 1,
  "club_name": "Club Padel Madrid Centro",
  "fetch_time": "2024-01-15T10:30:00Z",
  "slots": [
    {
      "court_id": 1,
      "court_name": "Court 1",
      "date": "2024-01-15",
      "start_time": "08:00:00",
      "end_time": "09:30:00",
      "status": "free",
      "price": "25.00"
    },
    {
      "court_id": 1,
      "court_name": "Court 1",
      "date": "2024-01-15",
      "start_time": "09:30:00",
      "end_time": "11:00:00",
      "status": "booked",
      "price": "25.00"
    },
    ...
  ]
}
```

**Slot Status Values:**
- `free`: Available for booking
- `booked`: Already booked
- `closed`: Court closed
- `unknown`: Status unclear

**Example:**
```bash
curl -X POST "http://localhost:8000/clubs/1/fetch-availability?days=7"
```

---

### Get Current Utilization

Get utilization statistics for today.

**Request:**
```http
GET /clubs/{club_id}/utilization/current
```

**Response:**
```json
{
  "club_id": 1,
  "club_name": "Club Padel Madrid Centro",
  "date": "2024-01-15",
  "total_slots": 120,
  "booked_slots": 85,
  "free_slots": 30,
  "closed_slots": 5,
  "booked_percentage": 70.83,
  "free_percentage": 25.00,
  "hourly_breakdown": null
}
```

**Example:**
```bash
curl http://localhost:8000/clubs/1/utilization/current
```

---

### Get Historical Utilization

Get daily utilization for a date range.

**Request:**
```http
GET /clubs/{club_id}/utilization/daily?from_date=2024-01-01&to_date=2024-01-07
```

**Parameters:**
- `from_date` (optional): Start date (YYYY-MM-DD, default: 7 days ago)
- `to_date` (optional): End date (YYYY-MM-DD, default: today)

**Response:**
```json
{
  "club_id": 1,
  "club_name": "Club Padel Madrid Centro",
  "from_date": "2024-01-01",
  "to_date": "2024-01-07",
  "daily_data": [
    {
      "date": "2024-01-01",
      "total_slots": 120,
      "booked_slots": 90,
      "free_slots": 25,
      "closed_slots": 5,
      "booked_percentage": 75.00,
      "free_percentage": 20.83
    },
    {
      "date": "2024-01-02",
      "total_slots": 120,
      "booked_slots": 95,
      "free_slots": 20,
      "closed_slots": 5,
      "booked_percentage": 79.17,
      "free_percentage": 16.67
    },
    ...
  ]
}
```

**Example:**
```bash
curl "http://localhost:8000/clubs/1/utilization/daily?from_date=2024-01-01&to_date=2024-01-07"
```

---

## Monitoring Configuration

### Create Monitoring Config

Enable automated monitoring for a club.

**Request:**
```http
POST /clubs/{club_id}/monitoring
Content-Type: application/json

{
  "enabled": true,
  "frequency_minutes": 15,
  "start_time_local": "08:00",
  "end_time_local": "23:00",
  "days_ahead": 7
}
```

**Fields:**
- `enabled` (required): Whether monitoring is active
- `frequency_minutes` (required): Check interval in minutes (1-1440)
- `start_time_local` (optional): Start of monitoring window (HH:MM)
- `end_time_local` (optional): End of monitoring window (HH:MM)
- `days_ahead` (required): How many days ahead to fetch (1-30)

**Response:**
```json
{
  "id": 1,
  "club_id": 1,
  "enabled": true,
  "frequency_minutes": 15,
  "start_time_local": "08:00:00",
  "end_time_local": "23:00:00",
  "days_ahead": 7,
  "last_run_at": null,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": null
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/clubs/1/monitoring \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "frequency_minutes": 15,
    "start_time_local": "08:00",
    "end_time_local": "23:00",
    "days_ahead": 7
  }'
```

---

### Get Monitoring Config

Get current monitoring configuration.

**Request:**
```http
GET /clubs/{club_id}/monitoring
```

**Response:**
```json
{
  "id": 1,
  "club_id": 1,
  "enabled": true,
  "frequency_minutes": 15,
  "last_run_at": "2024-01-15T10:30:00Z",
  ...
}
```

---

### Update Monitoring Config

Update monitoring settings.

**Request:**
```http
PATCH /clubs/{club_id}/monitoring
Content-Type: application/json

{
  "enabled": false
}
```

All fields are optional. Only include fields you want to update.

**Response:**
```json
{
  "id": 1,
  "club_id": 1,
  "enabled": false,
  ...
}
```

**Example - Disable monitoring:**
```bash
curl -X PATCH http://localhost:8000/clubs/1/monitoring \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

**Example - Change frequency:**
```bash
curl -X PATCH http://localhost:8000/clubs/1/monitoring \
  -H "Content-Type: application/json" \
  -d '{"frequency_minutes": 30}'
```

---

### Delete Monitoring Config

Stop monitoring a club.

**Request:**
```http
DELETE /clubs/{club_id}/monitoring
```

**Response:**
- Status: `204 No Content`

---

## Error Handling

The API uses standard HTTP status codes:

- `200`: Success
- `201`: Created
- `204`: No Content (successful deletion)
- `400`: Bad Request (validation error, duplicate, etc.)
- `404`: Not Found
- `422`: Unprocessable Entity (invalid JSON)
- `500`: Internal Server Error

Error response format:
```json
{
  "detail": "Descriptive error message"
}
```

Validation error format:
```json
{
  "detail": [
    {
      "loc": ["body", "frequency_minutes"],
      "msg": "ensure this value is greater than or equal to 1",
      "type": "value_error.number.not_ge"
    }
  ]
}
```

---

## Rate Limiting

The client implements rate limiting when calling Playtomic:
- Default delay: 1 second between requests
- Configurable via `REQUEST_DELAY_SECONDS` in `.env`

Your API has no rate limiting by default. In production, add rate limiting middleware.

---

## Python SDK Example

Here's a simple Python client:

```python
import requests
from datetime import date, timedelta

class PlaytomicMonitorClient:
    def __init__(self, base_url="http://localhost:8000"):
        self.base_url = base_url

    def search_clubs(self, query):
        """Search for clubs."""
        response = requests.get(
            f"{self.base_url}/clubs/search",
            params={"query": query}
        )
        response.raise_for_status()
        return response.json()

    def add_club(self, club_data):
        """Add a club to monitoring."""
        response = requests.post(
            f"{self.base_url}/clubs",
            json=club_data
        )
        response.raise_for_status()
        return response.json()

    def fetch_availability(self, club_id, days=7):
        """Fetch availability for a club."""
        response = requests.post(
            f"{self.base_url}/clubs/{club_id}/fetch-availability",
            params={"days": days}
        )
        response.raise_for_status()
        return response.json()

    def get_utilization(self, club_id, from_date=None, to_date=None):
        """Get historical utilization."""
        if from_date is None:
            from_date = date.today() - timedelta(days=7)
        if to_date is None:
            to_date = date.today()

        response = requests.get(
            f"{self.base_url}/clubs/{club_id}/utilization/daily",
            params={
                "from_date": from_date.isoformat(),
                "to_date": to_date.isoformat()
            }
        )
        response.raise_for_status()
        return response.json()

    def enable_monitoring(self, club_id, frequency_minutes=15):
        """Enable monitoring for a club."""
        response = requests.post(
            f"{self.base_url}/clubs/{club_id}/monitoring",
            json={
                "enabled": True,
                "frequency_minutes": frequency_minutes,
                "start_time_local": "08:00",
                "end_time_local": "23:00",
                "days_ahead": 7
            }
        )
        response.raise_for_status()
        return response.json()

# Usage
client = PlaytomicMonitorClient()

# Search and add a club
clubs = client.search_clubs("Madrid")
if clubs:
    club_data = clubs[0]
    saved_club = client.add_club(club_data)
    club_id = saved_club["id"]

    # Fetch availability
    availability = client.fetch_availability(club_id)
    print(f"Fetched {len(availability['slots'])} slots")

    # Enable monitoring
    config = client.enable_monitoring(club_id)
    print(f"Monitoring enabled: {config['enabled']}")

    # Get utilization
    utilization = client.get_utilization(club_id)
    for day in utilization["daily_data"]:
        print(f"{day['date']}: {day['booked_percentage']}% booked")
```

---

## Interactive Documentation

For interactive API documentation with a "Try it out" feature, visit:

```
http://localhost:8000/docs
```

This provides a Swagger UI where you can test all endpoints directly from your browser.

---

## Webhooks / Callbacks

Currently not implemented. Future versions may include:
- Webhook when slot becomes available
- Webhook on monitoring errors
- Callback URLs for notifications
