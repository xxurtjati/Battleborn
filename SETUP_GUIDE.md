# Setup Guide - Playtomic Availability Monitor

This guide walks you through the complete setup process.

## Prerequisites Check

Before starting, verify you have:

```bash
# Python 3.9+
python --version

# PostgreSQL 12+
psql --version

# pip
pip --version

# (Optional) Docker
docker --version
docker-compose --version
```

## Option 1: Local Setup (Recommended for Development)

### Step 1: Clone and Navigate

```bash
git clone <repository-url>
cd Battleborn
```

### Step 2: Create Virtual Environment

```bash
# Create virtual environment
python -m venv venv

# Activate it
# On Linux/Mac:
source venv/bin/activate

# On Windows:
venv\Scripts\activate

# Your prompt should now show (venv)
```

### Step 3: Install Dependencies

```bash
pip install -r requirements.txt
```

Expected output: All packages should install successfully.

### Step 4: Set Up PostgreSQL

#### Option A: Local PostgreSQL

```bash
# Start PostgreSQL (varies by system)
# Ubuntu/Debian:
sudo systemctl start postgresql

# macOS (Homebrew):
brew services start postgresql

# Create database
createdb playtomic_monitor

# Or if you need to specify user:
sudo -u postgres createdb playtomic_monitor

# Verify it worked
psql playtomic_monitor -c "SELECT 1;"
```

#### Option B: PostgreSQL in Docker

```bash
docker run -d \
  --name playtomic-postgres \
  -e POSTGRES_USER=playtomic \
  -e POSTGRES_PASSWORD=playtomic123 \
  -e POSTGRES_DB=playtomic_monitor \
  -p 5432:5432 \
  postgres:15-alpine
```

### Step 5: Configure Environment

```bash
# Copy example file
cp .env.example .env

# Edit .env
nano .env  # or vim, or your preferred editor
```

Update these values in `.env`:

```env
# For local PostgreSQL:
DATABASE_URL=postgresql+asyncpg://postgres:yourpassword@localhost:5432/playtomic_monitor

# For Docker PostgreSQL:
DATABASE_URL=postgresql+asyncpg://playtomic:playtomic123@localhost:5432/playtomic_monitor

# Other settings (keep defaults for now)
API_HOST=0.0.0.0
API_PORT=8000
DEBUG=True
```

### Step 6: Run Database Migrations

```bash
# Generate initial migration
alembic revision --autogenerate -m "Initial schema"

# This should output something like:
# Generating /path/to/alembic/versions/abc123_initial_schema.py ... done

# Apply the migration
alembic upgrade head

# Expected output:
# INFO  [alembic.runtime.migration] Running upgrade -> abc123, Initial schema
```

Verify tables were created:

```bash
psql playtomic_monitor -c "\dt"
```

You should see: `clubs`, `courts`, `monitoring_configs`, `availability_snapshots`

### Step 7: Discover Playtomic API Endpoints

This is the **most important step** - the application needs actual API endpoints.

1. Open https://playtomic.com in Chrome or Firefox
2. Open Developer Tools (F12)
3. Go to the **Network** tab
4. Filter by "XHR" or "Fetch"

#### Find Search Endpoint:

1. Type a club name in Playtomic's search box (e.g., "Madrid")
2. Look for a network request that returns club data
3. Click on it to see the URL and response

Example (yours will be different):
```
Request URL: https://playtomic.com/api/v1/tenants/search?query=Madrid&sport=PADEL
Response:
{
  "results": [
    {
      "tenant_id": "...",
      "tenant_name": "...",
      ...
    }
  ]
}
```

#### Find Availability Endpoint:

1. Click on a club to go to its booking page
2. Select different dates in the calendar
3. Look for requests that return availability/slots data

Example:
```
Request URL: https://playtomic.com/api/v1/availability/CLUB_ID/2024-01-15
Response:
{
  "courts": [...],
  "slots": [...]
}
```

#### Update the Code:

Edit `app/services/playtomic_client.py`:

```python
self.endpoints = {
    "search": f"{self.api_base_url}/YOUR_DISCOVERED_SEARCH_ENDPOINT",
    "club_details": f"{self.api_base_url}/YOUR_DISCOVERED_CLUB_ENDPOINT",
    "availability": f"{self.api_base_url}/YOUR_DISCOVERED_AVAILABILITY_ENDPOINT",
}
```

Also update the parsing logic in:
- `search_clubs()` method to match actual response structure
- `get_availability()` method
- `_process_and_store_availability()` in `availability_service.py`

### Step 8: Start the Application

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Expected output:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Starting Playtomic Availability Monitor
INFO:     Starting monitoring scheduler
INFO:     Monitoring scheduler started
```

### Step 9: Test the Application

Open your browser and go to:

1. **API Docs**: http://localhost:8000/docs
   - You should see interactive API documentation
   - Try the "GET /health" endpoint
   - Expected response: `{"status": "healthy", "scheduler_running": true}`

2. **Web UI**: http://localhost:8000/static/index.html
   - You should see the Playtomic Availability Monitor interface
   - Try searching for a club

3. **Test API with curl**:

```bash
# Health check
curl http://localhost:8000/health

