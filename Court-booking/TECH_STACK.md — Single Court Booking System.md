# Single Court Booking System — Tech Stack

## 1. Purpose

This document defines the required technology stack and technical direction for the Single Court Booking System.

The application must use:

- **Laravel**
- **Inertia.js**
- **React**
- **PostgreSQL**
- **Tailwind CSS**

Do not replace these technologies unless explicitly instructed.

---

# 2. Backend

## Laravel

Use Laravel as the primary backend framework.

Laravel is responsible for:

- Application logic
- Routing
- Authentication
- Authorization
- Database access
- Validation
- Booking logic
- Payment records
- Schedule management
- Notifications
- API/server-side endpoints where required
- Security
- Database transactions

Use Laravel's standard conventions wherever practical.

Avoid unnecessary custom architecture.

---

# 3. Frontend

## Inertia.js + React

Use **Inertia.js with React** for the application frontend.

The application should not be built as a separate SPA frontend with a completely independent API unless there is a clear requirement for it.

Preferred structure:

```text
Laravel
   ↓
Inertia.js
   ↓
React
   ↓
Tailwind CSS
```

Laravel should remain responsible for routing and server-side application logic while React handles the interactive UI.

---

# 4. React

Use React for:

- Booking interfaces
- Calendar/schedule UI
- Admin dashboard
- Booking forms
- Modals
- Interactive components
- Filters
- Status controls
- Responsive navigation
- Client-side interactions

Keep components reusable.

Example structure:

```text
resources/js/
├── Components/
├── Layouts/
├── Pages/
│   ├── Public/
│   └── Admin/
├── Hooks/
└── Utils/
```

Follow the existing project structure if one already exists.

Do not reorganize the project unnecessarily.

---

# 5. Database

## PostgreSQL

Use **PostgreSQL** as the primary database.

Do not use SQLite or MySQL for the production application.

PostgreSQL should store:

- Users
- Customers
- Court configuration
- Operating hours
- Closures
- Bookings
- Payments
- Blocked slots
- Notifications
- Audit information

Use Laravel migrations for database schema management.

---

# 6. Database Principles

Use proper database constraints and indexes.

Important fields should have appropriate indexes.

Examples:

```text
bookings
- id
- customer_id
- booking_date
- start_time
- end_time
- status
- payment_status
- created_at
- updated_at
```

Indexes should be added where they improve:

- Schedule queries
- Booking lookup
- Date filtering
- Status filtering

Avoid unnecessary indexes.

---

# 7. Double-Booking Protection

Double-booking prevention is a critical backend requirement.

Do not rely only on React/frontend validation.

The backend must validate booking availability.

Booking creation should use appropriate database transactions/locking where necessary.

Example:

```text
Customer A
    ↓
Attempts 7:00 PM
    ↓
Backend checks availability
    ↓
Booking created


Customer B
    ↓
Attempts 7:00 PM
    ↓
Backend checks availability
    ↓
Booking rejected
```

The system must remain safe even when two requests arrive at nearly the same time.

---

# 8. Tailwind CSS

Use **Tailwind CSS** for styling.

The UI must follow the designs provided in:

```text
/prototype
```

The prototype is the primary UI/UX reference.

Tailwind should be used to reproduce:

- Layout
- Typography
- Colors
- Spacing
- Borders
- Border radius
- Buttons
- Cards
- Forms
- Tables
- Calendar
- Responsive layouts
- States
- Modals

Do not introduce a completely different design system.

---

# 9. Prototype Requirement

The `/prototype` folder is a critical project resource.

Before implementing any UI:

1. Inspect the relevant prototype.
2. Understand the intended layout.
3. Identify reusable components.
4. Reproduce the design using React + Tailwind.
5. Maintain visual consistency.

Do not redesign prototype screens without a specific requirement.

If a feature does not have a prototype design, create a minimal UI that follows the same visual language.

---

# 10. Authentication

Use Laravel authentication.

