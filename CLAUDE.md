# CLAUDE.md

> Working context for Claude Code (and future-Missa) in this repo.
> Read this first, then `SPEC.md`. **`SPEC.md` is the source of truth** — if the
> code and the spec disagree, fix one of them deliberately; don't let them drift.

---

## What this project is

**ChoreQuest** — a multi-tenant family chore tracker reskinned as a light RPG.
Kids earn **XP** (the money balance, relabeled at 1 XP = 1¢) for chores, race to
claim paid chores against a timer, and do required (unpaid) chores that gate
weekly pay. XP funds **quests** — personal rewards a kid levels up to, plus
family-wide **guild quests** that pool everyone's XP (with a color-coded per-kid
contribution chart). Kids can also **request** chores for a parent to create.
Plus a never-dropping lifetime **level**, notes, and emojis.

Ship as an installable **PWA** to our own family first to validate the
timer/competition mechanic, then wrap with Capacitor for the app stores later.

---

## Non-negotiable design pillars (from SPEC §1)

- **Virtual balance, not real money.** The app is a ledger; the parent settles up
  in real life. No money transmission.
- **Multi-tenant from day one.** One account = one household, fully isolated via
  Postgres Row-Level Security keyed on `household_id`.
- **Server-authoritative timers.** Timers are _stored deadlines_, never client
  counters. The backend decides state; the UI only renders `deadline - now`.
- **Ledger-derived balances.** `ledger_entries` is append-only; a balance is
  `sum(delta_cents)`. Never mutate a single balance number.

---

## Stack

| Layer                      | Choice                                                                         |
| -------------------------- | ------------------------------------------------------------------------------ |
| Database / Auth / Realtime | **Supabase** (Postgres + RLS + Realtime + Auth) — see hosting note below       |
| Backend API + jobs         | **NestJS** (`backend/`)                                                        |
| Frontend                   | **Nuxt** installable **PWA** (`frontend/`)                                     |
| UI components              | **`@mfp-design-system/*`** (Missa's Lit web-component design system, from npm) |
| Native wrapper (later)     | Capacitor                                                                      |

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

### Hosting note — shared Supabase project, `chore` schema

To stay on Supabase's free tier (2-project cap), this app does **not** get its own
Supabase project. It lives inside the existing **Frula (`fsbo-platform`)** project —
which is empty (no signups) — inside a dedicated **`chore` schema**, fully isolated
from Frula's `public` tables. Auth (`auth.users`) is shared project-wide, which is
fine since Frula has no users.

Consequences to remember:

- Every DB call targets the `chore` schema. Backend clients set `db.schema = 'chore'`;
  the frontend Supabase module sets `clientOptions.db.schema = 'chore'`. So
  `.from('households')` → `chore.households` automatically.
- RPCs: `supabase.schema('chore').rpc('bootstrap_household', {...})`.
- **One-time manual step:** after applying the migrations, expose the schema —
  Supabase Dashboard → Project **Settings → Data API → Exposed schemas** → add
  `chore`. (Older docs said Settings → API; the dashboard moved it under Data API.)
  Without this, PostgREST returns 404 for `chore.*` tables.
- All `chore` objects (tables, enums, helper fns) are namespaced, so there's zero
  collision risk with Frula.

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

- [x] **1. Multi-tenant spine.** households + users + auth + RLS.
      → `supabase/migrations/` holds the schema (in the `chore` schema). Apply it, expose the schema, create a test household.
      → Parent onboards via `bootstrap_household`; parent adds kids via `POST /kids`
      (`backend/src/kids/`, service role). Kid login = username + PIN (see
      `backend/src/kids/kid-auth.ts`, mirrored in `frontend/app/pages/login.vue`).
      Frontend: `/family` (parent roster — add/edit/delete kids, edit own profile,
      co-parent invite), `/dashboard` (role-aware home: parent CTA tiles; kid gets
      the tabbed dashboard, see step 9). `/board` now redirects to `/dashboard`.
- [x] **2. Paid chore state machine.** templates + instances + claim→start→submit→approve.
      → `backend/src/chores/` (templates + spawn) and `backend/src/chore-instances/`
      (the state machine). Auth via `SupabaseAuthGuard`. Atomic claim (compare-and-set) + atomic approve (`approve_paid_instance()` SQL fn, migration 0003).
- [~] **3. Server-authoritative timers.** stored deadlines + per-minute cron sweep.
  → sweep scaffolded in `backend/src/timers/`; revisit finish-timer parent-notify with step 7 push.
- [~] **4. Ledger + balances.** Earnings hit `ledger_entries` on approve
      (`approve_paid_instance()`, migration 0003). Balances are derived (sum of
      deltas): kid sees their **XP total + history** on `/board`; parent sees each
      kid's XP on `/family` and can **Adjust XP** (writes a `parent_adjustment`
      row). Still TODO for full step 4: payout/settle-up flow.
