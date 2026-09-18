# Supabase, FCM, and MVC Architecture

SplitShare uses a Laravel-familiar modular MVC structure while retaining FastAPI:

```text
Flutter (Views + Riverpod controllers)
  ├─ Supabase Auth: signup, sign-in, session refresh, JWT storage
  └─ Firebase Messaging: obtains the device token
                       │ Bearer Supabase JWT + device token
FastAPI /api/v1        ▼
  app/http/controllers/  = Laravel controllers (thin HTTP layer)
  app/services/          = use cases and integrations
  app/repositories/      = database queries
  db/models/             = SQLAlchemy Eloquent-equivalent models
  schemas/               = validated request/response DTOs
                       │
Supabase Postgres       = application data and migrations
Firebase Admin / FCM    = outbound notification delivery only
```

## Ownership rules

- Supabase Auth owns passwords, refresh tokens, and JWT issuance. The API never creates JWTs or accepts passwords.
- The API verifies the Supabase access token, then creates/updates its local `users` application profile on the first authenticated request. The UUID is the Supabase `auth.users.id` (`sub`).
- Supabase Postgres is the only application database. Use its connection string as `DATABASE_URL`; run Alembic migrations against that database.
- Firebase Cloud Messaging only delivers a notification after a committed business event. `device_tokens` holds delivery addresses; it must never determine balances, permissions, or financial state.

## FastAPI MVC conventions

| Laravel concept | SplitShare location | Rule |
| --- | --- | --- |
| Route | `app/http/controllers/` via `api/v1/router.py` | one controller per resource |
| Controller | `app/http/controllers/*_controller.py` | validate/delegate/respond; no SQL |
| Form Request / Resource | `schemas/` | Pydantic request and response models |
| Service / Action | `app/services/` | transaction-aware use cases |
| Repository | `app/repositories/` | persistence queries only |
| Eloquent Model | `db/models/` | mappings and relationships only |
| Migration | `migrations/versions/` | schema changes only |

## Required configuration

API environment:

```sh
DATABASE_URL=postgresql+asyncpg://...supabase...
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_JWT_SECRET=<Project Settings / API JWT secret>
SUPABASE_JWT_ISSUER=https://<project-ref>.supabase.co/auth/v1
FIREBASE_SERVICE_ACCOUNT_PATH=/run/secrets/firebase-service-account.json
```

Flutter build-time values:

```sh
flutter run \
  --dart-define=SUPABASE_URL=https://<project-ref>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<publishable-or-anon-key> \
  --dart-define=API_BASE_URL=https://api.example.com
```

Add the Firebase platform configuration files through FlutterFire (`google-services.json` for Android and `GoogleService-Info.plist` for iOS). They identify the mobile app and are not server credentials. Keep the Firebase Admin service-account JSON in the deployment secret store, never in Git.
