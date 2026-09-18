# ARTIFACT 02 — TECHNICAL ARCHITECTURE & STACK
## SplitShare / Collaborative Finance Tracker

**Status:** Technical source of truth for implementation  
**Depends on:** `ARTIFACT 01 — PRODUCT FOUNDATION, WORKFLOWS & EDGE CASES`  
**Primary audience:** Codex / software engineers / future maintainers  
**Architecture style:** Cross-platform Flutter client + REST API + Laravel-style MVC modular FastAPI backend + Supabase PostgreSQL

> **Implementation update — 2026-08-12:** Supabase Auth is the authentication authority and Supabase Postgres is the managed database. Firebase Cloud Messaging is the push-delivery provider. This supersedes earlier references in this artifact to application-issued JWTs, application-managed password hashes, refresh-session issuance, and self-managed production PostgreSQL hosting. The detailed integration contract is in `docs/INTEGRATION_ARCHITECTURE.md`.

---

# 1. PURPOSE OF THIS ARTIFACT

This document defines **how SplitShare will be built**.

Artifact 01 defines the product rules and must remain the authority for:

- mission;
- vision;
- workflows;
- permissions;
- financial behavior;
- balance logic;
- settlements;
- MVP scope;
- edge cases.

Artifact 02 defines:

- frontend architecture;
- backend architecture;
- REST API standards;
- database implementation;
- authentication;
- RBAC enforcement;
- money representation;
- concurrency controls;
- idempotency;
- project organization;
- testing;
- logging;
- environments;
- deployment direction;
- CI/CD;
- coding rules;
- Codex implementation sequence.

If Artifact 01 and Artifact 02 appear to conflict on business behavior, **Artifact 01 wins** unless a requirement is explicitly revised.

---

# 2. APPROVED CORE STACK

```text
Flutter
Mobile / Web / Desktop
        │
        │ HTTPS REST API
        ▼
Python + FastAPI
        │
        ├── Authentication / Users / RBAC
        ├── Trackers
        ├── Members / Invitations
        ├── Expenses / Splits
        ├── Balances
        ├── Settlements
        ├── Collaboration
        └── Audit Logs
        │
        ▼
PostgreSQL
```

Future modules may be added without replacing the core stack:

```text
        ├── Budgets        [Future]
        ├── Reports        [Future]
        ├── Financial Accounts / Wallets [Future]
        ├── Receipt Storage / OCR         [Future]
        └── Notifications                 [Future]
```

The words **Accounts, Budgets, and Reports** must not cause Codex to accidentally expand the MVP defined in Artifact 01.

In MVP:

- user accounts/authentication are included;
- financial wallet/account tracking is excluded;
- budgets are excluded;
- advanced reports are excluded.

---

# 3. ARCHITECTURAL DECISION SUMMARY

| Area | Decision |
|---|---|
| Client | Flutter |
| Supported client targets | Android, iOS, Web, Windows, macOS, Linux |
| Client architecture | Feature-first MVVM-style layered architecture |
| State management | Riverpod |
| Navigation | go_router |
| API communication | REST over HTTPS |
| Backend | Python + FastAPI |
| Backend architecture | Modular monolith |
| API versioning | `/api/v1` |
| Validation / serialization | Pydantic v2 |
| ORM | SQLAlchemy 2.x |
| PostgreSQL driver | asyncpg through SQLAlchemy async |
| Database migrations | Alembic |
| Database | Supabase managed PostgreSQL |
| Primary keys | UUID |
| Money storage | Integer minor units using `BIGINT` |
| Currency | One ISO-style currency code per Tracker |
| Timestamps | UTC `timestamptz` |
| Authentication | Supabase Auth-issued JWT verified by FastAPI |
| Password handling | Supabase Auth only; API stores no passwords |
| Authorization | Tracker membership RBAC enforced server-side |
| API documentation | FastAPI OpenAPI / Swagger |
| Package management — backend | `uv` + `pyproject.toml` + lockfile |
| Unit/integration tests — backend | pytest |
| Formatting/lint — backend | Ruff |
| Client tests | Flutter unit/widget/integration tests |
| Deployment unit | Docker container for API |
| Initial database hosting | Supabase Postgres |
| Push notifications | Firebase Cloud Messaging; delivery only |
| File storage | Not needed for core MVP |
| Realtime | REST is authoritative; optional event stream later |
| Architecture scaling strategy | Modular monolith first; extract services only when justified |

---

# 4. BASELINE VERSIONS

The repository must pin known-good versions instead of depending on floating “latest” releases.

Recommended baseline at project initialization:

## Flutter

- Flutter stable `3.44.x` line.
- Use the stable channel.
- Pin the exact SDK version used by the repository.

## Dart

Use the Dart SDK bundled with the selected Flutter stable release.

Do not independently force an incompatible Dart version.

## Python

- Python `3.14.x`.

Pin the project to one supported minor line.

## FastAPI

- FastAPI `0.139.x`.
- Pin the exact working patch version.

FastAPI is still in a `0.x` version series, therefore dependency upgrades must be deliberate and tested.

## SQLAlchemy

- SQLAlchemy `2.0.x`.

Use modern SQLAlchemy 2.x patterns only.

## Alembic

- Alembic `1.18.x`.

## PostgreSQL

- PostgreSQL `18.x`.

Do not start the production project on a beta PostgreSQL major release.

## Version Policy

Patch updates may be accepted after automated tests pass.

Minor/major dependency upgrades require:

1. changelog review;
2. local validation;
3. automated test pass;
4. migration review if applicable.

---

# 5. HIGH-LEVEL SYSTEM ARCHITECTURE

```text
┌────────────────────────────────────────────┐
│                 FLUTTER                    │
│                                            │
│ Android │ iOS │ Web │ Windows │ macOS │ Linux
│                                            │
│ Presentation / Views                       │
│ ViewModels / Riverpod                      │
│ Repositories                               │
│ REST Services                              │
│ Auth Session                               │
└────────────────────┬───────────────────────┘
                     │
                     │ HTTPS / JSON
                     │ Authorization: Bearer
                     ▼
┌────────────────────────────────────────────┐
│             FASTAPI REST API               │
│                                            │
│ /api/v1                                    │
│                                            │
│ Auth                                       │
│ Users                                      │
│ Trackers                                   │
│ Members / Invitations                      │
│ Expenses / Splits                          │
│ Balances                                   │
│ Settlements                                │
│ Collaboration                              │
│ Activity / Audit                           │
│                                            │
│ Application Services                       │
│ Domain Rules                               │
│ Repositories                               │
└────────────────────┬───────────────────────┘
                     │
                     │ SQLAlchemy
                     ▼
┌────────────────────────────────────────────┐
│              POSTGRESQL                    │
│                                            │
│ Users                                      │
│ Trackers                                   │
│ Tracker Members                            │
│ Invitations                                │
│ Categories                                 │
│ Expenses                                   │
│ Expense Splits                             │
│ Settlements                                │
│ Comments                                   │
│ Activity Logs                              │
│ Refresh Sessions                           │
│ Idempotency Records                        │
└────────────────────────────────────────────┘
```

---

# 6. ARCHITECTURE STYLE — MODULAR MONOLITH

The backend must begin as a **modular monolith**.

Do not create microservices for MVP.

Reasons:

