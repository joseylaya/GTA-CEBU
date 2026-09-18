# AGENTS.md — SPLITSHARE AI DEVELOPMENT INSTRUCTIONS

## Purpose

This file is the primary repository-level instruction for any AI coding agent working on **SplitShare / Collaborative Finance Tracker**.

Before writing, changing, deleting, or generating application code, the agent must understand the product and technical contracts defined in this repository.

This file tells the agent:

- what to read;
- in what order to read it;
- which document has authority;
- how to use the UI prototype;
- how to approach implementation tasks;
- what must never be invented or silently changed;
- what checks are required before declaring work complete.

---

# 1. PROJECT SUMMARY

SplitShare is a collaborative shared-expense application.

Its core purpose is to let groups:

- create shared Trackers;
- add Expenses;
- split Expenses among selected members;
- determine who owes whom;
- record Settlements;
- collaborate using role-based permissions;
- preserve a clear Activity/Audit history.

The MVP is finance-first.

It is **not** a general accounting system, banking app, wallet, chat app, savings app, or budgeting platform.

---

# 2. REQUIRED READING BEFORE IMPLEMENTATION

Before doing meaningful implementation work, read the following files in this order.

## 2.1 Product Source of Truth

Locate and read:

```text
ARTIFACT_01_SPLITSHARE_PRODUCT_FOUNDATION.md
```

Preferred repository location:

```text
./docs/ARTIFACT_01_SPLITSHARE_PRODUCT_FOUNDATION.md
```

If it is not inside `./docs`, locate the same filename elsewhere in the repository.

This document defines:

- Mission;
- Vision;
- MVP boundaries;
- terminology;
- roles and permissions;
- workflows;
- expense behavior;
- split behavior;
- balance rules;
- settlement rules;
- activity rules;
- user experience requirements;
- edge cases;
- product Definition of Done.

**Artifact 01 is the authority for what the product must do.**

---

## 2.2 Technical Architecture Source of Truth

Locate and read:

```text
ARTIFACT_02_SPLITSHARE_TECHNICAL_ARCHITECTURE.md
```

Preferred location:

```text
./docs/ARTIFACT_02_SPLITSHARE_TECHNICAL_ARCHITECTURE.md
```

This document defines:

- Flutter architecture;
- FastAPI architecture;
- PostgreSQL usage;
- REST API conventions;
- authentication;
- RBAC;
- state management;
- SQLAlchemy;
- Alembic;
- concurrency;
- idempotency;
- money representation;
- testing;
- deployment direction;
- project structure;
- Codex technical rules.

**Artifact 02 is the authority for how the product must be built.**

---

## 2.3 Database Source of Truth

Locate and read:

```text
ARTIFACT_03_SPLITSHARE_DATABASE_ARCHITECTURE.md
```

Preferred location:

```text
./docs/ARTIFACT_03_SPLITSHARE_DATABASE_ARCHITECTURE.md
```

This document defines:

- database tables;
- IDs;
- foreign keys;
- timestamps;
- `created_at`;
- `updated_at`;
- `deleted_at`;
- lifecycle timestamps;
- `created_by`;
- `updated_by`;
- `deleted_by`;
- money columns;
- status fields;
- constraints;
- indexes;
- soft deletion;
- financial integrity;
- database transaction behavior.

**Artifact 03 is the authority for persistent data structure and database integrity.**

---

# 3. UI / UX PROTOTYPE REFERENCE

The repository contains a UI reference directory:

```text
./prototype
```

Before implementing or substantially modifying Flutter UI, inspect the entire relevant portion of:

```text
./prototype/**
```

This directory contains reference material for:

- visual appearance;
- screen hierarchy;
- mobile layout;
- cards;
- navigation;
- Tracker screens;
- Expense flow;
- Split Expense flow;
- Balance screens;
- Settle Up flow;
- Member and Permission screens;
- Activity screens;
- onboarding;
- general application flow.

The prototype is a **visual and interaction reference**.

It is not automatically the source of truth for business logic.

---

# 4. SOURCE-OF-TRUTH PRECEDENCE

When requirements appear to conflict, use this precedence.

## 4.1 Explicit Current Task

A clear, explicit instruction from the user for the current task has highest priority.

However, if that instruction intentionally changes an established product rule, update the appropriate artifact/documentation as part of the task when requested or appropriate.

