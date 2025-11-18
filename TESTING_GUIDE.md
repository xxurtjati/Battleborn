# Testing Guide

Complete guide to testing the Playtomic Availability Monitor.

## Quick Start Testing

### Method 1: Using Docker (Recommended for Quick Testing)

```bash
# Start all services
docker-compose up

# Wait ~10 seconds for startup, then in another terminal:
curl http://localhost:8000/health

# Expected output:
# {"status":"healthy","scheduler_running":true}
```

If that works, you're ready! Open:
- API Docs: http://localhost:8000/docs
- Web UI: http://localhost:8000/static/index.html

### Method 2: Local Setup

```bash
# 1. Set up Python environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# 2. Set up database (choose one):

# Option A: PostgreSQL in Docker
docker run -d --name playtomic-postgres \
  -e POSTGRES_USER=playtomic \
  -e POSTGRES_PASSWORD=playtomic123 \
  -e POSTGRES_DB=playtomic_monitor \
  -p 5432:5432 \
  postgres:15-alpine

# Option B: Local PostgreSQL
createdb playtomic_monitor

# 3. Configure environment
cp .env.example .env

# Edit .env:
# For Docker PostgreSQL:
DATABASE_URL=postgresql+asyncpg://playtomic:playtomic123@localhost:5432/playtomic_monitor

# For local PostgreSQL:
DATABASE_URL=postgresql+asyncpg://postgres:yourpassword@localhost:5432/playtomic_monitor

# 4. Run migrations
alembic upgrade head

# 5. Start the server
uvicorn app.main:app --reload
```

## Automated Test Suite

Run the test script:

```bash
# Make sure server is running first!
python test_api.py
```

This will test:
- ✓ Health endpoint
- ✓ API documentation accessibility
- ✓ Web UI accessibility
- ✓ Club creation
- ✓ Club listing
- ✓ Monitoring configuration

## Manual Testing Steps

### Step 1: Verify Server is Running

```bash
curl http://localhost:8000/health
```

Expected:
```json
{
  "status": "healthy",
  "scheduler_running": true
}
```

### Step 2: Check API Documentation

Open http://localhost:8000/docs

You should see Swagger UI with all endpoints.

### Step 3: Test Club Creation

Using curl:
```bash
curl -X POST http://localhost:8000/clubs \
  -H "Content-Type: application/json" \
  -d '{
    "playtomic_id": "test_123",
    "name": "Test Club",
    "city": "Madrid",
    "country": "Spain"
  }'
```

Expected response (201 Created):
```json
{
  "id": 1,
  "playtomic_id": "test_123",
  "name": "Test Club",
  "city": "Madrid",
  "country": "Spain",
  ...
}
```

Or use the API docs:
1. Go to http://localhost:8000/docs
2. Find "POST /clubs"
3. Click "Try it out"
4. Fill in the request body
5. Click "Execute"

### Step 4: List Clubs

```bash
curl http://localhost:8000/clubs
```

Should return an array with your test club.

### Step 5: Configure Monitoring

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

### Step 6: Test Web UI