- transactions and settlements require strong database consistency;
- tracker permissions are shared across domains;
- a single deployment is simpler;
- a single PostgreSQL database preserves transaction boundaries;
- the expected MVP scale does not require service decomposition;
- Codex can reason about one well-structured repository more reliably than multiple distributed services.

A modular monolith means:

- one FastAPI application;
- one database;
- clearly separated domain modules;
- no cross-module spaghetti dependencies;
- services communicate through defined application/domain interfaces;
- modules can be extracted later if actual scale demands it.

---

# 7. REPOSITORY STRUCTURE

Recommended monorepo:

```text
splitshare/
│
├── apps/
│   ├── client/
│   │   └── Flutter application
│   │
│   └── api/
│       └── FastAPI application
│
├── docs/
│   ├── ARTIFACT_01_PRODUCT_FOUNDATION.md
│   ├── ARTIFACT_02_TECHNICAL_ARCHITECTURE.md
│   ├── API_CONTRACT.md
│   ├── DATABASE_SCHEMA.md
│   └── ADR/
│
├── infra/
│   ├── docker/
│   ├── compose/
│   └── deployment/
│
├── .github/
│   └── workflows/
│
├── .editorconfig
├── .gitignore
└── README.md
```

The product artifacts must live in the repository and be version-controlled.

Codex must read Artifact 01 and Artifact 02 before large implementation tasks.

---

# 8. FLUTTER CLIENT ARCHITECTURE

Flutter must use a **feature-first structure with clear presentation and data boundaries**.

Recommended structure:

```text
apps/client/lib/
│
├── app/
│   ├── app.dart
│   ├── router.dart
│   ├── theme/
│   └── bootstrap/
│
├── core/
│   ├── api/
│   ├── auth/
│   ├── errors/
│   ├── money/
│   ├── models/
│   ├── storage/
│   ├── widgets/
│   └── utils/
│
├── features/
│   ├── auth/
│   │   ├── data/
│   │   ├── presentation/
│   │   └── domain/
│   │
│   ├── home/
│   ├── trackers/
│   ├── members/
│   ├── expenses/
│   ├── balances/
│   ├── settlements/
│   ├── activity/
│   └── profile/
│
└── main.dart
```

Do not create one giant:

```text
screens/
models/
services/
```

directory containing unrelated features.

Feature ownership should remain obvious.

---

# 9. FLUTTER LAYER RESPONSIBILITIES

## 9.1 View

Responsible for:

- layout;
- rendering;
- user interaction;
- navigation triggers;
- basic UI-only conditional display.

Views must not contain:

- HTTP calls;
- SQL concepts;
- balance algorithms;
- authentication token logic;
- permission truth;
- complex financial calculations.

## 9.2 ViewModel / Riverpod Notifier

Responsible for:

- screen state;
- loading/error/success state;
- invoking repositories;
- reacting to mutations;
- coordinating UI actions;
- refreshing relevant providers after successful writes.

## 9.3 Repository

Responsible for:

- exposing feature-specific data operations;
- translating API DTOs to app/domain models;
- isolating transport details from presentation logic.

Example:

```text
ExpenseRepository
    ├── createExpense()
    ├── getExpense()
    ├── updateExpense()
    └── deleteExpense()
```

## 9.4 API Service

Responsible for:

- REST calls;
- request headers;
- auth token injection;
- JSON encoding/decoding;
- error mapping;
- request IDs;
- idempotency headers when needed.

---

# 10. FLUTTER STATE MANAGEMENT

Use **Riverpod**.

Recommended principles:

- providers belong close to the feature that owns them;
- avoid global mutable singleton state;
- async requests should expose explicit loading/error/data states;
- mutations should invalidate only affected state;
- auth state is global;
- tracker-specific data must be keyed by tracker ID;
- expense-specific data must be keyed by expense ID.

Examples conceptually:

```text
authSessionProvider

trackerListProvider

trackerDetailProvider(trackerId)

trackerMembersProvider(trackerId)

trackerBalancesProvider(trackerId)

expenseDetailProvider(expenseId)

trackerActivityProvider(trackerId)
```

Do not calculate authoritative balances inside Riverpod.

The API is the source of truth for financial state.

Client-side previews of equal splits are allowed for UX, but the server must recalculate and validate the final financial result.

---

# 11. FLUTTER NAVIGATION

Use `go_router`.

Canonical routes should align with product terminology.

Example:

```text
/
 /welcome
 /login
 /register

/home
/trackers
/trackers/new

/trackers/:trackerId
/trackers/:trackerId/expenses/new
/trackers/:trackerId/expenses/:expenseId
/trackers/:trackerId/balances
/trackers/:trackerId/settle
/trackers/:trackerId/members
/trackers/:trackerId/invite
/trackers/:trackerId/activity
/trackers/:trackerId/settings

/activity
/profile
```

Route guards should:

- redirect unauthenticated users to login;
- avoid pretending UI guards provide security;
- rely on API authorization for actual access enforcement.

Web deep links must remain functional.

---

# 12. FLUTTER HTTP CLIENT

Use one shared application HTTP abstraction.

A single `ApiClient` should handle:

- base URL;
- JSON headers;
- bearer access token;
- token refresh coordination;
- request correlation ID;
- timeout;
- consistent error parsing;
- idempotency keys for sensitive create operations.

Implementation may use Dart's multi-platform `http` package or an equivalent deliberately approved client.

Do not scatter raw HTTP calls across widgets.

---

# 13. CLIENT AUTH SESSION RULES

## Native / Desktop

Access/refresh credentials must use platform-appropriate secure storage.

Do not store passwords.

## Web

Preferred security model:

- access token kept in application memory;
- refresh session stored with an `HttpOnly`, `Secure` cookie;
- do not store long-lived refresh credentials in browser local storage.

## Session UX

If access token expires:

1. client attempts refresh once;
2. concurrent requests wait on the same refresh operation;
3. if refresh succeeds, retry eligible request;
4. if refresh fails, clear session;
5. redirect to login.

Do not create token-refresh loops.

---

# 14. BACKEND PROJECT STRUCTURE

Recommended:

```text
apps/api/
│
├── pyproject.toml
├── uv.lock
├── alembic.ini
├── migrations/
│
├── src/
│   └── splitshare/
│       ├── main.py
│       ├── config.py
│       │
│       ├── api/
│       │   ├── dependencies.py
│       │   ├── errors.py
│       │   └── v1/
│       │       ├── router.py
│       │       ├── auth.py
│       │       ├── users.py
│       │       ├── trackers.py
│       │       ├── members.py
│       │       ├── invitations.py
│       │       ├── expenses.py
│       │       ├── balances.py
│       │       ├── settlements.py
│       │       └── activity.py
│       │
│       ├── auth/
│       ├── users/
│       ├── trackers/
│       ├── members/
│       ├── expenses/
│       ├── balances/
│       ├── settlements/
│       ├── collaboration/
│       ├── audit/
│       │
│       ├── db/
│       │   ├── base.py
│       │   ├── session.py
│       │   └── models/
│       │
│       ├── schemas/
│       ├── security/
│       └── common/
│
└── tests/
    ├── unit/
    ├── integration/
    └── api/
```

---

# 15. FASTAPI RESPONSIBILITIES

FastAPI is responsible for:

- request validation;
- authentication;
- authorization;
- REST routing;
- OpenAPI contract;
- transaction boundaries;
- financial business-rule enforcement;
- persistence orchestration;
- error responses;
- audit creation;
- concurrency checks;
- idempotency;
- response serialization.

