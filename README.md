# Playtomic Availability Monitor

A service that monitors and tracks Playtomic club availability over time. This tool allows you to search for Playtomic clubs, monitor their court availability, and analyze utilization patterns.

## Features

- **Club Search**: Search for Playtomic clubs by name
- **Availability Tracking**: Fetch and store availability snapshots for courts
- **Automated Monitoring**: Configure periodic checks for club availability
- **Utilization Analytics**: Track booking patterns and court utilization over time
- **REST API**: Full-featured API for integration
- **Web Interface**: Simple web UI for managing clubs and viewing stats

## Important Legal & Ethical Considerations

This tool is designed to:
- Only access publicly visible information (no login required)
- Respect Playtomic's robots.txt and rate limits
- Implement politeness measures (delays between requests)
- Not bypass any authentication or access controls

**Before using this tool:**
1. Review Playtomic's Terms of Service
2. Ensure your use case complies with their policies
3. Implement appropriate rate limiting
4. Only monitor a reasonable number of clubs

## Architecture

- **Backend**: Python + FastAPI
- **Database**: PostgreSQL with SQLAlchemy ORM
- **Scheduler**: APScheduler for background tasks
- **Frontend**: Simple HTML/JavaScript interface

## Prerequisites

- Python 3.9+
- PostgreSQL 12+
- Redis (optional, for future Celery integration)

## Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Battleborn
```

### 2. Set Up Python Environment

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Linux/Mac:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Set Up Database

```bash
# Create PostgreSQL database
createdb playtomic_monitor

# Or using psql:
psql -U postgres
CREATE DATABASE playtomic_monitor;
\q
```

### 4. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your settings
nano .env
```

Update the `.env` file with your database credentials:

```env
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/playtomic_monitor
```

### 5. Run Database Migrations

```bash
# Generate initial migration
alembic revision --autogenerate -m "Initial schema"

# Apply migrations
alembic upgrade head
```

### 6. Discover Playtomic API Endpoints

**IMPORTANT**: Before the service can work, you need to discover the actual Playtomic API endpoints:

1. Open https://playtomic.com in Chrome or Firefox
2. Open Developer Tools (F12) and go to the Network tab
3. Search for a club (e.g., type "Madrid" in the search box)
4. Look for XHR/Fetch requests in the Network tab
5. Find the endpoint that returns club search results
6. Click on a club and observe the calendar/booking interface
7. Find the endpoint that returns availability data

Update the endpoints in `app/services/playtomic_client.py`:

```python
self.endpoints = {
    "search": f"{self.api_base_url}/YOUR_ACTUAL_SEARCH_ENDPOINT",
    "club_details": f"{self.api_base_url}/YOUR_ACTUAL_CLUB_ENDPOINT",
    "availability": f"{self.api_base_url}/YOUR_ACTUAL_AVAILABILITY_ENDPOINT",
}
```

Also update the response parsing logic in:
- `search_clubs()` method
- `get_availability()` method
- `_process_and_store_availability()` in `availability_service.py`

### 7. Start the Application

```bash
# Run the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The application will be available at:
- Web UI: http://localhost:8000/static/index.html
- API Docs: http://localhost:8000/docs
- API: http://localhost:8000

## Usage

### Web Interface

1. Go to http://localhost:8000/static/index.html
2. Search for a club by name
3. Click on a search result to add it to your clubs
4. For each club, you can:
   - Fetch availability (one-time)
   - Configure monitoring (automated periodic checks)
   - View utilization statistics

### API Endpoints

#### Club Management

```bash
# Search for clubs
GET /clubs/search?query=Madrid

# Create a club
POST /clubs
{
  "playtomic_id": "abc123",
  "name": "Club Padel Madrid",
  "address": "Calle Example 123",
  "city": "Madrid",
  "country": "Spain"
}

# List all clubs
GET /clubs

# Get club details
GET /clubs/{club_id}

# Update club
PATCH /clubs/{club_id}