1. Open http://localhost:8000/static/index.html
2. Click "Refresh Clubs" - you should see your test club
3. Try the buttons (they won't work until Playtomic endpoints are configured)

## Testing Without Playtomic Integration

Since you need to discover the Playtomic API endpoints first, here's how to test the core functionality:

### Create Mock Data

```python
# test_with_mock_data.py
import requests

BASE_URL = "http://localhost:8000"

# Create a test club
club = requests.post(f"{BASE_URL}/clubs", json={
    "playtomic_id": "mock_club_1",
    "name": "Mock Padel Club",
    "city": "Barcelona",
    "country": "Spain",
    "timezone": "Europe/Madrid"
}).json()

club_id = club['id']
print(f"Created club ID: {club_id}")

# Configure monitoring
config = requests.post(f"{BASE_URL}/clubs/{club_id}/monitoring", json={
    "enabled": True,
    "frequency_minutes": 30,
    "start_time_local": "09:00",
    "end_time_local": "22:00",
    "days_ahead": 5
}).json()

print(f"Monitoring enabled: {config['enabled']}")
print(f"Check frequency: {config['frequency_minutes']} minutes")

# Get monitoring config
config = requests.get(f"{BASE_URL}/clubs/{club_id}/monitoring").json()
print(f"Last run: {config['last_run_at']}")
```

### Verify Database

```bash
# Connect to database
psql playtomic_monitor

# Check tables exist
\dt

# Check club data
SELECT id, name, city FROM clubs;

# Check monitoring config
SELECT club_id, enabled, frequency_minutes FROM monitoring_configs;

# Exit
\q
```

## Testing with Real Playtomic Data

Once you've discovered and configured the Playtomic API endpoints:

### Step 1: Update Endpoints

Edit `app/services/playtomic_client.py`:
```python
self.endpoints = {
    "search": f"{self.api_base_url}/YOUR_DISCOVERED_ENDPOINT",
    "availability": f"{self.api_base_url}/YOUR_AVAILABILITY_ENDPOINT",
}
```

### Step 2: Test Search

```bash
curl "http://localhost:8000/clubs/search?query=Madrid"
```

Should return real clubs from Playtomic.

### Step 3: Add Real Club

Use the web UI:
1. Go to http://localhost:8000/static/index.html
2. Search for a club (e.g., "Madrid")
3. Click on a search result to add it
4. Should see "Club added successfully!"

### Step 4: Fetch Availability

Using the web UI:
1. Click "Fetch Availability" for your club
2. Wait a few seconds
3. Should see "Availability fetched successfully!"

Or using API:
```bash
curl -X POST http://localhost:8000/clubs/1/fetch-availability?days=7
```

### Step 5: View Utilization

```bash
# Current utilization
curl http://localhost:8000/clubs/1/utilization/current

# Historical utilization
curl "http://localhost:8000/clubs/1/utilization/daily?from_date=2024-01-01&to_date=2024-01-07"
```

### Step 6: Enable Monitoring

1. Use web UI "Configure Monitoring" button
2. Set frequency (e.g., 15 minutes)
3. Monitoring will start automatically
4. Check logs to see scheduler running

## Checking Logs

### Docker

```bash
# All services
docker-compose logs -f

# Just the app
docker-compose logs -f app

# Last 100 lines
docker-compose logs --tail=100 app
```

### Local

Server logs appear in the terminal where you ran `uvicorn`.

Look for:
```
INFO:     Starting Playtomic Availability Monitor
INFO:     Starting monitoring scheduler
INFO:     Monitoring scheduler started
```

When monitoring runs:
```
INFO:     Running monitoring check
INFO:     Found 1 enabled monitoring configs
INFO:     Running monitoring for club Test Club (1)
```

## Common Issues & Solutions

### Issue: "Connection refused" when testing

**Solution:**
```bash
# Check if server is running
curl http://localhost:8000/health

# If not, start it:
uvicorn app.main:app --reload
```

### Issue: "Database connection failed"

**Solution:**
```bash
# Check PostgreSQL is running
# Docker:
docker ps | grep postgres

# Local:
sudo systemctl status postgresql

# Test connection:
psql -h localhost -U playtomic -d playtomic_monitor
```

### Issue: "Table does not exist"

**Solution:**
```bash
# Run migrations
alembic upgrade head

# Verify tables
psql playtomic_monitor -c "\dt"
```

### Issue: "Module not found"

**Solution:**
```bash
# Make sure venv is activated
source venv/bin/activate

# Reinstall dependencies
pip install -r requirements.txt
```

### Issue: Search returns empty results

**Cause:** Playtomic endpoints not configured yet

**Solution:**
1. Open https://playtomic.com in browser
2. Open DevTools → Network tab
3. Search for a club
4. Find the API request
5. Update `app/services/playtomic_client.py`

## Performance Testing

### Test Many Clubs

```python
# Create 100 test clubs
for i in range(100):
    requests.post(f"{BASE_URL}/clubs", json={
        "playtomic_id": f"test_club_{i}",
        "name": f"Test Club {i}",
        "city": "Madrid"
    })

# List all clubs
import time
start = time.time()
response = requests.get(f"{BASE_URL}/clubs?limit=100")
print(f"Fetched {len(response.json())} clubs in {time.time() - start:.2f}s")
```

### Monitor Scheduler Performance

Watch the logs when monitoring is enabled:
```bash
docker-compose logs -f app | grep "monitoring"
```

Should see checks running at your configured frequency.

## Database Testing

### Check Snapshot Storage

```sql
-- Connect to database
psql playtomic_monitor

-- Count snapshots
SELECT COUNT(*) FROM availability_snapshots;

-- View recent snapshots
SELECT
  c.name as club,
  co.name as court,
  a.date,
  a.start_time,
  a.status,
  a.snapshot_time
FROM availability_snapshots a
JOIN clubs c ON a.club_id = c.id
JOIN courts co ON a.court_id = co.id
ORDER BY a.snapshot_time DESC
LIMIT 20;

-- Utilization by status
SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM availability_snapshots
WHERE date = CURRENT_DATE
GROUP BY status;
```

## Integration Testing

Full end-to-end test:

```bash
# 1. Search for club
curl "http://localhost:8000/clubs/search?query=Madrid"

# 2. Add club (use data from search)
curl -X POST http://localhost:8000/clubs \
  -H "Content-Type: application/json" \
  -d '{...data from search...}'

# 3. Fetch availability
curl -X POST http://localhost:8000/clubs/1/fetch-availability

# 4. Check utilization
curl http://localhost:8000/clubs/1/utilization/current

# 5. Enable monitoring
curl -X POST http://localhost:8000/clubs/1/monitoring \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "frequency_minutes": 15,
    "days_ahead": 7
  }'

# 6. Wait 15 minutes and check logs for automatic fetch
docker-compose logs -f app
```

## Test Checklist

Before considering the system working:

- [ ] Server starts without errors
- [ ] Health endpoint returns healthy
- [ ] API docs accessible at /docs
- [ ] Web UI loads at /static/index.html
- [ ] Can create a test club
- [ ] Can list clubs
- [ ] Can configure monitoring
- [ ] Database tables exist
- [ ] Can connect to database
- [ ] Scheduler is running (check logs)
- [ ] (After endpoint config) Can search Playtomic
- [ ] (After endpoint config) Can fetch availability
- [ ] (After endpoint config) Can view utilization

## Next Steps After Testing

Once basic tests pass:

1. Configure Playtomic API endpoints
2. Test with real club data
3. Let monitoring run for a few hours
4. Check utilization analytics
5. Verify data is accumulating in database
6. Test historical queries

## Getting Help

If tests fail:
1. Check the error message carefully
2. Review logs: `docker-compose logs -f`
3. Verify all prerequisites are installed
4. Check database connection
5. Ensure ports aren't in use (8000, 5432)
6. Review SETUP_GUIDE.md
7. Try the automated test script: `python test_api.py`
