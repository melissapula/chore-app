# Deploying ChoreQuest (Vercel + Supabase + a Node backend)

Goal: get a live, HTTPS URL your family can open on their phones and **Add to Home
Screen** as an installable app.

The app is three pieces. One is already live:

| Piece                | Where it runs                        | Status                          |
| -------------------- | ------------------------------------ | ------------------------------- |
| **Database + Auth**  | Supabase (shared Frula project)      | ✅ already live (migrations applied, `chore` schema exposed) |
| **Backend API + cron** | **Render (free)** for testing, or **Railway** (always-on) for real | set up in Part A |
| **Frontend PWA**     | **Vercel** (free tier)               | set up in Part B                |

## Pick your path first

There are two ways to host the backend, and you can start free:

- **🧪 Testing path — Render free tier ($0).** Recommended for validating the app
  with your family. The backend **sleeps when idle and wakes on the first tap**
  (~30–50s cold start, then snappy for the rest of the session). Everything in the
  core loop works: adding kids, the claim race, start/submit/approve, XP, levels,
  quests, guild. The only thing that doesn't run reliably is the **per-minute timer
  sweep** — see the box below; it's background hygiene, not the core loop.
- **🚀 Always-on path — Railway (~$5/mo).** For when the app is solid and you want
  the timer sweep running 24/7. Same steps, different host.

> **What the always-on timer sweep actually does** (`@Cron(EVERY_MINUTE)`), and what
> you lose on the free/testing path when it doesn't run:
>
> 1. **Abandoned claim → back to OPEN** (a kid claimed but never started). Without
>    it a claim can get stuck — but the parent has a manual **Release** button to
>    free it.
> 2. **Finish-timer expired → ping the parent** (a notification only, no state change).
> 3. **Overdue required chore → MISSED** (feeds the weekly pay gate). Without it,
>    overdue required chores don't auto-mark missed.
>
> None of these break the core experience, so the free path is fine for testing.
> The **"chore already taken → show a message + refresh"** behavior is *not* part of
> the sweep — it's an atomic claim check that always works, on either path.

You'll deploy the **backend first** (to get its URL), then the **frontend**
(pointing at that URL), then do one small **wire-up + redeploy** so CORS and
Supabase auth know the real URLs.

---

## Before you start — gather your secrets

You already have these in `backend/.env` and `frontend/.env` locally. You'll paste
the same values into Railway/Vercel (never commit `.env`). Have them handy:

- `SUPABASE_URL` — the Frula project URL (`https://<ref>.supabase.co`)
- `SUPABASE_ANON_KEY` (frontend calls this `SUPABASE_KEY`) — the anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` — **secret**, backend only
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — for web push
  (if you never set these up, push just no-ops; you can add them later)

Find the Supabase keys in the Supabase dashboard → your Frula project →
**Settings → API**.

**Which branch ships?** All the current work is on `chorequest-onboarding-and-chores`.
Simplest clean setup: merge it to `main` and let both hosts deploy from `main`.
Or, skip the merge and just point your backend host + Vercel at the
`chorequest-onboarding-and-chores` branch. Either works — just be consistent.

The **same env vars** apply to either backend host below:

| Variable                    | Value                                                        |
| --------------------------- | ------------------------------------------------------------ |
| `NODE_ENV`                  | `production`                                                  |
| `SUPABASE_URL`              | your Frula project URL                                        |
| `SUPABASE_ANON_KEY`         | your anon key                                                 |
| `SUPABASE_SERVICE_ROLE_KEY` | your service-role key (secret)                                |
| `VAPID_PUBLIC_KEY`          | your VAPID public key (optional)                              |
| `VAPID_PRIVATE_KEY`         | your VAPID private key (optional, secret)                    |
| `VAPID_SUBJECT`             | `mailto:you@example.com` (optional)                          |
| `FRONTEND_ORIGIN`           | a **placeholder** for now, e.g. `https://placeholder.vercel.app` — you'll swap in the real Vercel URL in Part C |

> Don't set `PORT` — both hosts inject it automatically and the app reads it.
> `NODE_ENV=production` **and** `FRONTEND_ORIGIN` are both required, and the app
> **refuses to boot** in production if `FRONTEND_ORIGIN` is empty. You don't have
> the Vercel URL yet, so set a throwaway placeholder now (CORS being wrong is
> harmless until the frontend exists) and replace it in Part C.

---

## Part A — Backend

Do **one** of A1 (free, for testing) or A2 (always-on, for real). Both use the same
`backend/railway.json`/Nixpacks build; both end by giving you a backend URL that
becomes your `API_BASE` in Part B.

### A1 — Render free tier (🧪 testing, $0)

1. Go to **render.com** and sign in with GitHub.
2. **New → Web Service →** connect your `chore-app` repo.
3. Settings:
   - **Root Directory:** `backend` ← important (this is a monorepo).
   - **Branch:** the branch you chose above.
   - **Build Command:** `npm install --include=dev && npm run build`
     (the `--include=dev` is required — `nest build` lives in devDependencies, and
     `NODE_ENV=production` would otherwise make npm skip it and the build fails).
   - **Start Command:** `npm run start:prod`
   - **Instance Type:** **Free**.
