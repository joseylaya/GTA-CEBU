# Single Court Booking System

## 1. Overview

Build a dedicated online booking website for **one specific sports court**.

This is **not** a multi-tenant SaaS platform.

The system is designed specifically for one court owner/business and should prioritize:

- Simple customer booking
- Real-time slot availability
- Prevention of double bookings
- Walk-in/manual bookings
- Payment tracking
- Easy schedule management
- Mobile-first experience
- Fast and simple administration

The website should feel like the **official booking website of the court**, not a generic booking platform.

---

# 2. Important Design Requirement

## Prototype Folder Is the Design Source of Truth

The project contains a:

```text
/prototype
```

folder.

**All UI implementation must follow the designs, layouts, components, spacing, colors, typography, interactions, and overall visual direction provided inside `/prototype`.**

Do not redesign the UI unnecessarily.

Before implementing a page:

1. Inspect the relevant prototype.
2. Identify the intended layout and components.
3. Reproduce the design accurately.
4. Only introduce new UI when a required feature does not exist in the prototype.
5. Keep new UI consistent with the existing prototype design system.

**The `/prototype` folder takes priority over assumptions about how the UI should look.**

---

# 3. Core Concept

The booking flow should be extremely simple:

```text
Customer
   ↓
Select Date
   ↓
View Available Time Slots
   ↓
Select Time
   ↓
Enter Customer Details
   ↓
Confirm Booking
   ↓
Payment / Deposit
   ↓
Booking Confirmation
```

The owner manages the same schedule:

```text
Online Booking ──┐
                 ├──> Court Schedule
Walk-in Booking ─┘
                 ↓
          Available / Reserved
```

There must only be **one source of truth for court availability**.

---

# 4. User Types

## Customer

Can:

- View court information
- View pricing
- View available schedules
- Create a booking
- Provide contact information
- Receive booking confirmation
- View booking details
- Cancel/reschedule according to booking rules

Customers should **not be required to create an account** for the MVP.

---

## Owner/Admin

Can:

- View bookings
- View daily/weekly schedule
- Create manual bookings
- Create walk-in bookings
- Block time slots
- Edit bookings
- Cancel bookings
- Mark payments as paid/unpaid
- Manage court schedule
- Manage operating hours
- Manage pricing
- View customers
- View booking history
- View basic revenue information

---

# 5. Customer Website

## Homepage

The homepage should contain:

- Court branding/logo
- Court photos
- Short description
- Location
- Opening hours
- Pricing
- Booking CTA
- Court rules
- Contact information

Primary CTA:

```text
BOOK NOW
```

The booking action should be immediately visible.

---

# 6. Booking Page

The booking page is the most important customer-facing page.

Display:

- Selected date
- Available time slots
- Booked slots
- Unavailable/blocked slots
- Court price
- Booking duration

Example:

```text
September 14, 2026

06:00 PM   AVAILABLE
07:00 PM   BOOKED
08:00 PM   AVAILABLE
09:00 PM   AVAILABLE
10:00 PM   CLOSED
```

Customer selects an available slot.

The system must prevent customers from selecting a slot that has already been booked.

---

# 7. Booking Information

Customer provides:

- Full name
- Mobile number
- Email address (optional if not required)
- Number of players/team name if applicable
- Notes (optional)

Avoid unnecessary fields.

The booking form should be quick to complete.

---

# 8. Booking Confirmation

After successful booking, show:

```text
BOOKING CONFIRMED

Booking #: A82K91

Date:
September 15, 2026

Time:
7:00 PM – 8:00 PM

Court:
[COURT NAME]

Amount:
₱500

Payment:
Paid / Pending
```

Provide actions:

```text
View Booking
Manage Booking
Add to Calendar
```

The customer should also receive confirmation through the configured notification channel.

---

# 9. Booking Reference

Every booking must have a unique booking reference.

Example:

```text
A82K91
```

Customers can use this reference to access their booking.

For MVP, avoid requiring a customer account.

Possible management flow:

```text
Booking Reference
+
Mobile Number
↓
View Booking
```

---

# 10. Booking Status

Use clear booking statuses.