- [x] **5. Required chores + weekly pay gate.** Lifecycle: create/assign a
      required chore (parent `/chores` Required tab → ASSIGNED with a due_date),
      kid marks done on `/board` (→ SUBMITTED), parent confirms (→ CONFIRMED); the
      cron sweep marks overdue ASSIGNED → MISSED. Pay gate: parent `/pay` page
      (per-kid week: earnings + required progress + Release/Hold), kid gate nudge
      on `/board`. Gate is computed live; only the release/hold decision persists.
      Follow-up (optional): an end-of-week cron to snapshot/finalize `weekly_gates`
      and reflect "held" weeks in the spendable balance.
- [x] **6. Notes + emojis.** `components/NoteThread.vue` — a parent↔kid note
      thread on a chore instance (quick-emoji reactions + text), RLS-scoped
      (recipient_id = the chore's kid so siblings don't see it). Expandable via a
      💬 toggle on `/chores` (parent live list) and `/board` (kid's active chores).
      Uses the `notes` table (migration 0001) — no new migration.
- [x] **7. Realtime sync + web push.** Realtime: `/board` (kid) and `/chores`
      (parent) subscribe to `chore.chore_instances` (+ `ledger_entries` on the
      board) via Supabase Realtime — instant updates, RLS-scoped; 30s poll is a
      fallback. Migration 0007 adds those tables to the `supabase_realtime`
      publication. Web push (`backend/src/push/`, VAPID via `web-push`): notify
      parents on submit/mark-done + finish-timer expiry (cron), kids on
      approve/confirm. Subscriptions in `push_subscriptions` (migration 0008).
      Frontend: `usePush()` composable + "Enable notifications" on the dashboard;
      SW handlers in `public/sw-push.js`, pulled into the generated PWA SW via
      `pwa.workbox.importScripts`. VAPID keys in `backend/.env` (public key served
      at `GET /push/vapid-public-key`). If keys are unset, push cleanly no-ops.
- [x] **8. Quests + XP.** Personal spend-to-redeem quests + lifetime levels
      (migration 0009: `quests` table, `quest_redeemed` ledger reason,
      `ledger_entries.quest_id`, `redeem_quest()` RPC). Kid `/quests` page (level
      bar, spendable XP, create + track quests); parent redeems ready quests on
      `/family`. Level derived client-side (`~/utils/level.ts`). Weekly bundle
      engine (`~/utils/bundles.ts`): kid enters a target XP on `/board` → 3
      bundles (fewest / fastest / balanced) over the currently-OPEN pool;
      "Claim these" runs the normal claim flow. (Instance list now joins
      `chores.est_minutes, category`.)
- [x] **9. Guild quests + extras.** Guild quests: `backend/src/guild/` (`GET /guild`
      aggregates progress + per-kid contributions via service role — kids can't read
      siblings' ledgers under RLS; `POST /guild`, `POST /guild/:id/complete`).
      `/guild` page: family goal, hero progress, **color-coded contribution chart**
      + legend (dataviz palette). Pace calculator: `~/utils/pace.ts` on `/quests`
      (quests with a deadline show XP/week + green/yellow/red). Chore requests
      (migration 0010, `chore_requests`): `/requests` — kid pitches a chore, parent
      approves (→ creates a paid chore, stamps `chore_id`) / declines. Guild reuses
      `quests` (`scope='guild'`). Lifetime level curve: L1→L2 = 1000 XP, +10%
      compounding per level (`~/utils/level.ts`).
- [x] **9b. Family-management + dashboard UX** (layered on top of 1–9).
      → **Kid tabbed dashboard** (`components/KidDashboard.vue`, rendered on
      `/dashboard`): Main Quest (required + gate nudge), Side Quest (accepted +
      up-for-grabs paid + bundle planner + XP history), Guild Quest (progress +
      contribution chart). `/board` redirects here.
      → **Parent dashboard** (`/dashboard`): CTA tiles (full-width via mfp-button
      `::part(button)`) — Manage chores, Kids' progress, Family, Weekly pay, Guild,
      Chore ideas.
      → **Kids' progress** (`/progress`, parent): each kid's level, quest progress,
      and guild contribution at a glance (client-side; parent RLS + `GET /guild`).
      → **Manage chores** (`/chores`): custom chore not in the dropdown
      (`ChorePicker.vue` pins "Create custom chore" at the top of the filtered
      list), a bigger emoji picker (`EmojiField.vue`), **edit** a template
      (`PATCH /chores/:id`), **archive/unarchive** a template (same PATCH with
      `{ active }` — archived templates drop into an "Archived" section and can't
      be spawned; there's no hard template delete by design), and **remove** a
      live instance from the pool (`DELETE /chore-instances/:id`).
      → **Family** (`/family`): **edit/delete a kid** (`PATCH`/`DELETE /kids/:id`,
      service role — delete cascades via `auth.users`), and a parent **edits their
      own profile** (name/avatar straight to `chore.users` under RLS `id = auth.uid()`).
- [ ] **10. Polish → Capacitor wrap → store compliance (COPPA, parental gate, privacy).**

> Ship 1–7 to our own family first. Validate the mechanic before paying the store tax.

### Paid-flow API (step 2)

All routes require `Authorization: Bearer <supabase-jwt>` (SupabaseAuthGuard resolves
household + role). The caller must have a `chore.users` row — call the
`bootstrap_household` RPC once after sign-up to create it.

| Method + path                       | Who     | Effect                                           |
| ----------------------------------- | ------- | ------------------------------------------------ |
| `POST /kids`                        | parent  | Add a kid: admin-creates auth user (service role) + `chore.users` row. Username + PIN login. |
| `PATCH /kids/:id`                    | parent  | Edit a kid (service role): name/avatar → `chore.users`; new username/PIN also re-derive the Auth email/password. |
| `DELETE /kids/:id`                   | parent  | Delete a kid (service role): admin-delete the Auth user; `auth.users → chore.users` cascade removes their ledger, quests, notes. |
| `POST /chores`                      | parent  | Create a chore template                          |
| `GET /chores`                       | member  | List household templates                         |
| `PATCH /chores/:id`                 | parent  | Edit a template (title, icon, XP, assignee, due, gate…). `chore_type` is not editable. |
| `POST /chores/:id/instances`        | parent  | Spawn a paid instance (→ OPEN)                   |
| `GET /chore-instances`              | member  | The household's live pool                        |
| `DELETE /chore-instances/:id`       | parent  | Remove a live instance from the pool (RLS `instances_delete_parent`; ledger FK set null preserves earned XP). |
| `POST /chore-instances/:id/claim`   | kid     | OPEN → CLAIMED (starts start-timer; atomic race) |
| `POST /chore-instances/:id/start`   | claimer | CLAIMED → IN_PROGRESS (starts finish-timer)      |
| `POST /chore-instances/:id/submit`  | claimer | IN_PROGRESS → SUBMITTED                          |
| `POST /chore-instances/:id/approve` | parent  | SUBMITTED → APPROVED + ledger credit (atomic)    |
| `POST /chore-instances/:id/release` | parent  | CLAIMED/IN_PROGRESS/SUBMITTED → OPEN             |
| `POST /chore-instances/:id/mark-done` | kid   | ASSIGNED → SUBMITTED (required; the assigned kid) |
| `POST /chore-instances/:id/confirm` | parent  | SUBMITTED → CONFIRMED (required; no ledger)      |

`POST /chores/:id/instances` spawns a **paid** instance (→ OPEN) or, for a
required template, an **ASSIGNED** instance to its kid with a `due_date` from
`due_type`. The cron sweep flips ASSIGNED past `due_date` → MISSED.

Weekly pay gate (step 5, `backend/src/weekly-gates/`):

| Method + path                | Who    | Effect                                              |
| ---------------------------- | ------ | --------------------------------------------------- |
| `GET /weekly-gates?week=…`   | member | Per-kid gate for a week (computed live from data)   |
| `POST /weekly-gates/decide`  | parent | Record release/hold → upsert `weekly_gates` row     |

The gate is computed **live** (no end-of-week cron yet): per kid, count their
`gates_pay` required instances due that week (done = CONFIRMED) + sum that week's
`chore_approved` ledger. Only the parent's release/hold **decision** is persisted
(service-role upsert — `weekly_gates` has no insert RLS policy by design).

---

## Conventions (keep these)

- **RLS is the security boundary, not the API.** Every table carries `household_id`
  and is protected by policies. The backend uses the user's JWT so RLS applies;
  only trusted server jobs (the cron sweep) use the service role.
- **Timers = stored deadlines.** Write `start_deadline` / `finish_deadline` /
  `due_date` at transition time. The cron sweep compares them to `now()`. Never
  trust a client-reported elapsed time.
- **Money lives in the ledger.** To change a balance, append a `ledger_entries`
  row. The weekly gate governs _payout release_, not whether money was earned.
- **State transitions are server-side and validated.** A transition checks the
  current state before writing the next one (no illegal jumps). Because the
  frontend can hit PostgREST directly, this is enforced in the DB, not just the
  API: RLS lets only **parents** `UPDATE chore_instances` (approve/confirm/
  release), and every **kid** transition (claim/start/submit/mark-done) runs
  through a `SECURITY DEFINER` RPC (`claim_instance` etc., migration 0011) that
  locks the row, re-authorizes the caller, and validates state. Never add a kid
  write path that bypasses those RPCs. Self-edits to `users` can't change
  `role`/`household_id` (pinned in `users_update_self`).
- **Update `SPEC.md` in the same commit when you change behavior.** The spec leads.
- **Phone-first — keep it mobile-friendly.** The app is used mostly on phones (an
  installable PWA). Pages use `.wrap { max-width: ~32rem; padding: 0 1rem }` so they
  reflow to phone width with no horizontal scroll — never let a page overflow at
  360px. Tappable controls need a ≥44×44px hit area; small icon buttons
  (`.notes-toggle` / `.edit-btn`) + nav `.tab`s get topped up to 44px by a global
  rule in `theme-playful.css` (it only sets min-size/display/alignment, so it
  layers on scoped styles without `!important` — keep control class names in sync
  there). Mobile/PWA `<meta>` (theme-color, apple-*) lives in `nuxt.config` `app.head`.
- **Pre-commit hook (husky + lint-staged).** On commit, `.husky/pre-commit` runs
  lint-staged inside `backend/` and `frontend/` separately (monorepo — each uses
  its own ESLint config + binaries). Staged code gets `eslint --fix` + `prettier
--write`. Root-level docs aren't auto-formatted; run `npm run format` for that.

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

## How to deploy

See **`DEPLOY.md`** — the click-by-click for going live: backend → **Railway**
(always-on, so the per-minute timer cron keeps running; `backend/railway.json`
pins the build/start), frontend → **Vercel** (free), Supabase already hosted.
The one gotcha to remember: deploy the backend first for its URL, then set the
frontend's `API_BASE` to it and the backend's `FRONTEND_ORIGIN` to the Vercel URL
(the backend refuses to boot in prod without `NODE_ENV=production` + `FRONTEND_ORIGIN`),
and add the Vercel URL to Supabase Auth → URL Configuration so email links redirect back.