4. Add the env vars from the table above (**Environment** section).
5. Create the service. Render gives you a URL like
   `https://chorequest-backend.onrender.com`. **This is your `API_BASE`.**

   > On Free, the service **sleeps after ~15 min idle** and cold-starts (~30–50s)
   > on the next request — so the first tap of a family session is slow, then it's
   > fast. The per-minute timer sweep won't run while asleep; that's the expected
   > trade for $0 (see the sweep box at the top). When you're ready for always-on,
   > either bump this service to Render's paid **Starter** plan or switch to A2.

### A2 — Railway always-on (🚀 for real, ~$5/mo)

1. Go to **railway.app** and sign in with GitHub.
2. **New Project → Deploy from GitHub repo →** pick your `chore-app` repo.
3. Open the created service → **Settings**:
   - **Root Directory:** `backend` ← important.
   - **Branch:** the branch you chose above.
   - Build/Start are already handled by `backend/railway.json`
     (`npm run build` then `npm run start:prod`). You don't need to type commands.
4. **Variables** tab → add the env vars from the table above.
5. **Settings → Networking → Generate Domain.** Copy the URL —
   e.g. `https://chorequest-backend-production.up.railway.app`.
   **This is your `API_BASE`.**

---

## Part B — Frontend on Vercel

1. Go to **vercel.com** and sign in with GitHub.
2. **Add New… → Project →** import your `chore-app` repo.
3. In the import screen:
   - **Root Directory:** `frontend` ← important.
   - **Framework Preset:** Nuxt (Vercel auto-detects it; leave the default build
     command `nuxt build`).
   - **Branch:** the same branch you chose.
4. Expand **Environment Variables** and add:

   | Variable       | Value                                             |
   | -------------- | ------------------------------------------------- |
   | `SUPABASE_URL` | your Frula project URL                            |
   | `SUPABASE_KEY` | your anon key (same value as the backend's ANON)  |
   | `API_BASE`     | your backend URL from Part A (Render or Railway)   |

   > `API_BASE` is baked into the app at build time, so it must be set **before**
   > this first deploy. If you change it later, redeploy the frontend.

5. Click **Deploy**. When it finishes, copy your frontend URL —
   e.g. `https://chorequest.vercel.app`. **This is your `FRONTEND_ORIGIN`.**

---

## Part C — Wire them together (the step everyone forgets)

Now that both URLs exist, connect them:

1. **Your backend host (Render or Railway) → Variables/Environment:** set
   `FRONTEND_ORIGIN` = your Vercel URL (e.g. `https://chorequest.vercel.app`,
   no trailing slash). The host redeploys automatically. The backend now boots
   cleanly and allows CORS from your site.

2. **Supabase → Frula project → Authentication → URL Configuration:**
   - **Site URL:** your Vercel URL.
   - **Redirect URLs:** add `https://chorequest.vercel.app/**`
     (this lets parent email-confirmation links redirect back to `/confirm`).
   Without this, parent sign-up confirmation links will fail.

3. Reload your Vercel URL. The parent sign-up → onboarding → add-kids flow should
   now work end to end.

---

## Part D — Put it on the family's phones (PWA install)

The frontend is an installable PWA served over HTTPS, so no app store needed:

- **iPhone (Safari):** open the Vercel URL → Share → **Add to Home Screen**.
- **Android (Chrome):** open the URL → menu (⋮) → **Install app** / **Add to Home Screen**.

It then launches full-screen like a native app. To turn on push notifications,
each person taps **Enable notifications** on their dashboard (requires the VAPID
keys to be set on the backend host).

---

## When you're ready to go always-on

Two options once testing is done and you want the timer sweep running for real:

1. **Upgrade the host** — bump Render Free → Starter, or switch to Railway (Part A2).
   Zero code change; the in-app `@Cron(EVERY_MINUTE)` sweep just starts running 24/7.
2. **Move the sweep into Postgres with `pg_cron`** (the cleaner long-term fix — then
   you *never* need an always-on Node server, even in production). Supabase supports
   the `pg_cron` extension: port the three sweep queries from
   `backend/src/timers/timers.service.ts` into a SQL function and schedule it
   `EVERY_MINUTE`. The backend can then live on a free sleep-when-idle host forever,
   because the database wakes itself to run the cleanup. This is a small, self-contained
   task — worth doing before the Google Play (Capacitor) wrap, not before family testing.

---

## Everyday updates

Both hosts redeploy automatically on every push to the deploy branch:

- Push code → Vercel rebuilds the frontend, your backend host rebuilds the backend.
- **Database changes** (new files in `supabase/migrations/`) are **not** automatic —
  apply new migrations yourself in the Supabase SQL editor / CLI, same as during
  development. Remember the one-time "expose the `chore` schema" step is already
  done and doesn't need repeating.

## Quick sanity checks if something's off

- **Login page loads but sign-up email link errors** → Supabase redirect URL not
  set (Part C step 2).
- **App loads but every action fails / CORS errors in the browser console** →
  `FRONTEND_ORIGIN` on the backend doesn't exactly match the Vercel URL (Part C
  step 1), or `API_BASE` on Vercel is wrong/stale (rebuild frontend after changing it).
- **First tap of a session is slow (~30–50s), then fine** → normal on Render Free;
  the backend was asleep and is waking. Go always-on to remove it.
- **Backend won't start** → check `NODE_ENV=production` and `FRONTEND_ORIGIN` are
  both set; the app intentionally refuses to boot without them.
- **Timers never auto-resolve** (stuck claims, overdue chores not going MISSED) →
  the per-minute sweep isn't running: expected on Render Free. Use the parent
  **Release** button meanwhile, or go always-on / `pg_cron`.