Admin authentication must be secured.

Customers should **not be required to create accounts for MVP booking**.

Customer booking lookup should use a secure mechanism such as:

```text
Booking Reference
+
Mobile Number
```

or another appropriate verification method.

Do not expose other customers' booking information.

---

# 11. Authorization

Admin-only operations must be protected server-side.

Examples:

- Create manual booking
- Cancel booking
- Block schedule
- Modify pricing
- Modify operating hours
- Change payment status
- View business information
- View revenue

Never rely only on frontend route hiding.

---

# 12. Validation

All important data must be validated server-side using Laravel validation.

Validate:

- Booking date
- Start time
- End time
- Customer information
- Booking status
- Payment status
- Operating hours
- Pricing
- Cancellation rules

React-side validation can improve UX but must not replace backend validation.

---

# 13. Booking Architecture

The booking flow should be:

```text
React UI
   ↓
Inertia Request
   ↓
Laravel Controller / Action
   ↓
Validation
   ↓
Availability Check
   ↓
Database Transaction
   ↓
Booking Created
   ↓
Inertia Response
   ↓
Confirmation UI
```

Keep business rules on the backend.

Do not put critical booking rules only inside React.

---

# 14. Recommended Laravel Structure

Use standard Laravel organization.

Example:

```text
app/
├── Actions/
├── Http/
│   ├── Controllers/
│   └── Requests/
├── Models/
├── Notifications/
├── Policies/
└── Services/
```

Use Actions/Services only when they provide meaningful separation.

Do not create unnecessary abstraction layers.

---

# 15. Models

Expected core models include:

```text
User
Customer
Court
CourtHour
CourtClosure
Booking
Payment
BlockedSlot
Notification
```

The exact model structure may be adjusted based on the existing application.

Do not create unnecessary entities for features outside the MVP.

---

# 16. Routes

Use Laravel routes for both public and admin pages.

Conceptually:

```text
Public
/
 /book
 /booking/{reference}
 /booking/{reference}/manage

Admin
/admin
/admin/bookings
/admin/schedule
/admin/customers
/admin/payments
/admin/settings
```

Use route naming conventions.

Protect admin routes with authentication and authorization middleware.

---

# 17. API Usage

Do not build a separate REST API unless required.

For normal application functionality:

```text
Laravel
+
Inertia
+
React
```

is preferred.

An API may be introduced later if required for:

- Mobile applications
- Third-party integrations
- External payment services
- Public integrations

---

# 18. Notifications

Notifications should be handled by Laravel.

Potential channels:

- Email
- SMS
- Other supported notification providers

Notification implementation should be kept modular so the provider can be changed later.

Do not make external notification providers tightly coupled to booking logic.

---

# 19. Payments

Payment records should be stored in PostgreSQL.

At minimum track:

```text
Payment
├── amount
├── method
├── status
├── reference
└── timestamps
```

Possible payment methods:

- Cash
- GCash
- Maya
- QR Ph
- Online payment provider

Payment integration should only be implemented when required.

The owner must be able to manually record payments.

---

# 20. Responsive Design

The application must be responsive.

Priority:

### Customer

Mobile-first.

Most customers will likely book using a phone.

### Admin

Must work on:

- Mobile
- Tablet
- Desktop

Do not create a desktop-only admin panel.

Use Tailwind responsive utilities and follow the `/prototype` responsive designs where available.

---

# 21. Performance

Keep the application lightweight.

Avoid:

- Unnecessary JavaScript
- Large frontend dependencies
- Unnecessary API calls
- Excessive polling
- Large component bundles
- Over-engineered state management

Use Laravel/Inertia server-side data loading where practical.

Only introduce additional client-side state management when needed.

---

# 22. State Management

Do not introduce Redux or another global state library unless there is a clear requirement.

Prefer:

- React local state
- Inertia page props
- React hooks
- Laravel server state

Keep state as close as possible to where it is used.

---

# 23. Error Handling

Provide clear handling for:

- Booking conflicts
- Invalid booking dates
- Closed hours
- Blocked slots
- Payment failures
- Network errors
- Validation errors
- Unauthorized actions

Errors should be understandable to normal users.

Avoid exposing technical exception details.

---

# 24. Security

Follow Laravel security best practices.

Required:

- Authentication
- Authorization
- CSRF protection
- Server-side validation
- Rate limiting where appropriate
- Secure password handling
- Secure session management
- Protected admin routes
- Safe database queries
- Input sanitization/validation
- Secure payment handling

Never trust client-provided booking availability or payment status.

---

# 25. Environment Configuration

Sensitive configuration must use environment variables.

Examples:

```text
APP_KEY
APP_URL
DB_CONNECTION
DB_HOST
DB_PORT
DB_DATABASE
DB_USERNAME
DB_PASSWORD
```

Payment and notification credentials must also remain outside source code.

Never commit secrets to Git.

---

# 26. Development Environment

Recommended local environment:

```text
Laravel
PHP
Composer
Node.js
npm
PostgreSQL
```

Frontend dependencies should be managed through the project's package manager.

Follow the existing lock files and project configuration.

Do not unnecessarily upgrade major dependencies during feature implementation.

---

# 27. Testing

Important business logic should have automated tests.

Prioritize tests for:

### Booking

- Valid booking
- Duplicate booking
- Overlapping booking
- Booking outside operating hours
- Booking on closed date
- Booking on blocked slot
- Cancellation rules

### Authorization

- Customer cannot access admin functionality
- Unauthorized users cannot modify bookings
- Admin-only operations are protected

### Payments

- Payment status changes
- Manual payment recording
- Invalid payment values

---

# 28. Code Quality

Follow the existing project coding conventions.

Prioritize:

- Readability
- Simplicity
- Maintainability
- Reusability where appropriate
- Clear naming
- Small focused components
- Small focused backend methods

Avoid premature abstraction.

Do not build infrastructure for hypothetical future requirements.

---

# 29. Architecture Principle

The application should remain simple:

```text
                 ┌───────────────┐
                 │    Customer   │
                 └───────┬───────┘
                         │
                         ↓
                 ┌───────────────┐
                 │    Inertia    │
                 └───────┬───────┘
                         │
                         ↓
                 ┌───────────────┐
                 │     React     │
                 │   + Tailwind  │
                 └───────┬───────┘
                         │
                         ↓
                 ┌───────────────┐
                 │    Laravel    │
                 └───────┬───────┘
                         │
                         ↓
                 ┌───────────────┐
                 │  PostgreSQL   │
                 └───────────────┘
```

---

# 30. Technology Decisions

| Area | Technology |
|---|---|
| Backend | Laravel |
| Server-side application | Laravel |
| Frontend | React |
| SPA bridge | Inertia.js |
| Styling | Tailwind CSS |
| Database | PostgreSQL |
| Authentication | Laravel |
| Validation | Laravel |
| Database migrations | Laravel |
| Notifications | Laravel Notifications |
| Testing | Laravel/PHP testing tools + React testing where appropriate |

---

# 31. Important Restrictions

Do not introduce the following unless explicitly required:

- Next.js
- Vue
- Livewire
- Laravel Blade as the primary application UI
- MySQL
- SQLite for production
- Separate frontend/backend applications
- Redux
- Multi-tenant architecture
- SaaS subscription system
- Multiple business accounts
- Marketplace architecture

The required stack is:

**Laravel + Inertia.js + React + PostgreSQL + Tailwind CSS.**

---

# 32. Final Technical Principle

Keep the implementation **simple, secure, maintainable, and aligned with the actual court's requirements**.

Do not over-engineer the application.

The technology should support the product, not become the product.

Most importantly:

> **The requirements MD defines what the system must do.**

> **The `/prototype` folder defines how the system should look and behave.**

> **This TECH_STACK.md defines how the system should be built.**

All three should be followed together.