.PHONY: up down logs build restart migrate makemigrations sync run reset-db matching-test

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

# * make reset-db — полный сброс БД (роняет volume целиком) + миграции с нуля. Нужен перед
# * "официальным" прогоном matching-test, иначе накопленные с прошлых прогонов persons искажают
# * rarity/precision в статистике мэтчинга.
reset-db:
	docker compose down -v
	docker compose up -d --build
	docker compose exec backend uv run alembic upgrade head

# * make matching-test — нагрузочный/точностный тест алгоритма мэтчинга на ~20 синтетических
# * деревьях (см. Jeli-Bruno/scripts/matching_load_test.py). Прогонять после reset-db для чистых чисел.
matching-test:
	uv run python Jeli-Bruno/scripts/matching_load_test.py