Recommended:

```text
Pending
Confirmed
Completed
Cancelled
No-show
```

Payment status should be separate:

```text
Unpaid
Partially Paid
Paid
Refunded
```

Do not mix booking status and payment status.

---

# 11. Schedule Management

The owner must have a clear schedule view.

Example:

```text
TODAY
September 14

06:00 PM   Jose       CONFIRMED
07:00 PM   Mark       CONFIRMED
08:00 PM   AVAILABLE
09:00 PM   Basketball Team
10:00 PM   CLOSED
```

The owner should be able to:

- Create booking
- Edit booking
- Cancel booking
- Block slot
- Unblock slot
- Change booking status
- Update payment status

---

# 12. Walk-in Bookings

The owner must be able to create a booking manually.

Example:

```text
+ ADD BOOKING

Customer:
Juan Dela Cruz

Date:
September 14

Time:
8:00 PM – 9:00 PM

Payment:
Cash

Status:
Confirmed
```

After saving, the slot becomes unavailable to online customers.

---

# 13. Blocked Time

The owner can block court availability.

Reasons may include:

- Maintenance
- Private event
- Tournament
- Owner reservation
- Court closure

Example:

```text
08:00 PM – 10:00 PM
BLOCKED

Reason:
Maintenance
```

Blocked slots must not appear as bookable.

---

# 14. Double Booking Prevention

This is a critical requirement.

The backend must enforce booking conflicts.

Never rely only on frontend validation.

Example:

```text
Customer A → books 7:00 PM
Customer B → attempts to book 7:00 PM
                     ↓
              Backend validation
                     ↓
                 REJECT
```

The database must prevent two confirmed/pending bookings from occupying the same court/time period.

This must also work when:

- Two customers book simultaneously
- Owner creates a manual booking
- Owner blocks a slot
- Customer refreshes the page
- Multiple browser tabs are open

---

# 15. Pricing

The system should support the court's actual pricing rules.

At minimum:

```text
Hourly Rate
```

Example:

```text
1 hour = ₱500
```

The architecture should allow future support for:

- Different weekday/weekend rates
- Peak hours
- Special rates
- Discounts
- Tournament pricing
- Member pricing

Do not overcomplicate the MVP.

---

# 16. Payments

Payment tracking should support:

```text
Unpaid
Partially Paid
Paid
Refunded
```

Payment methods may include:

- Cash
- GCash
- Maya
- QR Ph
- Online payment provider

For MVP, payment integration should only be implemented if required by the actual court.

The owner must always be able to manually record a payment.

---

# 17. Dashboard

The admin dashboard should focus on useful information.

Display:

```text
TODAY

Bookings       8
Revenue        ₱4,000
Available      3 slots
Pending        2
```

Also show the day's schedule.

Avoid unnecessary charts and complicated analytics in the MVP.

---

# 18. Calendar

Admin should be able to switch between:

```text
Day
Week
```

The calendar should clearly distinguish:

- Available
- Confirmed
- Pending
- Blocked
- Cancelled
- Completed

Use the visual language defined in `/prototype`.

---

# 19. Court Settings

Admin settings should include:

### Court Information

- Court name
- Description
- Address
- Contact number
- Social links
- Photos

### Operating Hours

Example:

```text
Monday     5:00 PM – 11:00 PM
Tuesday    5:00 PM – 11:00 PM
...
Sunday     8:00 AM – 10:00 PM
```

### Booking Rules

- Minimum booking duration
- Maximum booking duration
- Advance booking limit
- Cancellation rules
- Deposit requirement

### Pricing

- Default hourly price
- Special pricing if needed

---

# 20. Customer Experience Requirements

The customer website must be:

- Mobile-first
- Fast
- Simple
- Easy to understand
- Minimal in required input
- No unnecessary account registration
- Clear about availability
- Clear about pricing
- Clear about payment status
- Clear about booking confirmation

A customer should be able to make a booking without needing instructions.

---

# 21. Admin Experience Requirements

The owner should be able to manage the court from a phone.

Common actions should require as few steps as possible.

For example:

```text
Dashboard
   ↓
Today's Schedule
   ↓
Tap 8:00 PM
   ↓
Booking Details
   ↓
Mark Paid
```

Avoid complicated administrative workflows.

---

# 22. Notifications

The system should support notifications for important booking events.

Potential events:

- Booking created
- Booking confirmed
- Payment received
- Booking cancelled
- Booking rescheduled
- Upcoming booking reminder

Notification channels can be implemented progressively.

Do not make notification integrations a requirement for the initial MVP unless needed.

---

# 23. Booking Rules

The system must enforce:

- Cannot book closed hours
- Cannot book blocked slots
- Cannot book an already reserved slot
- Cannot book dates outside the allowed advance-booking period
- Cannot cancel outside the allowed cancellation period
- Cannot create invalid time ranges
- Cannot create overlapping bookings

Backend validation is mandatory.

---

# 24. Data Model

Minimum entities:

```text
users
courts
court_hours
court_closures
bookings
customers
payments
blocked_slots
notifications
```

If the system only supports one court, do not unnecessarily build multi-court or multi-tenant architecture.

The database can still have a `court_id` if useful for future technical flexibility, but the application should remain a **single-court system**.

---

# 25. Audit / Tracking

Important admin actions should be traceable.

Track:

- Who created booking
- Who updated booking
- Who cancelled booking
- Who changed payment status
- Who blocked/unblocked schedule

Use timestamps on relevant records.

---

# 26. Security

Implement:

- Secure admin authentication
- Authorization for admin actions
- Server-side validation
- CSRF protection where applicable
- Rate limiting for public booking endpoints
- Input validation
- Protection against duplicate submissions
- Secure payment handling
- No exposure of sensitive admin data

Customers should only be able to access their own booking through the booking reference/verification mechanism.

---

# 27. MVP Scope

The first version should contain only the essentials.

### Customer

- Homepage
- Court information
- Pricing
- Schedule
- Booking
- Guest checkout
- Booking confirmation
- Booking lookup
- Cancellation/rescheduling if required

### Admin

- Login
- Dashboard
- Schedule
- Booking management
- Manual booking
- Walk-in booking
- Block schedule
- Payment status
- Court settings
- Operating hours
- Pricing
- Basic revenue summary

---

# 28. Out of Scope for MVP

Do not build:

- Multi-tenant SaaS
- Multiple court owners
- Subscription billing for businesses
- Complex staff management
- Marketplace
- Customer social features
- Chat system
- Loyalty system
- Complex analytics
- Mobile app
- Multiple business locations
- Unnecessary integrations

These can be considered later only if the actual court needs them.

---

# 29. Core Principle

The system should answer three questions immediately:

### Customer

> **Can I play at this time?**

### Owner

> **Who is playing and have they paid?**

### Business

> **How much did we earn and how much of the court is being used?**

Everything else is secondary.

---

# 30. Success Criteria

The system is successful when:

1. A customer can book a court quickly from a phone.
2. Customers can clearly see available and unavailable slots.
3. Double bookings cannot occur.
4. The owner can manage online and walk-in bookings from one schedule.
5. The owner can block unavailable periods.
6. Payment status is easy to understand.
7. The owner can see today's bookings and revenue quickly.
8. The website works well without requiring customers to install an app.
9. The UI follows `/prototype` accurately.
10. The system does not contain unnecessary features that make booking harder.

---

# 31. Development Priority

Implement in this order:

```text
1. Prototype/UI foundation
2. Court settings
3. Operating hours
4. Schedule availability
5. Booking creation
6. Double-booking protection
7. Booking confirmation
8. Admin schedule
9. Manual/walk-in bookings
10. Blocked slots
11. Payment tracking
12. Dashboard
13. Notifications
14. Additional improvements
```

---

# 32. Final Requirement

**Keep this project single-purpose.**

This is a dedicated booking system for **one specific court**.

Do not introduce multi-business, multi-owner, marketplace, or SaaS concepts unless explicitly requested later.

The goal is not to build the biggest booking platform.

The goal is to build the **simplest and most useful booking system for this specific court**.

**The `/prototype` folder is the primary UI/design reference and must be followed throughout implementation.**