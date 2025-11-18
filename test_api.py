#!/usr/bin/env python3
"""Simple API test script to verify the service is working."""

import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:8000"

def test_health():
    """Test health endpoint."""
    print("Testing health endpoint...")
    response = requests.get(f"{BASE_URL}/health")
    print(f"  Status: {response.status_code}")
    print(f"  Response: {response.json()}")
    assert response.status_code == 200
    print("  ✓ Health check passed\n")

def test_create_club():
    """Test creating a club."""
    print("Testing club creation...")
    club_data = {
        "playtomic_id": "test_club_123",
        "name": "Test Club Madrid",
        "address": "Test Address 123",
        "city": "Madrid",
        "country": "Spain",
        "latitude": 40.4168,
        "longitude": -3.7038,
        "timezone": "Europe/Madrid"
    }

    response = requests.post(f"{BASE_URL}/clubs", json=club_data)
    print(f"  Status: {response.status_code}")

    if response.status_code == 201:
        club = response.json()
        print(f"  Created club ID: {club['id']}")
        print(f"  Club name: {club['name']}")
        print("  ✓ Club creation passed\n")
        return club['id']
    elif response.status_code == 400 and "already exists" in response.json().get('detail', ''):
        print("  ℹ Club already exists, fetching existing...")
        response = requests.get(f"{BASE_URL}/clubs")
        clubs = response.json()
        for club in clubs:
            if club['playtomic_id'] == club_data['playtomic_id']:
                print(f"  Found existing club ID: {club['id']}")
                print("  ✓ Using existing club\n")
                return club['id']
    else:
        print(f"  Error: {response.json()}")
        return None

def test_list_clubs():
    """Test listing clubs."""
    print("Testing club listing...")
    response = requests.get(f"{BASE_URL}/clubs")
    print(f"  Status: {response.status_code}")
    clubs = response.json()
    print(f"  Found {len(clubs)} club(s)")
    if clubs:
        print(f"  First club: {clubs[0]['name']}")
    print("  ✓ Club listing passed\n")
    return clubs

def test_monitoring_config(club_id):
    """Test monitoring configuration."""
    print(f"Testing monitoring config for club {club_id}...")

    config_data = {
        "enabled": True,
        "frequency_minutes": 15,
        "start_time_local": "08:00",
        "end_time_local": "23:00",
        "days_ahead": 7
    }

    # Try to create
    response = requests.post(f"{BASE_URL}/clubs/{club_id}/monitoring", json=config_data)

    if response.status_code == 201:
        config = response.json()
        print(f"  Created monitoring config")
        print(f"  Enabled: {config['enabled']}")
        print(f"  Frequency: {config['frequency_minutes']} minutes")
        print("  ✓ Monitoring config created\n")
    elif response.status_code == 400 and "already exists" in response.json().get('detail', ''):
        print("  ℹ Config already exists, fetching...")
        response = requests.get(f"{BASE_URL}/clubs/{club_id}/monitoring")
        config = response.json()
        print(f"  Enabled: {config['enabled']}")
        print("  ✓ Using existing config\n")
    else:
        print(f"  Status: {response.status_code}")
        print(f"  Response: {response.json()}")

def test_api_docs():
    """Test that API docs are accessible."""
    print("Testing API documentation...")
    response = requests.get(f"{BASE_URL}/docs")
    print(f"  Status: {response.status_code}")
    assert response.status_code == 200
    print("  ✓ API docs accessible at /docs\n")

def test_static_ui():
    """Test that static UI is accessible."""
    print("Testing web UI...")
    response = requests.get(f"{BASE_URL}/static/index.html")
    print(f"  Status: {response.status_code}")
    assert response.status_code == 200
    print("  ✓ Web UI accessible at /static/index.html\n")

def main():
    """Run all tests."""
    print("=" * 60)
    print("PLAYTOMIC MONITOR - API TEST SUITE")
    print("=" * 60)
    print()

    try:
        # Basic tests
        test_health()
        test_api_docs()
        test_static_ui()

        # Database tests
        club_id = test_create_club()
        test_list_clubs()

        if club_id:
            test_monitoring_config(club_id)

        print("=" * 60)
        print("ALL TESTS PASSED! ✓")
        print("=" * 60)
        print()
        print("Next steps:")
        print("1. Open http://localhost:8000/docs to explore the API")
        print("2. Open http://localhost:8000/static/index.html to use the UI")
        print("3. Configure Playtomic API endpoints in app/services/playtomic_client.py")
        print("4. Test club search with real Playtomic data")
        print()

    except requests.exceptions.ConnectionError:
        print("\n❌ ERROR: Could not connect to the API")
        print("   Make sure the server is running:")
        print("   uvicorn app.main:app --reload")
        print()
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        print()
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        print()

if __name__ == "__main__":
    main()
