# ChoreQuest — Design Document

A multi-tenant family chore tracker reskinned as a light RPG. Kids earn **XP** for chores, race to **claim** paid chores against a timer, and complete **required** chores that gate weekly pay. XP funds **quests** — personal rewards a kid levels up to (a new video game), plus family-wide **guild quests** that pool everyone's XP toward a shared reward. Rounded out by a never-dropping lifetime **level**, notes, and emojis.

> **XP is the balance, relabeled.** Under the hood ChoreQuest is still an honest money ledger in cents (parent settles up in real life — no money transmission). The UI just renders that balance as **XP** at 1 XP = 1¢. Same number, gamified label.

---

## 1. Guiding decisions (already made)

- **Virtual balance**, not real money. No Google Wallet / money transmission. Parent settles up in real life; the app is the ledger.
- **XP = that balance, gamified.** Earnings are shown as XP (1 XP = 1¢, ratio tunable per household). Spendable XP funds reward **quests**; a separate lifetime **level** (total XP ever earned) never drops. See §4d.
- **Multi-tenant from day one.** One account = one household, fully isolated. Ship PWA to your family first, wrap with Capacitor for the stores later once the mechanic is validated.
- **Server-authoritative timers.** A closed app or swapped phone can't cheat expiry. The app only _displays_ countdowns; the backend decides state.
- **Stack:** NestJS + Supabase (Postgres + Realtime + Auth), Nuxt frontend as an installable PWA. Capacitor wrapper later for App Store / Play Store.

---

## 2. Chore lifecycle (state machine)

```
                 ┌──────────────────────────────────────────┐
                 │                                            │
                 ▼                                            │
   ┌────────┐  claim   ┌─────────┐  start   ┌─────────────┐  │
   │  OPEN  │ ───────▶ │ CLAIMED │ ───────▶ │ IN_PROGRESS │  │
   └────────┘          └─────────┘          └─────────────┘  │
       ▲                    │                      │         │
       │   24h start-timer  │   submit             │         │
       │   expires ─────────┘                      ▼         │
       │                                     ┌───────────┐   │
       │  parent rejects / releases          │ SUBMITTED │   │
       └─────────────────────────────────────┤           │   │
       │                                     └───────────┘   │
       │                                           │         │
       │  2h finish-timer expires ──▶ PARENT DECIDES│ approve │
       │  (notify parent, they choose)             ▼         │
       │                                     ┌───────────┐   │
       └──────────────  release  ────────────┤ APPROVED  │───┘
                                             └───────────┘
                                              credit balance,
                                              close instance
```

**States:**

- `OPEN` — any eligible kid can claim.
- `CLAIMED` — one kid holds it. **Start-timer** runs (default 24h). Expires → back to `OPEN`.
- `IN_PROGRESS` — kid tapped "started." **Finish-timer** runs (default 2h). Expires → **parent notified to decide** (your choice): extend, release, or approve anyway.
- `SUBMITTED` — kid says done; awaiting parent.
- `APPROVED` — balance credited, instance closed.
- (Parent can `release` or `reject` from most states, sending it back to `OPEN`.)

**Both timer defaults (24h / 2h) are family-level defaults, overridable per chore.**

> This claim/race state machine applies to **paid** chores. **Required** chores use a much simpler flow (§4a) — no grabbing, no race timer, just assigned → done → confirmed.

---

## 3. Recurring vs one-time

A chore is a **template**; each occurrence is an **instance**. A one-time chore has a single instance. A recurring chore (e.g. "dishes," daily) spawns a fresh instance on its schedule. The state machine above runs on _instances_. This matters for goals — weekly goals can lean on repeatable chores, not just one-offs.

---

## 3a. Required (unpaid) chores & the weekly pay gate

Two categories of chore now exist, set by `chore_type`:

- **Paid** — optional, has a dollar value, uses the claim/race/timer state machine above. Kids compete for these.
- **Required** — expected, unpaid ($0), **assigned to a specific kid** (no grabbing, no sibling race). Think "make your bed," "feed the dog." These are the price of admission.

**Required-chore lifecycle (simple):**

