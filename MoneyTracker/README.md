# SplitShare

SplitShare is a collaborative shared-expense tracker for trips, roommates, couples, families, and small groups.

The three `ARTIFACT_*` documents define the product rules. The application uses Supabase Auth for JWT issuance and Supabase Postgres for application data, with Firebase Cloud Messaging for push delivery. The FastAPI backend is organized with Laravel-familiar MVC layers; see [the integration architecture](docs/INTEGRATION_ARCHITECTURE.md).

## Prerequisites

- Flutter SDK (stable channel)
- Python 3.12+
- [uv](https://docs.astral.sh/uv/)
- Docker Desktop (for local PostgreSQL)

## Local development

Start PostgreSQL:

```sh
docker compose -f infra/compose/docker-compose.yml up -d db
```

Set up and run the API:

```sh
cd apps/api
cp .env.example .env
uv sync --group dev
uv run alembic upgrade head
uv run uvicorn splitshare.main:app --reload
```

The API health checks are available at `/health` and `/api/v1/health`.

Set up and run the Flutter shell:

```sh
cd apps/client
flutter pub get
flutter run
```

## Validation

```sh
cd apps/api
uv run ruff check .
uv run pytest

cd ../client
flutter analyze
flutter test
```
