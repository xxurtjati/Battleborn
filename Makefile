.PHONY: help setup test run docker-up docker-down clean db-create db-migrate db-reset

help:
	@echo "Playtomic Availability Monitor - Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make setup       - Set up virtual environment and install dependencies"
	@echo "  make db-create   - Create PostgreSQL database"
	@echo "  make db-migrate  - Run database migrations"
	@echo ""
	@echo "Running:"
	@echo "  make run         - Start the server locally"
	@echo "  make docker-up   - Start with Docker Compose"
	@echo "  make docker-down - Stop Docker Compose"
	@echo ""
	@echo "Testing:"
	@echo "  make test        - Run API tests"
	@echo ""
	@echo "Maintenance:"
	@echo "  make db-reset    - Reset database (WARNING: deletes all data)"
	@echo "  make clean       - Clean up virtual environment"

setup:
	python3 -m venv venv
	./venv/bin/pip install --upgrade pip
	./venv/bin/pip install -r requirements.txt
	cp -n .env.example .env || true
	@echo ""
	@echo "✓ Setup complete!"
	@echo "  Edit .env with your database credentials"
	@echo "  Then run: make db-migrate"

db-create:
	createdb playtomic_monitor || echo "Database may already exist"
	@echo "✓ Database created (or already exists)"

db-migrate:
	./venv/bin/alembic upgrade head
	@echo "✓ Migrations applied"

db-reset:
	@echo "WARNING: This will delete all data!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		dropdb playtomic_monitor || true; \
		createdb playtomic_monitor; \
		./venv/bin/alembic upgrade head; \
		echo "✓ Database reset complete"; \
	fi

run:
	./venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

docker-up:
	docker-compose up -d
	@echo ""
	@echo "✓ Services started!"
	@echo "  API: http://localhost:8000/docs"
	@echo "  UI:  http://localhost:8000/static/index.html"
	@echo ""
	@echo "View logs: docker-compose logs -f"

docker-down:
	docker-compose down
	@echo "✓ Services stopped"

test:
	@echo "Starting API tests..."
	@echo "Make sure the server is running first!"
	@echo ""
	python3 test_api.py

clean:
	rm -rf venv
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	@echo "✓ Cleaned up"