```
   ┌──────────┐  kid marks   ┌───────────┐  parent    ┌───────────┐
   │ ASSIGNED │ ───────────▶ │ SUBMITTED │ ─────────▶ │ CONFIRMED │
   └──────────┘   done       └───────────┘  confirms  └───────────┘
        │
        │ due_type passes (end of day / week) without completion
        ▼
   ┌──────────┐
   │ MISSED   │  ← counts against the weekly gate
   └──────────┘
```

No claim timer, no 24h/2h race — just a **due date** (`end_of_day` or `end_of_week`) and a status.

**The pay gate.** A required chore can have `gates_pay = true`. At the end of each week, the app checks: did this kid complete all their pay-gating required chores?

- If **yes** → the week's earned money releases normally.
- If **no** → the app **notifies you (the parent) to decide** for that kid's week. You see "Emma earned $18 this week, but 2 required chores are undone" and choose: release the money, hold it until they finish, or release part. (Your chosen behavior — parent decides, nothing is automatically forfeited.)

This keeps you in control and never silently punishes a kid — but it ties the expected stuff to the fun earning stuff, which is exactly the leverage you wanted.

**How it touches the rest of the app:**

- **Balances/ledger:** required chores never create ledger entries (they're $0). The gate affects _when_ existing paid earnings release, via a `payout`/`hold` decision — not the earning itself.
- **Goals:** the savings-goal view can surface "you've earned enough this week, but required chores are holding it — finish them to stay on pace." Strengthens the goal loop.
- **Weekly bundle engine:** required chores are excluded from paid bundles (they're not worth money), but the goal screen can remind the kid they still owe them.

---

## 3b. Who can do which chore (eligibility) & risky-chore warnings

**Eligibility is fully parent-controlled, per chore — no age system decides it.**

- **Paid chores:** each chore has an `eligible_kid_ids` list. You pick exactly which kids it's available to. "Mow lawn" → Madison + Olivia only, so it never appears in Archer's pool and he can't claim it. Leave it empty/null to make a chore open to all the kids.
- **Required chores:** assigned to one specific kid by definition (`assigned_kid_id`), so eligibility is inherent.

That's the whole gate: you decide, chore by chore. Nothing unlocks or locks automatically based on age.

**The risky-chore safety net (separate from eligibility).** Some chores are genuinely hazardous for a young child — mower, stove, ladder, cleaning chemicals. Mark those `is_risky = true`. This does **not** block anything. It just means: when you go to make a risky chore available to a kid under a sensible threshold (say 12), the app shows a soft confirmation — _"Mow lawn is marked risky. Archer is 9. Make it available to him anyway?"_ — and you tap through if you mean it. It's a tap on the shoulder, not a wall. (This is why kids have an optional `birthdate` — used only to decide whether to show that warning, never to gate the chore.)

When this becomes a store app for other families, that warning is also a nice trust/liability feature: the app never silently lets a 7-year-old get assigned the chainsaw without the parent explicitly confirming.

---

## 4. Data model

Every table below carries a `household_id` for tenant isolation (enforced via Supabase Row Level Security). Only the key columns are shown.

### households

| column                    | type        | notes                         |
| ------------------------- | ----------- | ----------------------------- |
| id                        | uuid pk     |                               |
| name                      | text        | "The Freundschuh-Pula Family" |
| default_start_timer_mins  | int         | default 1440 (24h)            |
| default_finish_timer_mins | int         | default 120 (2h)              |
| created_at                | timestamptz |                               |

### users

| column       | type      | notes                                                                                |
| ------------ | --------- | ------------------------------------------------------------------------------------ |
| id           | uuid pk   | maps to Supabase Auth user                                                           |
| household_id | uuid fk   |                                                                                      |
| display_name | text      |                                                                                      |
| role         | enum      | `parent` \| `kid`                                                                    |
| avatar_emoji | text      |                                                                                      |
| birthdate    | date null | kids only; used **only** to power the risky-chore warning, never to gate eligibility |

### chores (templates)

| column            | type        | notes                                                                                                 |
| ----------------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| id                | uuid pk     |                                                                                                       |
| household_id      | uuid fk     |                                                                                                       |
| title             | text        | plain name ("Sweep floors") — canonical, used in lists/search                                         |
| quest_title       | text null   | gamified name kids see ("Sweep floors for booby traps"); falls back to `title`                        |
| icon_emoji        | text        | picker value                                                                                          |
| chore_type        | enum        | `paid` \| `required` — see §4a                                                                        |
| value_cents       | int         | dollar value in cents; 0 for required                                                                 |
| est_minutes       | int         | powers "fastest path" goal bundles                                                                    |
| category          | text        | kitchen, outdoor, pet, etc.                                                                           |
| recurrence        | enum        | `once` \| `daily` \| `weekly` \| `custom`                                                             |
| recurrence_config | jsonb       | days of week, etc.                                                                                    |
| start_timer_mins  | int null    | null = use household default (paid only)                                                              |
| finish_timer_mins | int null    | null = use household default (paid only)                                                              |
| gates_pay         | bool        | required chores only: does missing it hold that week's pay?                                           |
| is_risky          | bool        | flags a chore as risky (mower, stove, ladder) → parent gets a warning before assigning to a young kid |
| assigned_kid_id   | uuid null   | required chores: the specific kid it belongs to                                                       |
| eligible_kid_ids  | uuid[] null | paid chores: **parent picks exactly which kids this is available to.** null = all kids                |
| due_type          | enum        | required chores: `end_of_day` \| `end_of_week`                                                        |
| active            | bool        |                                                                                                       |

> **Gamified titles.** Every chore carries a plain `title` (canonical, used in
> lists/search) and an optional `quest_title` — the fun, quest-flavored name kids
> see: "Sweep floors" → _"Sweep floors for booby traps."_ Falls back to `title`
> when unset. The create-chore form offers a "✨ make it epic" button that suggests
> a flavored name (a template/word-bank generator to start; could call an LLM
> later). Pure display flavor — it never changes a chore's type, XP value, or state
> machine.

### chore_instances (the live, claimable items)

| column               | type             | notes                                                                                             |
| -------------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| id                   | uuid pk          |                                                                                                   |
| household_id         | uuid fk          |                                                                                                   |
| chore_id             | uuid fk          |                                                                                                   |
| state                | enum             | paid: OPEN/CLAIMED/IN_PROGRESS/SUBMITTED/APPROVED · required: ASSIGNED/SUBMITTED/CONFIRMED/MISSED |
| claimed_by           | uuid null        | kid user id (paid)                                                                                |
| claimed_at           | timestamptz null |                                                                                                   |
| start_deadline       | timestamptz null | claimed_at + start_timer — authoritative (paid)                                                   |
| started_at           | timestamptz null |                                                                                                   |
| finish_deadline      | timestamptz null | started_at + finish_timer — authoritative (paid)                                                  |
| assigned_to          | uuid null        | kid id (required chores)                                                                          |
| due_date             | timestamptz null | required chores: end of day/week — authoritative                                                  |
| gates_pay            | bool             | snapshot from template: does this count toward the weekly gate                                    |
| submitted_at         | timestamptz null |                                                                                                   |
| approved_at          | timestamptz null | approved (paid) / confirmed (required)                                                            |
| approved_by          | uuid null        | parent id                                                                                         |
| value_cents_snapshot | int              | value locked at instance creation (0 for required)                                                |

> **Timers = stored deadlines, not counters.** The backend compares `now()` to the deadline. A cron sweep (every minute, `@nestjs/schedule`) releases expired `CLAIMED` paid instances, notifies parents about expired `IN_PROGRESS` ones, and marks required instances `MISSED` when their `due_date` passes. The UI countdown is just `deadline - now`.

### balances / ledger

Keep a **ledger** (append-only) and derive the balance — cleaner than mutating a single number.

**ledger_entries**

| column            | type        | notes                                                                   |
| ----------------- | ----------- | ----------------------------------------------------------------------- |
| id                | uuid pk     |                                                                         |
| household_id      | uuid fk     |                                                                         |
| kid_id            | uuid fk     |                                                                         |
| delta_cents       | int         | + for earned XP, − for quest redemption / payout                        |
| reason            | enum        | `chore_approved` \| `quest_redeemed` \| `parent_adjustment` \| `payout` |
| chore_instance_id | uuid null   |                                                                         |
| quest_id          | uuid null   | set on a `quest_redeemed` entry                                         |
| note              | text null   | e.g. "bonus for extra effort"                                           |
| created_at        | timestamptz |                                                                         |

Kid's spendable balance = `sum(delta_cents where kid_id = X)`.

> **On "held" money:** earnings are already in the ledger as `chore_approved` entries the moment you approve a paid chore — so the _balance_ is accurate. The gate governs whether that balance is **released for payout**, not whether it's earned. A weekly gate record (below) tracks the parent's decision; an actual cash payout is just a `payout` ledger entry when you settle up.

### weekly_gates (one row per kid per week)

| column         | type             | notes                                                    |
| -------------- | ---------------- | -------------------------------------------------------- |
| id             | uuid pk          |                                                          |
| household_id   | uuid fk          |                                                          |
| kid_id         | uuid fk          |                                                          |
| week_start     | date             |                                                          |
| required_total | int              | # of pay-gating required chores that week                |
| required_done  | int              | # completed                                              |
| status         | enum             | `met` \| `unmet` \| `parent_released` \| `parent_held`   |
| earned_cents   | int              | paid earnings that week (for the parent's decision view) |
| decided_by     | uuid null        | parent who released/held                                 |
| decided_at     | timestamptz null |                                                          |

At week's end the cron sweep fills this in: if `required_done = required_total` → `met` (money flows). Otherwise `unmet` → **notify parent**, who sets `parent_released` or `parent_held`.

### notes (parent ↔ kid thread)

| column            | type        | notes                                         |
| ----------------- | ----------- | --------------------------------------------- |
| id                | uuid pk     |                                               |
| household_id      | uuid fk     |                                               |
| chore_instance_id | uuid null   | note attached to a chore, or null for general |
| author_id         | uuid fk     |                                               |
| recipient_id      | uuid null   |                                               |
| body              | text        |                                               |
| created_at        | timestamptz |                                               |

### quests (personal reward quests + family guild quests)

Formerly "goals." A **quest** is a reward target priced in **XP**. Two scopes share one table, set by `scope`:

| column       | type             | notes                                                       |
| ------------ | ---------------- | ----------------------------------------------------------- |
| id           | uuid pk          |                                                             |
| household_id | uuid fk          |                                                             |
| scope        | enum             | `personal` \| `guild`                                       |
| kid_id       | uuid null        | owning kid (personal); **null for guild** (whole household) |
| title        | text             | "New game console"                                          |
| reward       | text null        | what the parent grants on completion                        |
| target_xp    | int              | XP cost (stored in cents; 1 XP = 1¢)                        |
| status       | enum             | `active` \| `redeemed` \| `archived`                        |
| started_at   | timestamptz      | guild quests count XP earned **from here** forward          |
| deadline     | date null        | optional; drives the personal-quest pace calculator         |
| redeemed_at  | timestamptz null |                                                             |
| created_at   | timestamptz      |                                                             |

See §4d for the full mechanics (personal spend-to-redeem, lifetime levels, guild pooling, and the contribution chart).

---

## 4d. Quests, XP & levels

**XP = the ledger balance, relabeled.** The ledger stays honest money in cents; the UI shows it as XP at **1 XP = 1¢** (ratio tunable per household later). "+$0.50 earned" renders as "+50 XP." A parent can still settle up in cash (a `payout` entry) or grant a reward — same underlying number.

**Personal quests — spend to redeem.** A kid's spendable XP = `sum(delta_cents)` (their ledger balance). Progress toward a personal quest = `min(spendable_xp, target_xp)`. When spendable ≥ target the quest is **redeemable**: the parent grants the reward in real life and the app writes a negative `quest_redeemed` ledger entry for `target_xp`, dropping spendable XP and closing the quest. No envelope allocation — it's a store, not sub-accounts, so two quests can both read "ready" against the same balance and redeeming one may un-ready the other.

**Lifetime level — never drops.** Separate from spendable XP, each kid has a **Level** derived from _lifetime XP ever earned_ = `sum(delta_cents where delta_cents > 0)`. Spending on quests never lowers it — it's pure progression/bragging rights, computed from the ledger (not stored), against a tunable level-threshold table (rising XP per level).

**Guild quests — everyone's XP auto-counts.** A `scope=guild` quest belongs to the household (no `kid_id`); only one is active at a time. Every positive XP any member earns **after `started_at`** counts toward it automatically, and **personal balances are untouched** (the parent funds the family reward). Progress = `sum(delta_cents where delta_cents > 0 and created_at >= started_at)` across the household, capped at `target_xp`.

**Guild contribution chart.** The guild-quest view shows a **color-coded breakdown of who contributed what**: a segmented progress bar (each kid a colored segment) plus a legend with per-kid XP totals — computed by grouping those positive ledger deltas since `started_at` by `kid_id`. Each kid gets a **stable chart color** (`users.chart_color`, or derived from a fixed palette by join order) so the same child is the same color everywhere. Build it per the dataviz guidance (accessible categorical palette, light/dark-safe).

---

## 4e. Chore requests (kid-initiated)

Kids can **pitch a chore** — "can you make raking a task I can do?" — instead of only claiming ones the parent created. A request is a lightweight proposal the parent turns into a real chore (or declines).

### chore_requests

| column       | type             | notes                                                    |
| ------------ | ---------------- | -------------------------------------------------------- |
| id           | uuid pk          |                                                          |
| household_id | uuid fk          |                                                          |
| requested_by | uuid fk          | the kid                                                  |
| title        | text             | what they want to do                                     |
| note         | text null        | why / details ("the yard's covered in leaves")           |
| suggested_xp | int null         | optional: what they think it's worth                     |
| status       | enum             | `pending` \| `approved` \| `declined`                    |
| resolved_by  | uuid null        | parent who acted                                         |
| chore_id     | uuid null        | the chore created on approval (links request → template) |
| resolved_at  | timestamptz null |                                                          |
| created_at   | timestamptz      |                                                          |

On **approve**, the parent is dropped into the normal create-chore form pre-filled from the request (title/xp), and the resulting `chores.id` is stamped back onto the request. On **decline**, the parent can leave a note. Parents get a notification for new requests; kids get one when theirs is resolved (§6).

---

## 5. The quest engines

### Weekly bundle engine (subset-sum, family scale)

Input: target $, and currently `OPEN` + eligible + recurring-available chores.
Output: 3 labeled bundles that hit/exceed target, differentiated by:

- **Fewest chores** — biggest values first.
- **Fastest** — lowest total `est_minutes`.
- **Balanced** — spread across categories / biased to chores this kid usually does.

At a couple dozen chores this is computationally trivial — a simple generator, no heavy algorithm. Recompute against what's _currently open_ (siblings claim things), and let a kid **reserve** a suggested chore, which just runs your normal claim flow. If less than target $ is available: say so honestly ("Only $14 available right now").

### Personal-quest pace calculator

`required_per_week = (target_xp − progress_xp) / weeks_remaining`

- Recalculates as they earn — get ahead, next week's number drops.
- On-track signal: green / yellow / red vs actual pace, with the honest catch-up number.
- Feasibility: if the pace exceeds realistically available chores, gently suggest a later date or bigger weekly commitment.

---

## 6. Realtime & notifications

- **Supabase Realtime** pushes instance state changes to every phone. Kid claims a chore → it vanishes from siblings' screens live. Solves the "no one else could grab it" sync problem for free.
- **Web Push** (works in an installed PWA) for: claim expired, chore approved (+50 XP), new note, quest redeemable, guild-quest milestone, a kid's new chore request (to the parent) and its resolution (to the kid), parent-decision-needed on an expired finish-timer.

---

## 7. Roles & permissions (RLS)

- **Parent:** create/edit chores, set timer defaults + per-chore overrides, approve/reject/release, adjust balances, view all kids' goals, settle payouts.
- **Kid:** claim / start / submit, leave & read notes, set own goals, allocate own balance. Sees only their own balance + household chore pool.
- Enforced with Supabase Row Level Security keyed on `household_id` and `role`.

---

## 8. Suggested build order

1. Households + users + auth + RLS (the multi-tenant spine).
2. Paid chore templates + instances + the state machine (claim → start → submit → approve).
3. Server-authoritative timers (stored deadlines + cron sweep).
4. Ledger + balances.
5. Required chores + the weekly pay gate (assigned → done → confirmed; end-of-week gate check → notify parent).
6. Notes + emojis.
7. Realtime sync + web push.
8. Quests + XP — personal reward quests (spend-to-redeem), lifetime levels, and the weekly bundle engine (suggest chores to hit an XP target).
9. Guild quests (household XP pooling + color-coded contribution chart), the personal-quest pace calculator, and kid-initiated chore requests.
10. Polish, then Capacitor wrap + store compliance (COPPA, parental gates, privacy policy).

Ship steps 1–7 to your own family first. Validate the timer/competition mechanic with real kids before paying the store + compliance tax.