# Delete club
DELETE /clubs/{club_id}
```

#### Availability

```bash
# Fetch availability for a club (today + N days)
POST /clubs/{club_id}/fetch-availability?days=7

# Get current utilization (today)
GET /clubs/{club_id}/utilization/current

# Get historical utilization
GET /clubs/{club_id}/utilization/daily?from_date=2024-01-01&to_date=2024-01-07
```

#### Monitoring Configuration

```bash
# Create monitoring config
POST /clubs/{club_id}/monitoring
{
  "enabled": true,
  "frequency_minutes": 15,
  "start_time_local": "08:00",
  "end_time_local": "23:00",
  "days_ahead": 7
}

# Get monitoring config
GET /clubs/{club_id}/monitoring

# Update monitoring config
PATCH /clubs/{club_id}/monitoring
{
  "enabled": false
}

# Delete monitoring config
DELETE /clubs/{club_id}/monitoring
```

## Database Schema

### Tables

#### clubs
- `id`: Primary key
- `playtomic_id`: Playtomic's club identifier
- `slug`: Club URL slug
- `name`: Club name
- `address`, `city`, `country`: Location information
- `latitude`, `longitude`: Coordinates
- `timezone`: Club timezone (for scheduling)
- `operating_hours`: JSON with operating hours
- `created_at`, `updated_at`: Timestamps

#### courts
- `id`: Primary key
- `club_id`: Foreign key to clubs
- `playtomic_court_id`: Playtomic's court identifier
- `name`: Court name
- `sport_type`: Type of sport (padel, tennis, etc.)
- `surface_type`: Indoor/outdoor
- `created_at`, `updated_at`: Timestamps

#### monitoring_configs
- `id`: Primary key
- `club_id`: Foreign key to clubs (unique)
- `enabled`: Whether monitoring is active
- `frequency_minutes`: Check frequency (e.g., 15)
- `start_time_local`, `end_time_local`: Monitoring window
- `days_ahead`: How many days to fetch
- `last_run_at`: Last check timestamp
- `created_at`, `updated_at`: Timestamps

#### availability_snapshots
- `id`: Primary key
- `club_id`: Foreign key to clubs
- `court_id`: Foreign key to courts
- `snapshot_time`: When snapshot was taken (UTC)
- `date`: Date of the slot (local to club)
- `start_time`, `end_time`: Slot times
- `status`: booked/free/closed/unknown
- `price`: Slot price
- `created_at`: Timestamp

## How It Works

### Data Collection Flow

1. **Manual Fetch**:
   - User clicks "Fetch Availability" for a club
   - System calls Playtomic API for today + N days
   - Parses response and stores snapshots in database
   - Each snapshot records the availability status at that moment

2. **Automated Monitoring**:
   - Background scheduler runs every minute
   - Checks all enabled monitoring configs
   - For each config:
     - Converts current time to club's timezone
     - Checks if within monitoring window
     - Checks if frequency interval has passed
     - If yes, fetches and stores availability
   - Updates `last_run_at` timestamp

3. **Utilization Analysis**:
   - Queries latest snapshots for each court/slot combination
   - Aggregates data to calculate percentages
   - Can show current (today) or historical utilization

### Monitoring Example

If you configure:
- Frequency: 15 minutes
- Window: 08:00 - 23:00
- Days ahead: 7

The system will:
- Check availability every 15 minutes
- Only during 08:00 - 23:00 (in club's local time)
- Fetch data for today + next 7 days
- Store snapshots showing which slots are booked vs free

Over time, you can see patterns like:
- "Tuesdays 18:00-20:00 are 85% booked"
- "Weekend mornings fill up 3 days in advance"
- "Court 3 has lower utilization than other courts"

## Development

### Project Structure

```
Battleborn/
├── app/
│   ├── api/              # API endpoints
│   │   ├── clubs.py      # Club endpoints
│   │   ├── availability.py
│   │   └── monitoring.py
│   ├── core/             # Core configuration
│   │   ├── config.py     # Settings
│   │   └── database.py   # Database connection
│   ├── models/           # SQLAlchemy models
│   │   ├── club.py
│   │   ├── court.py
│   │   ├── monitoring_config.py
│   │   └── availability_snapshot.py
│   ├── schemas/          # Pydantic schemas
│   │   ├── club.py
│   │   ├── monitoring.py
│   │   └── availability.py
│   ├── services/         # Business logic
│   │   ├── playtomic_client.py
│   │   ├── availability_service.py
│   │   └── scheduler.py
│   └── main.py           # FastAPI app
├── alembic/              # Database migrations
├── static/               # Frontend files
│   └── index.html
├── tests/                # Tests
├── requirements.txt
├── .env.example
└── README.md
```

### Running Tests

```bash
pytest
```

### Code Style

```bash
# Format code
black app/