Do not silently create undocumented product divergence.

---

## 4.2 Artifact 01 — Product Behavior

Artifact 01 controls:

```text
WHAT the application does.
```

Examples:

- whether Settlements are MVP;
- whether Budgets are MVP;
- role permissions;
- equal-split behavior;
- terminology;
- balance meaning;
- edge-case behavior.

---

## 4.3 Artifact 02 — Technical Architecture

Artifact 02 controls:

```text
HOW the application is implemented.
```

Examples:

- Flutter;
- FastAPI;
- PostgreSQL;
- Riverpod;
- REST;
- modular monolith;
- SQLAlchemy;
- Alembic;
- integer minor-unit money.

---

## 4.4 Artifact 03 — Database Architecture

Artifact 03 controls:

```text
HOW persistent data is structured and protected.
```

Examples:

- table names;
- UUID IDs;
- foreign keys;
- timestamps;
- version fields;
- indexes;
- audit actors;
- constraints.

---

## 4.5 `./prototype` — UI Reference

The prototype controls:

```text
HOW the intended product should generally look and flow.
```

It does **not** override financial, permission, or database rules.

Example:

If a prototype screen displays a Budget tab but Artifact 01 states Budgets are outside MVP:

```text
DO NOT implement Budgets.
```

Artifact 01 wins.

If the prototype uses the term:

```text
Group
```

but Artifact 01 defines:

```text
Tracker
```

use:

```text
Tracker
```

The artifact wins.

---

# 5. CANONICAL PRODUCT TERMINOLOGY

Use these terms consistently:

```text
Tracker
Expense
Split
Settlement
Member
Invitation
Activity
Members & Permissions
Add Expense
Split Expense
Settle Up
You are owed
You owe
Settled up
```

Do not randomly replace `Tracker` with:

```text
Group
Project
Space
Pool
Shared Space
Workspace
```

unless a later requirement explicitly creates a different domain object.

---

# 6. APPROVED CORE TECH STACK

The approved architecture is:

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

Do not replace this stack unless explicitly instructed.

Do not introduce a second backend stack.

Do not replace PostgreSQL with Firebase, Firestore, MongoDB, SQLite, or another primary production database.

---

# 7. MVP SCOPE — DO NOT EXPAND SILENTLY

The MVP includes:

```text
Authentication
Trackers
Members
Invitations
RBAC
Expenses
Equal Splits
Balance Calculation
Settlements
Activity / Audit
Profile / Basic Settings
```

Optional MVP 1.1:

```text
Comments
```

The following are **not MVP features** unless explicitly promoted:

```text
Budgets
Savings Goals
Financial Wallets
Bank Accounts
GCash Accounts
Receipt OCR
AI Receipt Scanning
Advanced Reports
Recurring Expenses
Percentage Splits
Exact Amount Splits
Weighted Splits
Debt Simplification
Multi-Currency Conversion
Bank Integration
In-App Money Transfer
General Chat
```

Do not create tables, routes, navigation items, services, or placeholder modules for these merely because they might be useful later.

---

# 8. FINANCIAL SOURCE OF TRUTH

Balances must be derived from:

```text
Expenses
+ Expense Splits
+ Settlements
```

Never create an authoritative mutable field such as:

```text
tracker_members.balance
users.balance
trackers.balance
```

for current financial truth.

The conceptual user balance is:

```text
amount paid for active expenses
- active expense shares
+ active settlements sent
- active settlements received
```

Interpretation:

```text
positive → user is owed
negative → user owes
zero     → settled
```

---

# 9. MONEY RULES

Never use binary floating-point values as the authoritative representation of money.

Use integer minor units.

Example:

```text
₱1,250.50
```

must be represented as:

```text
125050
```

for a two-decimal currency.

Canonical database/API naming:

```text
amount_minor
```

Examples:

```text
amount_minor
old_amount_minor
new_amount_minor
```

The backend is authoritative for all financial calculations.

Flutter may preview calculations for UX, but FastAPI must recalculate and validate them before persistence.

---

# 10. EQUAL SPLIT RULE

MVP supports equal splitting only.

Example:

```text
₱1,000 / 3
```

must not become:

```text
₱333.33
₱333.33
₱333.33
```

because that totals:

```text
₱999.99
```

Use deterministic smallest-unit remainder distribution.

Example:

```text
₱333.34
₱333.33
₱333.33
```

Invariant:

```text
SUM(splits) == expense amount
```

must always hold.

---

# 11. IMPORTANT EXPENSE RULES

An Expense:

- belongs to one Tracker;
- has exactly one payer in MVP;
- has a positive amount;
- has one or more participating members;
- does not require every Tracker member to participate;
- may have a payer excluded from the Split;
- must produce Split rows whose total equals the Expense amount.

The payer may pay fully for other members.

Example:

```text
Joseph pays ₱900.
Participants: Mars, Matt.
Joseph is not included.
```

This is valid.

---

# 12. SETTLEMENT RULES

Settlement is a core MVP feature.

A Settlement:

- records payment that occurred outside SplitShare;
- does not transfer money inside the application;
- goes from one member to another;
- must be positive;
- may be partial;
- may not exceed the current direct outstanding obligation in MVP;
- must be revalidated on the backend immediately before commit.

Do not trust a stale amount displayed by Flutter.

---

# 13. RBAC RULES

Canonical Tracker roles:

```text
owner
editor
commenter
viewer
```

The backend must enforce authorization.

Hiding a button in Flutter is not authorization.

At minimum:

## Owner

May:

- manage Tracker;
- manage Members;
- change roles;
- transfer ownership;
- create/edit/delete Expenses;
- record/correct Settlements;
- view everything.

## Editor

May:

- create/edit/delete Expenses;
- record/correct Settlements;
- view Tracker data;
- comment when comments exist.

May not:

- manage roles;
- remove Members;
- transfer ownership;
- delete Tracker.

## Commenter

May:

- view;
- comment if comments are enabled.

May not change financial records.

## Viewer

Read-only.

---

# 14. OWNER INVARIANT

Every active Tracker must have exactly one active Owner.

Never allow:

```text
0 active owners
```

or:

```text
2+ active owners
```

Ownership transfer must be atomic.

---

# 15. DATABASE NAMING RULES

Use:

```text
id UUID PRIMARY KEY
```

for major entities.

Foreign keys must be explicit:

```text
tracker_id
user_id
expense_id
category_id
paid_by_user_id
from_user_id
to_user_id
```

Actor fields use:

```text
created_by
updated_by
deleted_by
```

or a domain-specific clear name:

```text
invited_by
removed_by
actor_user_id
```

Avoid ambiguous names such as:

```text
ref_id
payer
sender
receiver
owner
parent
```

without explicit `_id` semantics.

---

# 16. TIMESTAMP RULES

Canonical timestamps:

```text
created_at
updated_at
deleted_at
```

Use:

```text
updated_at
```

instead of:

```text
modify_at
modified_at
last_modified_at
```

Use additional lifecycle timestamps where required:

```text
joined_at
removed_at
accepted_at
declined_at
revoked_at
expires_at
last_used_at
last_login_at
password_changed_at
email_verified_at
completed_at
```

Use PostgreSQL:

```text
TIMESTAMPTZ
```

for event timestamps.

Store actual event time in UTC.

Use:

```text
DATE
```

for business dates such as:

```text
expense_date
settlement_date
```

---

# 17. SOFT DELETE RULE

Financial history must not be casually destroyed.

Use soft deletion where specified.

For example:

```text
expenses.deleted_at
settlements.deleted_at
```

Deleted Expenses and Settlements:

- remain in historical storage;
- are excluded from active balance calculations;
- remain explainable through Activity/Audit.

Do not physically delete financial history through normal application actions.

---

# 18. OPTIMISTIC CONCURRENCY

Mutable financial records must not silently use last-write-wins.

Use a version field where specified:

```text
version INTEGER
```

Example:

Client loaded:

```text
version = 4
```

Another Editor changes record:

```text
version = 5
```

First client attempts save with version 4.

Expected result:

```text
409 Conflict
```

Do not overwrite version 5 silently.

---

# 19. IDEMPOTENCY

Sensitive creation operations must be protected against duplicate submissions.

Examples:

```text
Create Expense
Create Settlement
Create Tracker
Send Invitation
```

Use an idempotency key strategy defined in Artifact 02/03.

Double taps or network retries must not create duplicate financial records.

---

