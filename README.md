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

Create a Supabase project, then apply the migrations in `supabase/migrations/`
in filename order — either via the Supabase SQL editor (paste each file) or the
Supabase CLI (`supabase db push`). This creates the multi-tenant schema and RLS.

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