# Lint code
flake8 app/

# Type checking
mypy app/
```

## Rate Limiting & Politeness

The system implements several measures to be respectful:

1. **Request Delay**: 1 second delay between API calls (configurable)
2. **Retry Logic**: Exponential backoff on failures
3. **Monitoring Frequency**: Configurable minimum interval (default: 15 minutes)
4. **Monitoring Window**: Only check during specified hours
5. **Error Handling**: Graceful failure without hammering the API

To adjust rate limiting, modify `.env`:

```env
REQUEST_DELAY_SECONDS=2.0  # 2 second delay
DEFAULT_CHECK_FREQUENCY_MINUTES=30  # 30 minute minimum
```

## Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql -U user -d playtomic_monitor -c "SELECT 1;"
```

### Migration Issues

```bash
# Reset database (WARNING: destroys data)
alembic downgrade base
alembic upgrade head

# Or start fresh
dropdb playtomic_monitor
createdb playtomic_monitor
alembic upgrade head
```

### API Endpoint Discovery

If the Playtomic endpoints don't work:

1. Clear browser cache
2. Use incognito mode
3. Try different clubs/dates
4. Check for API version changes
5. Look for rate limiting responses

### Scheduler Not Running

```bash
# Check logs
# Look for "Starting monitoring scheduler" in output

# Verify monitoring config is enabled
curl http://localhost:8000/clubs/1/monitoring

# Check scheduler status
curl http://localhost:8000/health
```

## Production Deployment

### Environment Variables

Set these in production:

```env
DEBUG=False
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db
REDIS_URL=redis://redis:6379/0
```

### Using Docker

```bash
# Build image
docker build -t playtomic-monitor .

# Run container
docker run -d \
  -p 8000:8000 \
  -e DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db \
  playtomic-monitor
```

### Using Systemd

Create `/etc/systemd/system/playtomic-monitor.service`:

```ini
[Unit]
Description=Playtomic Availability Monitor
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/playtomic-monitor
Environment="PATH=/opt/playtomic-monitor/venv/bin"
ExecStart=/opt/playtomic-monitor/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable playtomic-monitor
sudo systemctl start playtomic-monitor
```

## Future Enhancements

- [ ] Webhook notifications when slots become available
- [ ] Advanced analytics (trends, predictions)
- [ ] Multi-sport support (tennis, squash, etc.)
- [ ] Export data to CSV/Excel
- [ ] Mobile app
- [ ] User authentication and multi-user support
- [ ] Club comparison features
- [ ] Email/SMS alerts for specific time slots

## License

MIT

## Disclaimer

This tool is for educational and personal use only. Users are responsible for:
- Complying with Playtomic's Terms of Service
- Not overloading Playtomic's servers
- Using the tool ethically and responsibly
- Respecting rate limits and access controls

The authors are not responsible for any misuse of this software.

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## Support

For issues or questions:
- Open an issue on GitHub
- Check the API documentation at `/docs`
- Review the code comments

## Acknowledgments

- Built with FastAPI, SQLAlchemy, and PostgreSQL
- Inspired by the need for better court availability insights
- Thanks to the Playtomic community
