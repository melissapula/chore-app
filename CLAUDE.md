# CLAUDE.md

> Working context for Claude Code (and future-Missa) in this repo.
> Read this first, then `SPEC.md`. **`SPEC.md` is the source of truth** — if the
> code and the spec disagree, fix one of them deliberately; don't let them drift.

---

## What this project is

**Chore App** — a multi-tenant family chore tracker with virtual balances, a
claim/timer competition mechanic for paid chores, required (unpaid) chores that
gate weekly pay, notes, emojis, and short/long-term savings goals.

Ship as an installable **PWA** to our own family first to validate the
timer/competition mechanic, then wrap with Capacitor for the app stores later.

---

## Non-negotiable design pillars (from SPEC §1)

- **Virtual balance, not real money.** The app is a ledger; the parent settles up
  in real life. No money transmission.
- **Multi-tenant from day one.** One account = one household, fully isolated via
  Postgres Row-Level Security keyed on `household_id`.
- **Server-authoritative timers.** Timers are *stored deadlines*, never client
  counters. The backend decides state; the UI only renders `deadline - now`.
- **Ledger-derived balances.** `ledger_entries` is append-only; a balance is
  `sum(delta_cents)`. Never mutate a single balance number.

---

## Stack

| Layer | Choice |
|---|---|
| Database / Auth / Realtime | **Supabase** (Postgres + RLS + Realtime + Auth) |
| Backend API + jobs | **NestJS** (`backend/`) |
| Frontend | **Nuxt** installable **PWA** (`frontend/`) |
| UI components | **`@mfp-design-system/*`** (Missa's Lit web-component design system, from npm) |
| Native wrapper (later) | Capacitor |

### UI / design system

Use the existing **`@mfp-design-system`** components (`<mfp-button>`, `<mfp-input>`,
`<mfp-alert>`, …) — installed via the `all` meta-package. They're Lit custom
elements, registered client-side in `app/plugins/design-system.client.ts`; Nuxt
is told about the `mfp-` prefix via `vue.compilerOptions.isCustomElement`.

Theming is CSS-variable based. Base tokens (`@mfp-design-system/tokens/css`) load
first, then **`app/assets/css/theme-playful.css`** — a bespoke kid-friendly theme
(grape-purple brand, candy-bright status colors, chunky rounded shapes, Nunito
font). To restyle, override semantic tokens there; don't hard-code colors in
components. The theme can later be upstreamed into the design system as
`themes/playful.css` if we want it shared across apps.

Two chore flows share one instance table but use different state sets:
- **Paid:** `OPEN → CLAIMED → IN_PROGRESS → SUBMITTED → APPROVED` (claim/race + timers)
- **Required:** `ASSIGNED → SUBMITTED → CONFIRMED`, or `→ MISSED` at the due date

---

## Repo layout

```
chore-app/
├── SPEC.md                     # design contract — source of truth
├── CLAUDE.md                   # this file
├── backend/                    # NestJS API + cron timer sweep
├── frontend/                   # Nuxt PWA
└── supabase/
    └── migrations/             # schema + RLS (run in order)
```

---

## Build order (from SPEC §8) — work top to bottom

- [ ] **1. Multi-tenant spine.** households + users + auth + RLS.
      → `supabase/migrations/` holds the schema. Apply it, then create a test household.
- [ ] **2. Paid chore state machine.** templates + instances + claim→start→submit→approve.
- [ ] **3. Server-authoritative timers.** stored deadlines + per-minute cron sweep.
- [ ] **4. Ledger + balances.**
- [ ] **5. Required chores + weekly pay gate.**
- [ ] **6. Notes + emojis.**
- [ ] **7. Realtime sync + web push.**
- [ ] **8. Weekly goal bundle engine** (subset-sum over open chores).
- [ ] **9. Savings goal pace calculator.**
- [ ] **10. Polish → Capacitor wrap → store compliance (COPPA, parental gate, privacy).**

> Ship 1–7 to our own family first. Validate the mechanic before paying the store tax.

---

## Conventions (keep these)

- **RLS is the security boundary, not the API.** Every table carries `household_id`
  and is protected by policies. The backend uses the user's JWT so RLS applies;
  only trusted server jobs (the cron sweep) use the service role.
- **Timers = stored deadlines.** Write `start_deadline` / `finish_deadline` /
  `due_date` at transition time. The cron sweep compares them to `now()`. Never
  trust a client-reported elapsed time.
- **Money lives in the ledger.** To change a balance, append a `ledger_entries`
  row. The weekly gate governs *payout release*, not whether money was earned.
- **State transitions are server-side and validated.** A transition checks the
  current state before writing the next one (no illegal jumps).
- **Update `SPEC.md` in the same commit when you change behavior.** The spec leads.

---

## How to run (fill in as pieces land)

```bash
# Backend
cd backend && npm run start:dev

# Frontend
cd frontend && npm run dev
```

Environment: copy `backend/.env.example` → `backend/.env` and
`frontend/.env.example` → `frontend/.env`, then fill in Supabase URL + keys.
Never commit `.env`.
