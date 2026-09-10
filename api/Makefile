SHELL := /bin/bash
export PATH := $(HOME)/.local/bin:/opt/homebrew/bin:/usr/local/bin:$(PATH)

.PHONY: help install dev run test test-watch migration migrate rollback history current lint format clean

# Default target: show help
help:
	@echo ""
	@echo "MusicOne API — Developer Commands:"
	@echo ""
	@echo "  Environment & App:"
	@echo "    make install            Install all project dependencies with uv"
	@echo "    make dev / make run     Start FastAPI dev server with live reload"
	@echo ""
	@echo "  Database & Migrations:"
	@echo "    make migration m=\"msg\"  Create a new Alembic migration template"
	@echo "    make migrate            Apply all pending migrations (alembic upgrade head)"
	@echo "    make rollback           Roll back database by 1 migration (alembic downgrade -1)"
	@echo "    make history            View Alembic migration history"
	@echo "    make current            View current applied database revision"
	@echo ""
	@echo "  Testing & Quality:"
	@echo "    make test               Run pytest test suite"
	@echo "    make test-watch         Run pytest in watch mode"
	@echo "    make lint               Run linter checks with ruff"
	@echo "    make format             Auto-format Python code with ruff"
	@echo "    make clean              Remove pycache and cache artifacts"
	@echo ""

install:
	uv sync

dev:
	uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

run: dev

test:
	uv run pytest -v

test-watch:
	uv run pytest -f

migration:
	@if [ -z "$(m)" ]; then \
		echo "Error: Migration message is required."; \
		echo "Usage: make migration m=\"description of migration\""; \
		exit 1; \
	fi
	uv run alembic revision -m "$(m)"

migrate:
	uv run alembic upgrade head

rollback:
	uv run alembic downgrade -1

history:
	uv run alembic history --verbose

current:
	uv run alembic current

lint:
	uv run ruff check .

format:
	uv run ruff format .

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
	find . -type d -name ".ruff_cache" -exec rm -rf {} +
	rm -rf .coverage
