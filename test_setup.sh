#!/bin/bash
# Quick test setup script

set -e

echo "=== Playtomic Monitor Test Setup ==="
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -q --upgrade pip
pip install -q -r requirements.txt

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cp .env.example .env
    echo ""
    echo "⚠️  IMPORTANT: Edit .env file with your database credentials!"
    echo "   Default DATABASE_URL assumes PostgreSQL running on localhost:5432"
    echo ""
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Make sure PostgreSQL is running"
echo "2. Run: createdb playtomic_monitor"
echo "3. Run: alembic upgrade head"
echo "4. Run: uvicorn app.main:app --reload"
echo ""
echo "Then test at: http://localhost:8000/docs"
