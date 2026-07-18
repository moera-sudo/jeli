.PHONY: up down logs build restart migrate makemigrations sync run

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f backend

build:
	docker compose build

restart: down up

# * make migrate — применить все миграции к БД в контейнере
migrate:
	docker compose exec backend uv run alembic upgrade head

# * make makemigrations m="описание миграции"
makemigrations:
	docker compose exec backend uv run alembic revision --autogenerate -m "$(m)"

sync:
	uv sync

# * Локальный запуск без Docker (нужна доступная PostgreSQL, см. .env)
run:
	uv run uvicorn src.main:app --reload --loop uvloop --http httptools