# 20. DATABASE TRANSACTIONS

Financial multi-row operations must be atomic.

Examples:

## Create Expense

Must commit together:

```text
Expense
Splits
Activity
```

or roll back together.

## Edit Expense

Must commit together:

```text
Expense update
Split update
Version increment
Activity
```

## Settlement

Must commit together:

```text
Outstanding debt validation
Settlement
Activity
```

## Ownership Transfer

Must commit together:

```text
Old owner role update
New owner role update
Tracker owner reference
Activity
```

Never leave partially committed financial state.

---

# 21. ACTIVITY / AUDIT RULE

Important actions must generate Activity/Audit records.

Examples:

```text
tracker.created
tracker.updated
tracker.deleted
tracker.ownership_transferred

member.invited
member.joined
member.role_changed
member.removed

expense.created
expense.updated
expense.deleted

settlement.created
settlement.updated
settlement.deleted
```

Activity records explain history.

They are not the financial source of truth.

---

# 22. FLUTTER ARCHITECTURE EXPECTATION

Use feature-first organization.

Conceptual structure:

```text
lib/
├── app/
├── core/
└── features/
    ├── auth/
    ├── home/
    ├── trackers/
    ├── members/
    ├── expenses/
    ├── balances/
    ├── settlements/
    ├── activity/
    └── profile/
```

Use Riverpod for state management.

Use `go_router` for navigation.

Do not put HTTP calls directly inside widgets.

Do not implement authoritative balance calculations inside UI code.

---

# 23. FASTAPI ARCHITECTURE EXPECTATION

Backend is a modular monolith.

Do not introduce microservices for MVP.

Separate concerns:

```text
API routes
Application services
Domain/business logic
Repositories
Database models
Pydantic schemas
Security
```

Do not put all business logic inside FastAPI route functions.

Do not scatter RBAC checks across random route bodies.

---

# 24. REST API EXPECTATION

Use:

```text
/api/v1
```

REST is authoritative for application client communication.

API responses should use stable machine-readable error codes.

Examples:

```text
STALE_EXPENSE_VERSION
OUTSTANDING_BALANCE_CHANGED
INSUFFICIENT_TRACKER_PERMISSION
INVITATION_EXPIRED
```

Do not make Flutter depend on human error strings for behavior.

---

# 25. POSTGRESQL EXPECTATION

Use PostgreSQL-specific strengths.

Use:

```text
UUID
TIMESTAMPTZ
JSONB
partial indexes
foreign keys
unique constraints
check constraints
transactions
```

Do not design production behavior around SQLite limitations.

Backend database tests must use PostgreSQL for database semantics.

---

# 26. MIGRATIONS

Alembic owns database schema changes.

Every schema change must have a migration.

Do not:

- manually alter production schema;
- modify an old migration already deployed without careful reason;
- add undocumented tables;
- rename core columns silently.

Review autogenerated migrations before applying them.

---

# 27. PROTOTYPE USAGE RULES

The agent must inspect `./prototype` before implementing screens.

For each UI task:

1. Find the relevant prototype reference.
2. Understand the screen's purpose.
3. Identify its place in the product flow.
4. Compare it against Artifact 01 requirements.
5. Implement the consistent version.
6. Preserve the established visual direction where practical.

The prototype may contain alternate generated concepts.

Do not combine all variants.

Choose the variant that best matches the canonical product architecture.

---

# 28. APPROVED UI DIRECTION

The selected direction is:

- clean;
- minimal;
- mobile-first;
- card-based;
- strong typography hierarchy;
- finance-first;
- green primary identity;
- clear positive/negative states;
- prominent balance summary;
- obvious Settle Up action;
- visible member roles;
- simple transaction lists.

The Tracker Detail screen should generally prioritize:

```text
Tracker identity
↓
Your balance
↓
Settle Up
↓
Transactions | Balances
↓
Content
```

Do not turn the primary experience into a chat UI.

---

# 29. BALANCE COPY

Use explicit wording.

Positive:

```text
YOU ARE OWED
```

Negative:

```text
YOU OWE
```

Zero:

```text
YOU'RE SETTLED UP
```

Do not rely only on:

```text
+$450
-$450
```

or color.

---

# 30. MAIN NAVIGATION

Canonical MVP global navigation:

