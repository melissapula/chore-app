# Chore App

A multi-tenant family chore tracker: kids earn a **virtual balance** by claiming
paid chores in a timed claim → start → submit → approve race, required (unpaid)
chores gate the weekly payout, and savings/weekly goals turn earnings into a
plan. The parent settles up in real life — the app is the ledger.

Built to ship as an installable **PWA** first, wrapped with Capacitor for the app
stores later.

> **The design contract is [`SPEC.md`](./SPEC.md).** It is the source of truth.
> Start there. Working conventions live in [`CLAUDE.md`](./CLAUDE.md).

## Stack

- **Supabase** — Postgres, Row-Level Security, Realtime, Auth
- **NestJS** (`backend/`) — API + server-authoritative timer cron
- **Nuxt PWA** (`frontend/`) — installable app
- **`@mfp-design-system`** — Lit web-component UI kit + a bespoke kid-friendly "playful" theme

## Repo layout

```
backend/              NestJS API + cron timer sweep
frontend/             Nuxt PWA
supabase/migrations/  Postgres schema + RLS policies (run in order)
```

## Getting started

### 1. Database (Supabase)

This app shares the existing **Frula (`fsbo-platform`)** Supabase project to stay on
the free tier — its tables live in an isolated **`chore` schema**, not `public`.

1. Apply the migrations in `supabase/migrations/` in filename order (Supabase SQL
   editor, or `supabase db push`). They create the `chore` schema, all tables, RLS,
   and the grants.
2. **Expose the schema:** Dashboard → Project Settings → API → **Exposed schemas** →
   add `chore` (required, or PostgREST 404s on the app tables).

See the hosting note in [`CLAUDE.md`](./CLAUDE.md) for why and the client wiring.

### 2. Backend

```bash
cd backend
cp .env.example .env      # fill in SUPABASE_URL + keys
npm install
npm run start:dev
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env      # fill in SUPABASE_URL + anon key
npm install
npm run dev
```

## Status

Greenfield scaffold. See the build order in [`CLAUDE.md`](./CLAUDE.md) — currently
at **step 1: the multi-tenant spine** (schema + RLS).
