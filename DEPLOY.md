# Deploying ChoreQuest (Railway + Vercel + Supabase)

Goal: get a live, HTTPS URL your family can open on their phones and **Add to Home
Screen** as an installable app.

The app is three pieces. One is already live:

| Piece                | Where it runs                        | Status                          |
| -------------------- | ------------------------------------ | ------------------------------- |
| **Database + Auth**  | Supabase (shared Frula project)      | ✅ already live (migrations applied, `chore` schema exposed) |
| **Backend API + cron** | **Railway** (always-on Node)       | set up in Part A                |
| **Frontend PWA**     | **Vercel** (free tier)               | set up in Part B                |

> **Why the backend needs an always-on host:** it runs a per-minute timer sweep
> (`@Cron(EVERY_MINUTE)`) that flips expired claim/finish timers and overdue
> required chores → MISSED. A host that sleeps when idle would freeze those timers,
> so we use Railway (stays awake), not a sleep-on-idle free tier.

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
Or, skip the merge and just point Railway + Vercel at the
`chorequest-onboarding-and-chores` branch. Either works — just be consistent.

---

## Part A — Backend on Railway

1. Go to **railway.app** and sign in with GitHub.
2. **New Project → Deploy from GitHub repo →** pick your `chore-app` repo.
3. Open the created service → **Settings**:
   - **Root Directory:** `backend` ← important (this is a monorepo).
   - **Branch:** the branch you chose above.
   - Build/Start are already handled by `backend/railway.json`
     (`npm run build` then `npm run start:prod`). You don't need to type commands.
4. Go to the service's **Variables** tab and add:

   | Variable                    | Value                                                        |
   | --------------------------- | ------------------------------------------------------------ |
   | `NODE_ENV`                  | `production`                                                  |
   | `SUPABASE_URL`              | your Frula project URL                                        |
   | `SUPABASE_ANON_KEY`         | your anon key                                                 |
   | `SUPABASE_SERVICE_ROLE_KEY` | your service-role key (secret)                                |
   | `VAPID_PUBLIC_KEY`          | your VAPID public key (optional)                              |
   | `VAPID_PRIVATE_KEY`         | your VAPID private key (optional, secret)                    |
   | `VAPID_SUBJECT`             | `mailto:you@example.com` (optional)                          |
   | `FRONTEND_ORIGIN`           | **leave blank for now** — you'll set it in Part C            |

   > Don't set `PORT` — Railway injects it automatically and the app reads it.
   > `NODE_ENV=production` **and** `FRONTEND_ORIGIN` are both required; the app
   > refuses to boot in production without a `FRONTEND_ORIGIN`, so it will only
   > start cleanly after Part C. That's expected.

5. Under **Settings → Networking**, click **Generate Domain**. Copy the URL —
   e.g. `https://chorequest-backend-production.up.railway.app`.
   **This is your `API_BASE`.** Save it for Part B.

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
   | `API_BASE`     | the Railway URL from Part A step 5                 |

   > `API_BASE` is baked into the app at build time, so it must be set **before**
   > this first deploy. If you change it later, redeploy the frontend.

5. Click **Deploy**. When it finishes, copy your frontend URL —
   e.g. `https://chorequest.vercel.app`. **This is your `FRONTEND_ORIGIN`.**

---

## Part C — Wire them together (the step everyone forgets)

Now that both URLs exist, connect them:

1. **Railway → your backend → Variables:** set
   `FRONTEND_ORIGIN` = your Vercel URL (e.g. `https://chorequest.vercel.app`,
   no trailing slash). Railway redeploys automatically. The backend now boots
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
keys to be set on Railway).

---

## Everyday updates

Both hosts redeploy automatically on every push to the deploy branch:

- Push code → Vercel rebuilds the frontend, Railway rebuilds the backend.
- **Database changes** (new files in `supabase/migrations/`) are **not** automatic —
  apply new migrations yourself in the Supabase SQL editor / CLI, same as during
  development. Remember the one-time "expose the `chore` schema" step is already
  done and doesn't need repeating.

## Quick sanity checks if something's off

- **Login page loads but sign-up email link errors** → Supabase redirect URL not
  set (Part C step 2).
- **App loads but every action fails / CORS errors in the browser console** →
  `FRONTEND_ORIGIN` on Railway doesn't exactly match the Vercel URL (Part C step 1),
  or `API_BASE` on Vercel is wrong/stale (rebuild frontend after changing it).
- **Backend won't start on Railway** → check `NODE_ENV=production` and
  `FRONTEND_ORIGIN` are both set; the app intentionally refuses to boot without them.
- **Timers never expire** → the backend went to sleep. On Railway it shouldn't;
  confirm the service is on a plan that stays running (not scaled to zero).