The Flutter app must never be trusted to enforce business rules on behalf of the backend.

---

# 16. API STYLE

Base:

```text
/api/v1
```

Use resource-oriented REST endpoints.

Examples:

```text
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
GET    /api/v1/users/me

GET    /api/v1/trackers
POST   /api/v1/trackers
GET    /api/v1/trackers/{tracker_id}
PATCH  /api/v1/trackers/{tracker_id}
DELETE /api/v1/trackers/{tracker_id}

GET    /api/v1/trackers/{tracker_id}/members
POST   /api/v1/trackers/{tracker_id}/invitations
PATCH  /api/v1/trackers/{tracker_id}/members/{user_id}
DELETE /api/v1/trackers/{tracker_id}/members/{user_id}

GET    /api/v1/invitations
POST   /api/v1/invitations/{invitation_id}/accept
POST   /api/v1/invitations/{invitation_id}/decline

GET    /api/v1/trackers/{tracker_id}/expenses
POST   /api/v1/trackers/{tracker_id}/expenses
GET    /api/v1/trackers/{tracker_id}/expenses/{expense_id}
PATCH  /api/v1/trackers/{tracker_id}/expenses/{expense_id}
DELETE /api/v1/trackers/{tracker_id}/expenses/{expense_id}

GET    /api/v1/trackers/{tracker_id}/balances
GET    /api/v1/trackers/{tracker_id}/balances/me

GET    /api/v1/trackers/{tracker_id}/settlements
POST   /api/v1/trackers/{tracker_id}/settlements
PATCH  /api/v1/trackers/{tracker_id}/settlements/{settlement_id}
DELETE /api/v1/trackers/{tracker_id}/settlements/{settlement_id}

GET    /api/v1/trackers/{tracker_id}/activity
GET    /api/v1/activity
```

Optional comments:

```text
GET  /api/v1/trackers/{tracker_id}/expenses/{expense_id}/comments
POST /api/v1/trackers/{tracker_id}/expenses/{expense_id}/comments
```

---

# 17. API RESPONSE CONVENTIONS

Prefer predictable JSON.

Successful single-resource response:

```json
{
  "data": {
    "id": "uuid",
    "name": "Trip to Italy"
  }
}
```

Successful collection:

```json
{
  "data": [],
  "meta": {
    "next_cursor": null
  }
}
```

Error:

```json
{
  "error": {
    "code": "STALE_EXPENSE_VERSION",
    "message": "This expense was changed by another member.",
    "details": {}
  },
  "request_id": "uuid"
}
```

Do not make clients depend on human-readable strings to identify error types.

Use stable machine-readable error codes.

---

# 18. HTTP STATUS CONVENTIONS

Use semantics consistently.

```text
200 OK
201 Created
204 No Content

400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Validation Error
429 Too Many Requests

500 Internal Server Error
```

Examples:

- invalid credentials → `401`;
- authenticated Viewer attempts add expense → `403`;
- expense does not exist → `404`;
- stale version / duplicate conflict → `409`;
- malformed validatable input → `422`.

Avoid returning HTTP `200` with `"success": false`.

---

# 19. AUTHENTICATION DESIGN

## 19.1 Password Authentication

MVP supports email/password registration and login.

Passwords:

- never stored in plaintext;
- hashed with Argon2;
- verified server-side.

## 19.2 Access Token

Use signed JWT access tokens.

Recommended short lifetime:

```text
10–20 minutes
```

Suggested default:

```text
15 minutes
```

JWT should contain minimal identity information.

Example claims:

```json
{
  "sub": "user-uuid",
  "type": "access",
  "iat": 0,
  "exp": 0,
  "jti": "token-uuid"
}
```

Do **not** put tracker role membership into long-lived JWT claims.

Why:

Tracker roles can change while a token remains valid.

Authorization must query current membership state.

## 19.3 Refresh Session

Use a longer-lived refresh session.

Recommended conceptual lifetime:

```text
30 days
```

Refresh tokens/sessions should be revocable.

Database should hold a safe representation of refresh session state, not reusable plaintext credentials.

Recommended capabilities:

- logout current session;
- logout all sessions later;
- revoke compromised sessions;
- rotate refresh token on refresh.

---

# 20. AUTHORIZATION / RBAC

RBAC must be enforced by FastAPI dependencies and application services.

Canonical roles:

```text
owner
editor
commenter
viewer
```

Never trust a role sent by the Flutter client.

Example conceptual dependencies:

```text
get_current_user()

require_tracker_member(tracker_id)

require_tracker_roles(
    tracker_id,
    allowed={"owner", "editor"}
)

require_tracker_owner(tracker_id)
```

Permission rules must match Artifact 01 exactly.

A route being hidden in Flutter does not mean access is secure.

Every sensitive backend route must authorize independently.

---

# 21. DATABASE ACCESS

Use:

- SQLAlchemy 2.x;
- async engine;
- asyncpg-compatible PostgreSQL connection;
- one AsyncSession per request/application transaction;
- Alembic migrations.

Do not share one `AsyncSession` between concurrent tasks.

Repository/service code must receive session dependencies through clear interfaces.

---

# 22. POSTGRESQL SCHEMA PRINCIPLES

Use:

- UUID primary keys;
- foreign keys;
- unique constraints;
- check constraints;
- indexes based on query paths;
- UTC timestamps;
- explicit soft-delete columns where required;
- database transactions for multi-record financial writes.

Do not rely exclusively on application code for data integrity.

Important invariants should be protected by both:

1. application rules;
2. database constraints where feasible.

---

# 23. MONEY REPRESENTATION — REQUIRED

This project must **not** use `float`, `double`, JavaScript number math, or Python binary floating point as the financial source of truth.

Use **integer minor units**.

Example:

```text
₱1,250.50
```

stored as:

```text
125050
```

if the currency exponent is 2.

Database:

```text
amount_minor BIGINT NOT NULL
```

Tracker:

```text
currency_code VARCHAR(...)
currency_exponent SMALLINT
```

Examples:

```text
PHP → exponent 2
USD → exponent 2
JPY → exponent 0
```

API financial fields should use integer minor-unit values.

Example:

```json
{
  "amount_minor": 125050,
  "currency": "PHP"
}
```

The client may format:

```text
₱1,250.50
```

for display.

This avoids precision errors across Python, JSON, Dart, and PostgreSQL.

---

# 24. SPLIT ALGORITHM

The backend is authoritative.

Input:

```text
amount_minor = 100000
participants = [A, B, C]
```

For 3 participants:

```text
base = 100000 // 3
     = 33333

remainder = 100000 % 3
          = 1
```

Result:

```text
A = 33334
B = 33333
C = 33333
```

Invariant:

```text
33334 + 33333 + 33333 = 100000
```

Remainder distribution must be deterministic.

Use the stable ordering defined by the submitted participant list.

The backend must reject any state where:

```text
sum(split.amount_minor) != expense.amount_minor
```

---

# 25. CORE DATABASE MODEL

Recommended MVP tables:

```text
users
refresh_sessions

trackers
tracker_members
tracker_invitations

categories

expenses
expense_splits

settlements

comments                  [Optional MVP 1.1]
activity_logs

idempotency_keys
```

Future:

```text
budgets
budget_periods
financial_accounts
account_transactions
report_exports
attachments
notifications
```

