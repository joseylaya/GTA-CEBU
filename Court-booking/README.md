# Picklr Cebu — two-court frontend demo

A polished, frontend-first single-court booking experience for customers and court owners. The demo uses realistic in-memory data and is ready to deploy as a static Vite application on Vercel.

## Run locally

```bash
npm install
npm run dev
```

Production validation:

```bash
npm run check
npm run build
```

## Demo routes

- `/` — public court website
- `/book` — customer booking flow
- `/booking/lookup` — booking lookup (try `PK7M42` and `09176241183`)
- `/admin/login` — owner sign-in demo
- `/admin` — owner dashboard
- `/admin/schedule` — interactive schedule and walk-in/block-slot tools
- `/admin/bookings`, `/admin/customers`, `/admin/payments`, `/admin/settings`

The owner login is intentionally a visual demo; any completed credentials continue to the dashboard.

## Frontend-first architecture

UI, layouts, mock records, formatting, and interactive state are separated under `resources/js`. The current static entry point uses React Router so the sales demo can run on Vercel without a PHP server. In the backend phase, page data can be replaced by Laravel/Inertia props while keeping the page and component layer.

No real authentication, payment processing, notifications, APIs, or persistence are included in this phase. Refreshing the browser restores the seed demo data.

The public chat widget temporarily reuses the existing ALAS Support service in `AlasProj`. A same-origin serverless proxy keeps the guest support token in an HTTP-only cookie; no Gemini or Supabase credentials are exposed to the browser. Set `ALAS_MANAGEMENT_URL` to override the default deployed management URL. Commerce actions are deliberately excluded from the court experience.

## Vercel

Import this directory as a Vercel project. The default Vite build produces `dist`; `vercel.json` provides history fallback for all client-side routes. No secrets are required for the demo.