# Search clubs (will fail until you configure endpoints)
curl "http://localhost:8000/clubs/search?query=Madrid"
```

## Option 2: Docker Setup (Recommended for Production)

### Step 1: Clone Repository

```bash
git clone <repository-url>
cd Battleborn
```

### Step 2: Configure Environment

```bash
cp .env.example .env
# Edit .env if needed (docker-compose has defaults)
```

### Step 3: Start Services

```bash
docker-compose up -d
```

This will:
- Start PostgreSQL
- Start Redis
- Build and start the application
- Run migrations automatically

### Step 4: View Logs

```bash
# All services
docker-compose logs -f

# Just the app
docker-compose logs -f app

# Check if services are healthy
docker-compose ps
```

### Step 5: Access Application

Same as local setup:
- API Docs: http://localhost:8000/docs
- Web UI: http://localhost:8000/static/index.html

### Step 6: Stop Services

```bash
# Stop
docker-compose down

# Stop and remove volumes (deletes data!)
docker-compose down -v
```

## Troubleshooting

### Issue: "Database connection failed"

```bash
# Check if PostgreSQL is running
# Local:
sudo systemctl status postgresql

# Docker:
docker ps | grep postgres

# Test connection manually
psql -h localhost -U playtomic -d playtomic_monitor
```

### Issue: "Import errors" or "Module not found"

```bash
# Make sure virtual environment is activated
which python
# Should show: /path/to/Battleborn/venv/bin/python

# Reinstall dependencies
pip install -r requirements.txt
```

### Issue: "Alembic can't find models"

```bash
# Make sure you're in the project root
pwd
# Should show: /path/to/Battleborn

# Check Python path
python -c "import app.models; print('OK')"
```

### Issue: "Port 8000 already in use"

```bash
# Find what's using the port
lsof -i :8000

# Kill it or use a different port
uvicorn app.main:app --port 8001
```

### Issue: "Playtomic API returns 403/429"

This means rate limiting or blocking:

1. Increase `REQUEST_DELAY_SECONDS` in `.env`
2. Reduce monitoring frequency
3. Check if your IP is blocked
4. Verify you're using public endpoints (no auth required)

## Next Steps

After successful setup:

1. **Configure Playtomic endpoints** (Step 7 above) - most important!
2. **Test search functionality** - search for a real club
3. **Add a club** - save one to your database
4. **Fetch availability** - test the availability fetch
5. **Configure monitoring** - set up automated checks
6. **Wait and observe** - let it collect data for a few hours
7. **View analytics** - check utilization stats

## Development Workflow

```bash
# 1. Activate virtual environment
source venv/bin/activate

# 2. Start the server with auto-reload
uvicorn app.main:app --reload

# 3. Make code changes
# Server will automatically reload

# 4. Create a new migration after model changes
alembic revision --autogenerate -m "Description of changes"
alembic upgrade head

# 5. Run tests
pytest

# 6. Format code
black app/

# 7. Deactivate when done
deactivate
```

## Production Deployment

For production deployment, see the "Production Deployment" section in README.md.

Key differences:
- Set `DEBUG=False`
- Use proper secrets for database
- Set up HTTPS/reverse proxy
- Configure log rotation
- Set up monitoring/alerts
- Use systemd or Docker for auto-restart

## Getting Help

If you're stuck:

1. Check logs: `docker-compose logs -f` or terminal output
2. Review this guide carefully
3. Check the main README.md
4. Inspect browser DevTools Network tab
5. Open an issue on GitHub

## Verification Checklist

Before considering setup complete, verify:

- [ ] PostgreSQL is running and accessible
- [ ] Virtual environment is activated
- [ ] All dependencies installed (`pip list` shows packages)
- [ ] Database created and migrations applied
- [ ] `.env` file configured with correct DATABASE_URL
- [ ] Playtomic API endpoints discovered and configured
- [ ] Server starts without errors
- [ ] Health endpoint returns healthy status
- [ ] API docs accessible at /docs
- [ ] Web UI loads at /static/index.html
- [ ] Can search for clubs (after endpoint configuration)

## Common First-Time Mistakes

1. **Forgetting to activate venv** - commands use system Python
2. **Wrong DATABASE_URL format** - should be `postgresql+asyncpg://...`
3. **Not running migrations** - tables don't exist
4. **Not configuring Playtomic endpoints** - API calls fail
5. **Not updating response parsing** - data not stored correctly
6. **Firewall blocking PostgreSQL** - connection refused
7. **Wrong working directory** - imports fail

Take your time with each step and verify it works before moving on!