Future tables must not be created merely because they are listed here unless their feature is being implemented.

---

# 26. USERS TABLE

Conceptual schema:

```text
users
-----
id UUID PK
email VARCHAR UNIQUE NOT NULL
name VARCHAR NOT NULL
password_hash VARCHAR NOT NULL
avatar_url VARCHAR NULL
status VARCHAR NOT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
deleted_at TIMESTAMPTZ NULL
```

Normalize email for uniqueness.

Do not expose password hash in API schemas.

---

# 27. TRACKERS TABLE

```text
trackers
--------
id UUID PK
name VARCHAR NOT NULL
description TEXT NULL
currency_code VARCHAR NOT NULL
currency_exponent SMALLINT NOT NULL
owner_user_id UUID NOT NULL FK users
version INTEGER NOT NULL DEFAULT 1
created_by UUID NOT NULL FK users
updated_by UUID NULL FK users
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
deleted_at TIMESTAMPTZ NULL
```

`owner_user_id` must agree with the membership owner role.

Ownership transfer must update owner representation atomically.

---

# 28. TRACKER MEMBERS TABLE

```text
tracker_members
---------------
id UUID PK
tracker_id UUID NOT NULL FK trackers
user_id UUID NOT NULL FK users
role VARCHAR NOT NULL
status VARCHAR NOT NULL
joined_at TIMESTAMPTZ NOT NULL
removed_at TIMESTAMPTZ NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

Constraint concept:

```text
UNIQUE active membership per (tracker_id, user_id)
```

Roles:

```text
owner
editor
commenter
viewer
```

Do not hard-delete historical membership merely because a member is removed.

---

# 29. TRACKER INVITATIONS TABLE

```text
tracker_invitations
-------------------
id UUID PK
tracker_id UUID NOT NULL FK trackers
email VARCHAR NOT NULL
role VARCHAR NOT NULL
status VARCHAR NOT NULL
token_hash VARCHAR NOT NULL
invited_by UUID NOT NULL FK users
expires_at TIMESTAMPTZ NOT NULL
accepted_by UUID NULL FK users
accepted_at TIMESTAMPTZ NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

Statuses:

```text
pending
accepted
declined
revoked
expired
```

Do not store reusable plaintext invitation secrets if a public token is used.

---

# 30. CATEGORIES TABLE

Recommended categories may initially be system-defined.

```text
categories
----------
id UUID PK
tracker_id UUID NULL
name VARCHAR NOT NULL
icon_key VARCHAR NULL
is_system BOOLEAN NOT NULL
created_by UUID NULL
created_at TIMESTAMPTZ NOT NULL
```

`tracker_id = NULL` may represent global defaults if this design is chosen.

MVP can ship with a fixed set of common categories and avoid category-management UI.

---

# 31. EXPENSES TABLE

```text
expenses
--------
id UUID PK
tracker_id UUID NOT NULL FK trackers
description VARCHAR NOT NULL
amount_minor BIGINT NOT NULL
category_id UUID NULL FK categories
paid_by_user_id UUID NOT NULL FK users
expense_date DATE NOT NULL
note TEXT NULL
version INTEGER NOT NULL DEFAULT 1
created_by UUID NOT NULL FK users
updated_by UUID NULL FK users
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
deleted_at TIMESTAMPTZ NULL
```

Check:

```text
amount_minor > 0
```

The payer must be valid according to product rules at creation time.

---

# 32. EXPENSE SPLITS TABLE

```text
expense_splits
--------------
id UUID PK
expense_id UUID NOT NULL FK expenses
user_id UUID NOT NULL FK users
amount_minor BIGINT NOT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

Constraint:

```text
UNIQUE (expense_id, user_id)
```

Check:

```text
amount_minor >= 0
```

For MVP, active participants should receive positive shares.

The payer may have no split row when excluded.

---

# 33. SETTLEMENTS TABLE

```text
settlements
-----------
id UUID PK
tracker_id UUID NOT NULL FK trackers
from_user_id UUID NOT NULL FK users
to_user_id UUID NOT NULL FK users
amount_minor BIGINT NOT NULL
settlement_date DATE NOT NULL
payment_method VARCHAR NULL
note TEXT NULL
version INTEGER NOT NULL DEFAULT 1
created_by UUID NOT NULL FK users
updated_by UUID NULL FK users
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
deleted_at TIMESTAMPTZ NULL
```

Checks:

```text
amount_minor > 0
from_user_id != to_user_id
```

Server must validate that the settlement does not exceed the current direct outstanding obligation in MVP.

---

# 34. COMMENTS TABLE — OPTIONAL

```text
comments
--------
id UUID PK
tracker_id UUID NOT NULL
expense_id UUID NOT NULL
user_id UUID NOT NULL
content TEXT NOT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
deleted_at TIMESTAMPTZ NULL
```

Comments never affect balances.

---

# 35. ACTIVITY LOGS TABLE

```text
activity_logs
-------------
id UUID PK
tracker_id UUID NULL
actor_user_id UUID NULL
action VARCHAR NOT NULL
subject_type VARCHAR NOT NULL
subject_id UUID NULL
metadata JSONB NOT NULL DEFAULT '{}'
created_at TIMESTAMPTZ NOT NULL
```

Examples:

```text
expense.created
expense.updated
expense.deleted

settlement.created
settlement.updated
settlement.deleted

member.invited
member.joined
member.role_changed
member.removed