```text
Home
Trackers
Activity
Profile
```

Do not introduce MVP navigation for:

```text
Budgets
Wallets
Goals
Friends
Projects
Spaces
```

unless explicitly instructed.

---

# 31. REQUIRED IMPLEMENTATION WORKFLOW FOR AI

For every non-trivial coding task, follow this sequence.

## Step 1 — Read Context

Read:

```text
AGENTS.md
```

Then identify the relevant sections from:

```text
Artifact 01
Artifact 02
Artifact 03
```

If UI is involved, inspect:

```text
./prototype
```

---

## Step 2 — Inspect Existing Code

Before creating new code:

- inspect existing project structure;
- inspect related feature;
- inspect related models;
- inspect migrations;
- inspect tests;
- inspect existing patterns.

Do not create parallel implementations because you failed to inspect existing code.

---

## Step 3 — Identify Invariants

State internally what must remain true.

Examples:

```text
sum(splits) == expense.amount_minor
```

```text
exactly one active Tracker owner
```

```text
deleted Expense does not affect balances
```

```text
Viewer cannot mutate financial data
```

---

## Step 4 — Plan the Smallest Correct Change

Prefer the smallest cohesive implementation that fully satisfies the task.

Do not redesign unrelated modules.

Do not refactor large areas merely because a different style seems preferable.

---

## Step 5 — Backend First for Business Logic

If the task changes financial behavior:

1. implement/adjust backend domain rule;
2. implement database behavior;
3. add tests;
4. update API;
5. update Flutter UI.

Do not implement important financial behavior only in Flutter.

---

## Step 6 — Add Tests

Any financial or permission change must have tests.

At minimum consider:

- happy path;
- permission failure;
- invalid input;
- stale state;
- financial invariant;
- soft deletion where relevant.

---

## Step 7 — Run Validation

Run appropriate project checks.

Backend, where available:

```text
ruff
pytest
migration checks
```

Flutter:

```text
flutter analyze
flutter test
```

Run targeted tests during development and broader tests before completion.

---

## Step 8 — Report What Changed

At task completion, report concisely:

- files changed;
- behavior implemented;
- tests run;
- any known limitation;
- any migration created.

Do not claim success if tests were not run.

If a tool/environment prevents testing, say so clearly.

---

# 32. WHEN REQUIREMENTS ARE UNCLEAR

Do not invent major product behavior.

Before asking the user, first inspect:

```text
Artifact 01
Artifact 02
Artifact 03
prototype
existing code
tests
```

If the answer can be derived safely from these, proceed.

Ask for clarification only when a real product decision remains unresolved.

---

# 33. DO NOT SILENTLY CHANGE THE ARTIFACTS

Artifacts are source-of-truth documents.

Do not rewrite them simply to justify an implementation choice.

If the user explicitly changes a product or technical decision:

- implement the approved change;
- update the relevant artifact if requested or if maintaining repository consistency is part of the task;
- mention the conflict/resolution.

---

# 34. DO NOT MODIFY PROTOTYPE REFERENCES UNLESS ASKED

Treat:

```text
./prototype
```

as design/reference material.

Do not:

- delete prototype images;
- rename prototype assets;
- optimize or compress them;
- regenerate them;
- replace them;

unless explicitly instructed.

---

# 35. DO NOT OVERBUILD

Do not build future architecture prematurely.

Examples of prohibited premature additions:

```text
Redis
Kafka
RabbitMQ
Celery
Microservices
Elasticsearch
GraphQL
Financial Wallet domain
Budget engine
AI/OCR pipeline
Data warehouse
Event sourcing
CQRS infrastructure
```

unless a current requirement genuinely needs them.

A future possibility is not a current requirement.

---

# 36. DO NOT UNDERBUILD FINANCIAL SAFETY

While avoiding overengineering, never simplify away:

```text
transactions
constraints
RBAC
idempotency
optimistic concurrency
audit history
exact money
server-side validation
```

These are not optional complexity.

They protect financial correctness.

---

# 37. REQUIRED FINANCIAL TEST INVARIANTS

Where applicable, verify:

```text
SUM(expense splits) == expense amount
```

and:

```text
SUM(all member balances in Tracker) == 0
```

after:

- Expense creation;
- Expense edit;
- Expense deletion;
- Settlement creation;
- Settlement correction/deletion.

