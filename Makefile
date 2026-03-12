.PHONY: help setup run dev docker-build docker-up docker-down docker-logs

help:
	@echo "Usage:"
	@echo "  make setup        Create venv and install deps with uv"
	@echo "  make run          Run the app locally (requires .env)"
	@echo "  make dev          Run with --reload for local development"
	@echo "  make docker-build Build the Docker image"
	@echo "  make docker-up    Build and start with docker compose"
	@echo "  make docker-down  Stop containers"
	@echo "  make docker-logs  Tail container logs"

setup:
	uv venv
	uv pip install -r requirements.txt

run:
	.venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port $${PORT:-8000}

dev:
	.venv/bin/uvicorn backend.main:app --reload --host 0.0.0.0 --port $${PORT:-8000}

docker-build:
	docker compose build

docker-up:
	docker compose up --build

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f