tracker.created
tracker.updated
tracker.ownership_transferred
```

`metadata` may contain snapshots such as:

```json
{
  "description": "Hotel",
  "old_amount_minor": 300000,
  "new_amount_minor": 320000
}
```

Do not use activity logs as the source of financial calculations.

---

# 36. IDEMPOTENCY TABLE

Sensitive POST operations require idempotency support.

Primary use:

- create expense;
- create settlement;
- create tracker;
- send invitation where duplicate submission would be harmful.

Conceptual table:

```text
idempotency_keys
----------------
id UUID PK
user_id UUID NOT NULL
key VARCHAR NOT NULL
request_hash VARCHAR NOT NULL
resource_type VARCHAR NULL
resource_id UUID NULL
response_status INTEGER NULL
response_body JSONB NULL
created_at TIMESTAMPTZ NOT NULL
expires_at TIMESTAMPTZ NOT NULL
```

Unique:

```text
(user_id, key)
```

Client sends:

```text
Idempotency-Key: <uuid>
```

If the same key and same request are retried:

- return the original result.

If the same key is reused with different payload:

- reject.

This protects against double taps and network retries.

---

# 37. BALANCE ENGINE

Balances must not be maintained by arbitrary mutation of a `balance` column.

Authoritative balance comes from:

```text
active expenses
+ active expense splits
+ active settlements
```

Conceptual user balance:

```text
expense_paid_total
- expense_share_total
+ settlement_sent_total
- settlement_received_total
```

The backend must own this calculation.

## Performance Strategy

MVP:

- calculate using indexed SQL queries / aggregates;
- optimize only when profiling proves necessary.

Future:

- materialized summaries or cached balance projections may be introduced;
- any cache must be reconstructable from authoritative history.

Never let a cache become the only financial truth.

---

# 38. PAIRWISE DEBT CALCULATION

The system must preserve direct member relationships.

A simple approach is to derive direct obligations from individual expense effects and settlements.

Do not automatically route:

```text
A → B
B → C
```

into:

```text
A → C
```

during MVP.

If debt simplification is later implemented, it must be a separate explicit feature with dedicated tests.

---

# 39. DATABASE TRANSACTIONS

The following operations must execute atomically.

## Create Expense

One database transaction must cover:

1. validate membership/permission;
2. insert expense;
3. insert all splits;
4. verify split total;
5. insert activity;
6. commit.

Failure at any step:

> rollback everything.

## Edit Expense

One transaction:

1. lock/check current version;
2. validate permission;
3. update expense;
4. replace/update splits;
5. verify totals;
6. add activity;
7. increment version;
8. commit.

## Delete Expense

One transaction:

1. validate;
2. mark deleted;
3. add activity;
4. commit.

## Settlement

One transaction:

1. validate permission;
2. calculate current pairwise obligation;
3. validate requested amount;
4. create settlement;
5. create activity;
6. commit.

## Ownership Transfer

One transaction:

1. validate current owner;
2. validate target member;
3. update roles;
4. update tracker owner;
5. add activity;
6. commit.

There must never be a moment where a partially completed financial operation becomes committed.

---

# 40. CONCURRENCY CONTROL

The product includes multiple Editors, therefore stale writes are expected.

Use **optimistic concurrency control** for mutable financial resources.

Mutable records should contain:

```text
version INTEGER
```

When Flutter loads expense:

```json
{
  "id": "...",
  "version": 4
}
```

Update request includes expected version:

```json
{
  "version": 4,
  "amount_minor": 320000
}
```

Backend updates only if current version is still 4.

If another user already updated it to 5:

```text
409 Conflict
STALE_EXPENSE_VERSION
```

Client must:

1. notify user that record changed;
2. load current record;
3. allow user to review/retry.

Never silently last-write-wins financial edits.

---

# 41. SETTLEMENT REVALIDATION

The Settle Up UI may become stale.

Example:

1. Client loads `Mars owes Joseph ₱500`.
2. Another user edits an expense.
3. Actual debt becomes ₱400.
4. First client tries to submit ₱500.

Backend must recalculate obligation **inside the settlement transaction**.

Do not trust the client-displayed balance.

Return:

```text
409 Conflict
OUTSTANDING_BALANCE_CHANGED
```

with current safe context.

---

# 42. SOFT DELETE STRATEGY

Use `deleted_at` for financial records requiring audit continuity.

Queries must deliberately distinguish:

```text
active records
historical/deleted records
```

Avoid a generic repository implementation that accidentally includes deleted expenses in balance calculations.

Core balance queries must explicitly require:

```text
deleted_at IS NULL
```

for expenses and settlements.

---

# 43. TIME STANDARD

Store event timestamps as UTC-aware PostgreSQL timestamps:

```text
TIMESTAMPTZ
```

Server generates authoritative:

- `created_at`;
- `updated_at`.

Expense business date is separate:

```text
expense_date DATE
```

Settlement business date:

```text
settlement_date DATE
```

Flutter localizes timestamp presentation.

Never rewrite historical timestamps according to the viewer's time zone.

---

# 44. VALIDATION RESPONSIBILITIES

Validation exists at multiple layers.

## Flutter

For fast UX:

- required fields;
- obvious amount format;
- empty participant warning.

## FastAPI / Pydantic

Authoritative request validation:

- types;
- required fields;
- enum values;
- sizes;
- allowed formats.

## Application Service

Business validation:

- permissions;
- member status;
- payer validity;
- split validity;
- settlement amount;
- ownership rules;
- tracker state.

## PostgreSQL

Data integrity:

- foreign keys;
- unique constraints;
- checks;
- transaction atomicity.

Never rely on only one layer.

---

# 45. ERROR MODEL

Create domain-specific exceptions.

Examples:

```text
TrackerNotFound
NotTrackerMember
InsufficientTrackerPermission
LastOwnerViolation
InvalidExpenseAmount
NoSplitParticipants
SplitTotalMismatch
StaleExpenseVersion
OutstandingBalanceChanged
SettlementExceedsOutstanding
DuplicateMembership
InvitationAlreadyPending
InvitationExpired
```

API layer maps them to stable error codes.

Business services should not throw arbitrary HTTP exceptions everywhere.

Keep domain logic decoupled from HTTP where practical.

---

# 46. SECURITY RULES

Minimum requirements:

- HTTPS only outside local development;
- password hashing with Argon2;
- short-lived access JWT;
- revocable refresh sessions;
- no plaintext password logging;
- no token logging;
- backend RBAC;
- rate limiting for auth-sensitive endpoints;
- CORS allowlist;
- request size limits;
- structured validation;
- secrets only through environment/secret management;
- production database not publicly open;
- least-privilege database user;
- security headers for web deployment;
- sanitized user-generated content display;
- audit important financial changes.

Do not place production secrets in:

```text
.env committed to git
source code
Flutter assets
client configuration
```

Anything shipped in Flutter should be considered publicly inspectable.

---

# 47. CORS

Development may allow known local origins.

Production must explicitly allow deployed web origins.

Do not use:

```text
allow_origins=["*"]
```

with credentialed production web authentication.

Allowed origins should come from environment configuration.

---

# 48. RATE LIMITING

At minimum protect:

- login;
- registration;
- password-related endpoints;
- invitation sending;
- refresh endpoints.

General API rate limiting may be added as infrastructure matures.

Do not implement financial correctness based on rate limiting.

It is abuse protection, not a transaction safety mechanism.

---

# 49. API PAGINATION

Use cursor pagination for feeds/lists that can grow substantially.

Recommended for:

- expenses;
- activity;
- global activity.

Example:

```text
GET /expenses?limit=50&cursor=...
```

Response:

```json
{
  "data": [],
  "meta": {
    "next_cursor": "..."
  }
}
```

Member lists may initially return all members for small trackers.

---

# 50. SEARCH AND FILTERS

MVP may support basic filters incrementally.

Expense query candidates:

```text
date_from
date_to
category_id
paid_by_user_id
```

Activity candidates:

```text
action
date_from
date_to
```

Do not introduce complex search infrastructure prematurely.

PostgreSQL is sufficient for MVP filtering.

---

# 51. REAL-TIME / NEAR-REAL-TIME STRATEGY

The authoritative interface remains REST.

MVP synchronization behavior:

1. refresh tracker after successful mutation;
2. refresh when app/screen resumes;
3. support pull-to-refresh;
4. optionally refresh active collaborative screens on a reasonable interval if needed.

Phase 1.1 may add:

- Server-Sent Events; or
- WebSockets.

Events should notify the client that data changed.

Example:

```json
{
  "event": "expense.updated",
  "tracker_id": "...",
  "resource_id": "...",
  "version": 5
}
```

Client then invalidates/refetches relevant REST state.

Do not send a separate competing financial truth through the event channel.

REST/database remains canonical.

---

# 52. FUTURE BACKGROUND JOBS

Core MVP does not require a complex job queue.

Future features such as:

- email invitation delivery;
- reminders;
- report exports;
- receipt OCR;
- notifications;

may require background workers.

Do not add Redis/Celery merely for architectural decoration.

Introduce queue infrastructure only when asynchronous jobs exist.

For small initial email workflows, simple application background execution may be acceptable if reliability requirements are understood.

Production-critical jobs should eventually use a durable queue.

---

# 53. FILE STORAGE

Core MVP does not require receipt files.

When receipt attachment is promoted into scope:

- do not store large binary images directly in PostgreSQL;
- use object storage;
- database stores attachment metadata and object key;
- use signed/private access where appropriate.

OCR remains a separate future service/process.

---

# 54. REPORTS BOUNDARY

MVP balance screens are not “advanced reports.”

Allowed MVP read models:

- tracker totals;
- personal balance;
- member balance;
- expense list;
- activity list.

Future report module may include:

- category spending;
- time-period summaries;
- CSV/PDF export;
- contribution analysis.

Do not create a reporting warehouse for MVP.

---

# 55. BUDGETS BOUNDARY

Budget module is future scope.

Do not mix a budget record with an expense tracker balance.

A future budget requires explicit concepts such as:

```text
period
limit
category scope
spent
remaining
rollover
```

No budget table or navigation item should be added to MVP without requirement promotion.

---

# 56. FINANCIAL ACCOUNTS / WALLETS BOUNDARY

The term **Account** is overloaded.

MVP includes:

> User Account

MVP does **not** include:

> Cash Account / Bank Account / GCash Wallet / financial wallet balances.

Financial accounts require a separate accounting domain and must not be confused with tracker member balances.

Use naming such as:

```text
users
auth
profile
```

for user identity to reduce ambiguity.

---

# 57. LOGGING

Use structured application logs.

Each request should have:

```text
request_id
method
path
status
duration
authenticated_user_id when available
```

Never log:

- passwords;
- raw access tokens;
- raw refresh tokens;
- invitation secrets;
- sensitive headers.

Financial mutation logs should identify operation/resource IDs but not dump sensitive payloads indiscriminately.

---

# 58. OBSERVABILITY

MVP minimum:

- structured logs;
- API health endpoint;
- database connectivity health;
- error tracking;
- request latency visibility.

Recommended endpoints:

```text
GET /health/live
GET /health/ready
```

`live`:

- process running.

`ready`:

- application can serve traffic;
- required dependencies are available.

Detailed internal diagnostics should not be exposed publicly.

---

# 59. TESTING STRATEGY — BACKEND

Financial correctness requires strong tests.

## Unit Tests

Test pure/domain logic:

- equal split;
- rounding;
- member balance;
- pairwise debt;
- settlement;
- overpayment rejection;
- permission matrix;
- ownership rules.

## Integration Tests

Test with PostgreSQL:

- constraints;
- transaction rollback;
- migrations;
- queries;
- concurrency;
- soft deletion;
- balance aggregates.

## API Tests

Test:

- auth;
- status codes;
- RBAC;
- validation;
- idempotency;
- stale version conflict;
- invitation workflow;
- settlement workflow.

---

# 60. REQUIRED FINANCIAL TEST CASES

At minimum create automated tests for:

## Equal Division

```text
1000 / 3
→ 334, 333, 333
```

in the relevant minor-unit example.

## Payer Included

Payer is one participant.

## Payer Excluded

Payer has zero share.

## Single Participant

One member owes payer entire expense.

## Payer Only Participant

Net balance remains zero.

## Multiple Expenses

Aggregate balances net to zero.

## Full Settlement

Debt reaches zero.

## Partial Settlement

Debt decreases correctly.

## Overpayment

Rejected.

## Deleted Expense

No longer affects current balances.

## Edited Expense

Recalculates current balances.

## Settlement After Edit

Current obligation is respected.

## Rounding

All split rows sum exactly to expense total.

## Removed Member

Historical financial record remains valid.

---

# 61. PROPERTY / INVARIANT TESTS

Where practical, generate randomized valid expenses and verify:

```text
sum(splits) == expense amount
```

and:

```text
sum(all member tracker balances) == 0
```

for the closed shared-expense model.

After settlements:

```text
sum(all member balances) == 0
```

must remain true.

These invariants are extremely valuable against subtle financial bugs.

---

# 62. FLUTTER TESTING

## Unit

- amount string → minor units;
- minor units → display;
- view model state transitions;
- API error mapping.

## Widget

- permission-based controls;
- positive/negative/settled balance states;
- Add Expense form;
- Split Expense selection;
- stale conflict message.

## Integration

Critical path:

```text
Login
→ Create Tracker
→ Add Member
→ Add Expense
→ Split
→ View Balance
→ Settle
```

Run on at least one mobile target and web in CI/release validation where feasible.

---

# 63. API CONTRACT TESTING

FastAPI generates OpenAPI.

The OpenAPI document should be treated as a real contract.

Recommended workflow:

1. generate/export OpenAPI during CI;
2. detect accidental breaking API changes;
3. keep Flutter DTO expectations synchronized;
4. document intentional contract changes.

Do not silently rename fields consumed by released clients.

---

# 64. DATABASE MIGRATIONS

All schema changes go through Alembic.

Never make production schema changes manually without migration history.

Rules:

- one logical schema change per migration where practical;
- review autogenerated migrations;
- explicitly define constraints/indexes;
- test upgrade from previous revision;
- test fresh database creation;
- avoid destructive migrations without backup/migration plan.

Migration command behavior should be part of deployment.

---

# 65. DEVELOPMENT ENVIRONMENTS

Required:

```text
local
test
staging
production
```

Configuration comes from environment-specific settings.

Do not hardcode URLs or secrets.

Conceptual backend variables:

```text
APP_ENV
DATABASE_URL
JWT_SECRET / signing key configuration
ACCESS_TOKEN_TTL
REFRESH_TOKEN_TTL
CORS_ORIGINS
LOG_LEVEL
```

Conceptual Flutter compile/runtime config:

```text
API_BASE_URL
APP_ENV
```

No production credential should be bundled in client configuration.

---

# 66. LOCAL DEVELOPMENT

Recommended local stack:

```text
Flutter app
      │
      ▼