---

# 38. SECURITY EXPECTATIONS

Never:

- log passwords;
- log access tokens;
- commit secrets;
- expose password hashes;
- trust client role claims;
- expose another Tracker's data;
- authorize based only on knowing a UUID;
- store long-lived browser refresh credentials insecurely.

All Tracker access must be scoped through active membership.

---

# 39. API / CLIENT CONTRACT

The API is authoritative.

Flutter must not send or persist values such as:

```text
new_balance
member_balance
calculated_debt
```

as authoritative writes.

Flutter submits facts:

```text
expense amount
payer
participants
settlement amount
```

FastAPI determines financial results.

---

# 40. UI FLOW EXPECTATION

The intended primary user journey is:

```text
Welcome / Auth
      ↓
Home
      ↓
Trackers
      ↓
Create / Open Tracker
      ↓
Tracker Detail
      ├── Transactions
      │      ↓
      │   Expense Detail
      │
      ├── Add Expense
      │      ↓
      │   Split Expense
      │
      ├── Balances
      │      ↓
      │   Settle Up
      │
      ├── Members & Permissions
      │      ↓
      │   Invite Member
      │
      └── Activity
```

Use `./prototype` to understand the intended visual execution of these flows.

---

# 41. DEFINITION OF DONE FOR AN AI TASK

A task is complete only when the relevant conditions are true.

## Product

- behavior matches Artifact 01;
- terminology is consistent;
- no out-of-scope feature was introduced.

## Architecture

- implementation matches Artifact 02;
- no competing framework/pattern was introduced without approval.

## Database

- schema matches Artifact 03;
- timestamps/IDs/constraints are correct;
- migrations exist when required.

## UI

- relevant prototype was reviewed;
- layout follows intended design direction;
- responsive behavior is considered;
- balance language is unambiguous.

## Financial

- server is authoritative;
- money is exact;
- invariants remain valid;
- stale writes are protected;
- duplicate sensitive submissions are protected.

## Tests

- relevant tests were added/updated;
- appropriate checks were run;
- result is reported truthfully.

---

# 42. STARTING A NEW DEVELOPMENT SESSION

When beginning work in a fresh session, perform this checklist:

```text
[ ] Read AGENTS.md
[ ] Read relevant parts of Artifact 01
[ ] Read relevant parts of Artifact 02
[ ] Read relevant parts of Artifact 03
[ ] Inspect ./prototype if UI/flow is involved
[ ] Inspect current repository implementation
[ ] Inspect related tests
[ ] Inspect current migrations if DB is involved
[ ] Identify affected invariants
[ ] Implement smallest correct change
[ ] Test
[ ] Report accurately
```

For broad foundational work, read all three artifacts completely.

---

# 43. INITIAL BOOTSTRAP INSTRUCTION

If the repository has not yet been scaffolded, the first implementation phase should create only the approved foundations.

Expected high-level structure:

```text
./apps/client
./apps/api
./docs
./prototype
./infra
./.github/workflows
```

Bootstrap:

```text
Flutter application
FastAPI application
PostgreSQL local development service
SQLAlchemy
Alembic
environment configuration
basic CI
backend test foundation
Flutter test foundation
```

Do not start by implementing every feature at once.

Follow Artifact 02 development phases.

---

# 44. FIRST FEATURE ORDER

After bootstrap, preferred implementation order:

```text
1. Authentication
2. Trackers
3. Membership / Invitations / RBAC
4. Expenses
5. Equal Splits
6. Balances
7. Settlements
8. Activity / Audit
9. UX hardening
10. Optional comments
```

Do not jump to Reports, Budgets, Wallets, OCR, or AI features.

---

# 45. FINAL AI CONTRACT

Before making a decision, ask:

```text
Is this consistent with Artifact 01?
Is this consistent with Artifact 02?
Is this consistent with Artifact 03?
If UI-related, did I inspect ./prototype?
Does this preserve financial correctness?
Am I introducing something outside MVP?
Can this result be explained and tested?
```

The project must always be able to answer:

1. What was spent?
2. Who paid?
3. Who participated?
4. Who owes whom?
5. What settlements occurred?
6. What actions produced the current result?

If an implementation makes those answers less reliable, it is the wrong implementation.

---

# END OF AGENTS.md