FastAPI local server
      │
      ▼
PostgreSQL Docker container
```

Use Docker Compose for infrastructure dependencies where helpful.

The developer should be able to bootstrap backend dependencies using a documented small command sequence.

Example concept:

```text
docker compose up -d db
uv sync
alembic upgrade head
fastapi dev
```

Flutter separately:

```text
flutter pub get
flutter run
```

Exact repository commands should be added to README after project bootstrap.

---

# 67. BACKEND DEPENDENCY MANAGEMENT

Use `uv`.

Repository should contain:

```text
pyproject.toml
uv.lock
```

Important dependencies conceptually:

```text
fastapi
uvicorn / fastapi standard server dependency
pydantic
pydantic-settings

sqlalchemy
asyncpg
alembic

pyjwt
pwdlib[argon2]

pytest
pytest-asyncio
httpx

ruff
```

Pin and lock dependencies.

Codex must not casually replace `uv` with Poetry, Pipenv, raw unpinned pip requirements, or another manager.

---

# 68. FLUTTER DEPENDENCY POLICY

Use packages only when they have a clear responsibility.

Approved baseline categories:

```text
flutter_riverpod
go_router
http client abstraction
secure storage solution
JSON/model generation if selected
internationalization / formatting support
```

Avoid dependency bloat.

Before introducing a new package, Codex should ask:

1. Is this functionality available reliably in Flutter/Dart?
2. Does the package materially simplify implementation?
3. Is it maintained?
4. Does it support mobile, web, and desktop targets required by the project?
5. Does it introduce platform limitations?

Cross-platform compatibility is mandatory.

---

# 69. CODE QUALITY — PYTHON

Use:

- type annotations;
- modern Python syntax;
- async only where I/O requires it;
- small cohesive services;
- explicit transactions;
- dependency injection through FastAPI/app layer;
- domain-specific errors;
- Ruff formatting/linting;
- test coverage for financial logic.

Avoid:

- god service classes;
- controllers containing SQL queries and financial math;
- duplicated permission checks;
- global mutable DB sessions;
- float money;
- silent exception swallowing.

---

# 70. CODE QUALITY — DART / FLUTTER

Use:

- immutable data models where practical;
- feature ownership;
- widgets focused on rendering;
- repositories for transport;
- Riverpod for application state;
- shared money parsing/formatting utility;
- clear async state;
- responsive layout.

Avoid:

- API calls directly in widgets;
- duplicated finance math;
- deeply nested callback state;
- platform-specific assumptions in shared domain code;
- storing backend permissions only in UI flags.

---

# 71. RESPONSIVE DESIGN

One Flutter codebase serves multiple layouts.

Breakpoints should support:

## Mobile

- bottom navigation;
- stacked cards;
- full-screen forms.

## Tablet / Desktop / Web

- wider content constraints;
- optional navigation rail/sidebar;
- multi-column layouts where useful;
- same product terminology and workflows.

Do not simply stretch the phone UI to desktop width.

Do not create separate business logic per platform.

---

# 72. ACCESSIBILITY

Minimum:

- semantic labels;
- usable keyboard navigation on web/desktop;
- visible focus states;
- adequate touch targets;
- scalable text;
- do not rely on green/red color alone for balances;
- pair financial color with labels/signs.

Examples:

```text
YOU ARE OWED +₱450
YOU OWE -₱450
SETTLED ₱0
```

---

# 73. DEPLOYMENT ARCHITECTURE — RECOMMENDED

Initial production:

```text
Flutter Mobile Apps
Flutter Web
Flutter Desktop Apps
        │
        ▼
HTTPS
        │
        ▼
Reverse Proxy / Managed Load Balancer
        │
        ▼
FastAPI Container(s)
        │
        ▼
Managed PostgreSQL
```

Optional later:

```text
Object Storage
Redis
Worker
Email Provider
Push Notification Provider
```

Do not add these before they solve a real feature requirement.

---

# 74. CONTAINERIZATION

Backend should ship as a Docker image.

Production image must:

- use a supported Python base;
- install locked dependencies;
- run as non-root where practical;
- expose only required service port;
- not contain development secrets;
- use health checks;
- produce deterministic builds.

Database runs separately from API in production.

Do not package PostgreSQL inside the API container.

---

# 75. FASTAPI PROCESS MODEL

Run the FastAPI application behind production-grade process/container orchestration.

The number of workers/replicas depends on deployed CPU/memory and measured load.

Do not hardcode an excessive worker count.

Database connection pool sizes must be coordinated with:

```text
replica count × worker count × pool size
```

to avoid exhausting PostgreSQL connections.

---

# 76. CI PIPELINE

Every pull request should run:

## Backend

```text
dependency sync
lint
format check
type/static checks if configured
unit tests
integration tests
migration validation
```

## Flutter

```text
flutter pub get
flutter analyze
flutter test
build validation for targeted platforms where feasible
```

## Shared

```text
secret scanning
dependency vulnerability checks
```

Merge must be blocked on critical failures.

---

# 77. CD PIPELINE

Recommended environment flow:

```text
feature branch
      ↓
pull request
      ↓
CI
      ↓
main
      ↓
staging deployment
      ↓
smoke tests
      ↓
production release
```

Production database migration:

1. backup/safety check;
2. apply migration;
3. deploy compatible application;
4. health checks;
5. rollback strategy.

Destructive schema changes require special care.

---

# 78. DATABASE BACKUP

Production PostgreSQL must have automated backups.

Minimum expectations:

- scheduled backups;
- retention policy;
- restore procedure;
- restore test.

A backup that has never been tested for restore is not sufficient operational confidence.

Point-in-time recovery is preferred when supported by the hosting environment.

---

# 79. DATA RETENTION

MVP financial history should be preserved.

Soft-deleted financial records may remain for audit.

User/account deletion policy must be explicitly designed before public launch because financial history may reference a user.

Do not cascade-delete historical expenses merely because a user closes an account.

---

# 80. PRIVACY

Return only tracker data the authenticated user is authorized to see.

Do not expose:

- other users' password/security metadata;
- refresh session secrets;
- unrelated tracker memberships;
- internal audit metadata that reveals sensitive implementation details.

Audit logs exposed in product UI should use a public-safe activity DTO, not raw internal structures.

---

# 81. FUTURE NOTIFICATION ARCHITECTURE

When notifications become required:

Domain event examples:

```text
InvitationCreated
ExpenseCreated
ExpenseUpdated
SettlementRecorded
RoleChanged
```

A notification service/worker may consume those events.

Do not put email/push delivery logic directly inside core financial calculations.

Financial database commit must not depend on an external email provider being available.

---

# 82. FUTURE RECEIPT ARCHITECTURE

When receipt support is introduced:

```text
Flutter
   │
   ├── request upload permission/URL
   ▼
Object Storage
   │
   ▼
attachment metadata
   │
   ▼
PostgreSQL
```

Future OCR:

```text
Attachment
    ↓
Background Job
    ↓
OCR Provider / Model
    ↓
Suggested fields
    ↓
User verifies
```

OCR must never silently create authoritative financial values without user review.

---

# 83. FUTURE REAL-TIME ARCHITECTURE

If collaboration demands live updates:

```text
REST mutation
    ↓
Database commit
    ↓
Domain/event notification
    ↓
SSE or WebSocket
    ↓
Flutter invalidates affected provider
    ↓
Flutter refetches REST resource
```

This preserves one source of truth.

Do not maintain independent REST and socket data models.

---

# 84. PERFORMANCE EXPECTATIONS

Optimize correctness first.

Required indexes should cover common access patterns such as:

```text
tracker_members(tracker_id, user_id)

expenses(tracker_id, expense_date)
expenses(tracker_id, deleted_at)

expense_splits(expense_id)
expense_splits(user_id)

settlements(tracker_id, from_user_id, to_user_id)
settlements(tracker_id, deleted_at)

activity_logs(tracker_id, created_at)

tracker_invitations(email, status)
```

Use query profiling before adding caches.

Avoid N+1 ORM queries.

---

# 85. API DATA TRANSFER OBJECTS

Do not expose ORM models directly as API models.

Separate:

```text
database models
domain/application objects
request schemas
response schemas
```

Example:

```text
ExpenseCreateRequest
ExpenseUpdateRequest
ExpenseResponse
ExpenseListItemResponse
```

This prevents database schema changes from automatically breaking API clients.

---

# 86. EXAMPLE CREATE EXPENSE CONTRACT

Request:

```json
{
  "description": "Dinner at Lucca's",
  "amount_minor": 150000,
  "category_id": "uuid",
  "paid_by_user_id": "uuid",
  "expense_date": "2026-08-11",
  "participant_user_ids": [
    "uuid-a",
    "uuid-b",
    "uuid-c"
  ],
  "note": null
}
```

Headers:

```text
Authorization: Bearer <access-token>
Idempotency-Key: <uuid>
```

Backend:

1. authenticate;
2. authorize Owner/Editor;
3. verify payer/member state;
4. verify participants;
5. calculate equal split;
6. persist expense/splits transactionally;
7. add activity;
8. return authoritative result.

Response:

```json
{
  "data": {
    "id": "expense-uuid",
    "tracker_id": "tracker-uuid",
    "description": "Dinner at Lucca's",
    "amount_minor": 150000,
    "currency": "PHP",
    "paid_by_user_id": "uuid",
    "version": 1,
    "splits": [
      {
        "user_id": "uuid-a",
        "amount_minor": 50000
      },
      {
        "user_id": "uuid-b",
        "amount_minor": 50000
      },
      {
        "user_id": "uuid-c",
        "amount_minor": 50000
      }
    ]
  }
}
```

Flutter must use the returned authoritative splits.

---

# 87. EXAMPLE SETTLEMENT CONTRACT

Request:

```json
{
  "from_user_id": "mars-uuid",
  "to_user_id": "joseph-uuid",
  "amount_minor": 50000,
  "settlement_date": "2026-08-11",
  "payment_method": "cash",
  "note": null
}
```

Backend:

1. authenticate;
2. authorize;
3. validate both members/history eligibility;
4. calculate direct outstanding debt;
5. ensure amount does not exceed debt;
6. persist;
7. activity log;
8. return updated obligation/balance snapshot.

Do not accept a client-provided “new balance” value.

---

# 88. EXAMPLE STALE UPDATE

Client loaded:

```json
{
  "expense_id": "uuid",
  "version": 3,
  "amount_minor": 300000
}
```

Another Editor changes amount.

Database now:

```text
version = 4
```

First client sends:

```json
{
  "version": 3,
  "amount_minor": 320000
}
```

Response:

```text
409 Conflict
```

```json
{
  "error": {
    "code": "STALE_EXPENSE_VERSION",
    "message": "This expense was changed by another member. Review the latest version before saving."
  }
}
```

Flutter refetches.

---

# 89. DEVELOPMENT PHASE ORDER

Codex should implement in this order.

## Phase 0 — Foundation

- repository;
- Flutter shell;
- FastAPI shell;
- PostgreSQL;
- SQLAlchemy;
- Alembic;
- environment config;
- CI foundation.

## Phase 1 — Authentication

- users;
- registration;
- login;
- access tokens;
- refresh sessions;
- Flutter auth state;
- guarded navigation.

## Phase 2 — Trackers & Membership

- tracker CRUD;
- owner membership;
- tracker list;
- tracker detail shell;
- invitations;
- roles;
- membership management.

## Phase 3 — Expenses

- categories;
- create expense;
- equal split engine;
- transaction list;
- expense detail;
- edit;
- soft delete;
- idempotency;
- optimistic versioning.

## Phase 4 — Balances

- user balance;
- member balances;
- pairwise obligation query;
- positive/negative/settled UI.

## Phase 5 — Settlements

- settle-up screen;
- partial settlement;
- overpayment guard;
- stale balance revalidation;
- activity.

## Phase 6 — Activity & Audit

- tracker activity;
- global activity;
- audit metadata;
- filters/pagination.

## Phase 7 — UX Hardening

- empty states;
- responsive layout;
- errors;
- loading;
- accessibility;
- refresh behavior;
- web/desktop polish.

## Phase 8 — Optional MVP 1.1

- comments;
- event streaming;
- notification groundwork;
- receipt attachment only if scope is promoted.

---

# 90. CODEX TASK RULES

When Codex is asked to implement work:

1. Read Artifact 01.
2. Read Artifact 02.
3. Identify affected module.
4. Identify affected business invariants.
5. Update backend rule first if financial logic changes.
6. Add/update automated tests.
7. Update API contract.
8. Update Flutter integration.
9. Run lint/tests.
10. Do not broaden scope without explicit instruction.

---

# 91. CODEX NON-NEGOTIABLE TECHNICAL RULES

1. Flutter is the client stack.
2. FastAPI is the API stack.
3. PostgreSQL is the database.
4. Backend is a modular monolith for MVP.
5. REST `/api/v1` is the authoritative public application API.
6. Use SQLAlchemy 2.x + Alembic.
7. Use PostgreSQL transactions for multi-table financial writes.
8. Never use binary floating point as the money source of truth.
9. Store money in integer minor units.
10. Backend recalculates and validates expense splits.
11. Backend recalculates and validates settlement obligations.
12. Never trust Flutter-supplied role permissions.
13. Do not store tracker roles in a way that makes JWT role state stale.
14. A Tracker always has exactly one Owner.
15. Use idempotency for expense/settlement creation.
16. Use optimistic versioning for mutable financial records.
17. Stale financial writes return `409`.
18. Do not silently last-write-wins.
19. Do not hard-delete financial history casually.
20. All financial writes create audit/activity records.
21. Do not expose ORM models directly through API.
22. Do not introduce microservices in MVP.
23. Do not introduce Redis unless a concrete feature requires it.
24. Do not introduce a job queue until durable background work exists.
25. Do not build budgets, financial wallets, goals, OCR, or advanced reports unless scope is explicitly promoted.
26. Use UTC timestamps.
27. Use server-side authoritative IDs/timestamps.
28. Keep authentication secrets out of Flutter source/assets.
29. All authorization-sensitive API operations must be server-enforced.
30. Any financial algorithm change requires tests.

---

# 92. DEFINITION OF TECHNICAL DONE

A feature is not technically done until:

## Backend

- endpoint exists;
- validation exists;
- RBAC exists;
- transaction boundary is correct;
- database constraints exist where appropriate;
- activity logging exists where required;
- unit/integration/API tests pass;
- OpenAPI contract is correct.

## Flutter

- repository integration exists;
- Riverpod state exists;
- loading/error/success states exist;
- permission UI is correct;
- responsive behavior is acceptable;
- API errors are handled;
- financial numbers are formatted from minor units safely;
- tests exist for critical behavior.

## Shared

- Artifact rules are respected;
- no duplicate financial source of truth was introduced;
- no new out-of-scope module was added;
- CI is green.

---

# 93. INITIAL TECHNICAL SUCCESS CRITERIA

The architecture is successful when this full path works reliably from the same Flutter codebase:

```text
Flutter Android / iOS / Web / Desktop
        ↓
Register / Login
        ↓
FastAPI JWT Authentication
        ↓
Create Tracker
        ↓
Invite Member
        ↓
RBAC enforced
        ↓
Create Expense
        ↓
Server calculates splits
        ↓
PostgreSQL transaction commits
        ↓
Balance engine derives obligations
        ↓
Flutter shows who owes whom
        ↓
Record Settlement
        ↓
Backend revalidates outstanding amount
        ↓
PostgreSQL commits settlement
        ↓
Activity log records event
        ↓
Updated balance becomes visible
```

The same financial result must be produced regardless of which supported Flutter platform initiated the action.

---

# 94. FINAL ARCHITECTURAL CONTRACT

SplitShare is a:

> **Flutter cross-platform client communicating through a versioned HTTPS REST API with a Python/FastAPI modular monolith backed by PostgreSQL.**

The most important architectural principle is:

> **Financial correctness lives on the server and in PostgreSQL transaction boundaries; Flutter presents and interacts with that truth but does not define it.**

Artifact 01 defines **what the product must do**.

Artifact 02 defines **how the software must be built**.

Neither artifact should be casually contradicted by implementation convenience.

---

# END OF ARTIFACT 02
