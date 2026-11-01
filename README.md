# PlanPal — GenAI Event Planning Assistant

PlanPal helps people organise **weddings, birthdays, anniversaries and community events**. You can plan budgets and timelines, keep vendor checklists and get ideas, all with a **Google Gemini** co-planner.

**Live demo:** <https://plan-pal-ivory.vercel.app> · **API:** <https://planpal-iwal.onrender.com/api/health>

> The backend runs on Render's free plan, which sleeps when idle. The first request after a quiet period can take about 30 seconds while it wakes up.

| Layer | Tech | Hosting |
| --- | --- | --- |
| Frontend | React 18 + Vite, React Router | Vercel |
| Backend | Node 22, Express 5, Zod | Render |
| Database | PostgreSQL | Render Postgres |
| GenAI | `@google/genai`, Gemini 3.8 Flash (low thinking for fast replies) | Google AI Studio |
| Email | Brevo HTTP API or any SMTP server (printed to the console in development) | — |

---

## Features

**Accounts**
- Sign up asks for name, email, password and re-enter password. Every password field has a show/hide eye button. A welcome email is sent when you sign up.
- Sign in with email and password.
- Forgot password sends a 6-digit code to your email, which you use to set a new password.

**Home tab**
- Upcoming events: only the events you belong to, soonest first.
- Create event: the creator becomes the **event head** and gets a random 8-character join code.
- Join event: enter a code to join. New members get *view-only* access.

**Event creation wizard**
1. Name (the event is created at this step and its code is shown) → 2. Start/end dates → 3. Event type (free text with suggestions), plus an optional budget and description → 4. Important dates and what happens on each → 5. Tasks: **AI-recommended tasks** you can tick to add, or your own tasks with a description and start/due dates.

**Event dashboard (Kanban board)**
- Columns: **Not started · In progress · Completed · Delayed**. The layout is inspired by Jira boards, but it's built into PlanPal; there is no Jira integration.
- You move a task between statuses yourself, using the dropdown or drag and drop. A task that isn't completed by its due date moves to **Delayed** automatically. The event works the same way: the head sets *Not started / In progress / Finished*, and an event that isn't finished by its end date shows as Delayed.
- Every member can see the dashboard and all event details.
- Access levels: **Event head** (full control), **Can edit** (details, dates, tasks) and **View only**. The head can change anyone's access or remove a participant.

**AI Assistant tab** (chats are private to each account)
1. Start a general chat, then *link it to an existing event* later.
2. Start a chat about one of your events. Gemini receives that event's dates, budget, important dates and task statuses.
3. Have a general chat that is never linked to an event.

**Events tab**: every event you created or joined, with the date you created or joined it, the end date and the current status.

**You tab**
- Edit your name.
- Change your email: a verification code goes to your *current* email address. After the change, both addresses get a notice.
- Change your password: enter your current password, then a code sent to your email. Changing it signs out your other devices.
- Notes: write a note, optionally link it to an event, then press **Save**. A note linked to an event also shows on that event's page.

---

## How the judging criteria are covered

| Criterion | What we did |
| --- | --- |
| **Code quality** | Clear layering (routes → services → db), shared Zod schemas, a single error handler, small reusable React components and hooks, and ESLint (with `jsx-a11y`) on both apps. |
| **Security** | bcrypt password hashes, JWT checked against a `token_version` so a password change revokes old sessions, codes stored as HMACs with an attempt limit, single-use and 10-minute expiry, no way to find out which emails are registered (login and forgot-password give the same answer either way), constant-time login, parameterised SQL with whitelisted update columns, role checks on every event route (non-members get 404), Helmet headers, a CORS allow-list, rate limits on auth, OTP, join and AI routes, a 50 kB body limit, event data sent to the model inside delimiters to resist prompt injection, AI output rendered without `innerHTML`, and HTML-escaped emails. |
| **Efficiency** | Gemini runs at a *low* thinking level for fast replies. Sending a chat message makes 3 database round trips: the reads run in parallel, and both messages plus the chat update are saved in one atomic statement. Also: indexed queries, the event page loaded in one request with parallel queries, bulk task inserts in one transaction, AI history capped at 20 messages, gzip compression, route-level code splitting with a long-cached vendor chunk, and optimistic task status updates. |
| **Testing** | 117 backend tests (Vitest + Supertest: auth, permissions, validation, AI integration with a mocked Gemini, OTP logic) and 85 frontend tests (Testing Library: password toggle, sign-up validation, Kanban grouping, safe markdown). CI runs lint, tests and the build. |
| **Accessibility** | Semantic landmarks, a skip link, labelled fields with `aria-describedby` errors, `role=alert`/`status` messages, keyboard-usable status selects next to drag and drop, `aria-current` on tabs and wizard steps, focus moved to each wizard step, AA-contrast colours with dark mode, reduced-motion support and 44px touch targets. |
| **Problem alignment** | Budgets, timelines, vendor checklists and personalised ideas through Gemini chat with event context, plus AI task generation with structured JSON output. |

---

## Run locally

**You need:** Node 20 or newer (`node -v`), a [Gemini API key](https://aistudio.google.com/apikey), and a PostgreSQL database. The easiest option is a free Render Postgres. Use its **External Database URL** with `DATABASE_SSL=true`.

### 1. Backend
```bash
cd server
cp .env.example .env
npm install
npm run migrate
npm run dev
```
Before running `npm run migrate`, fill in `server/.env`:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Your Postgres URL (Render: the **External** URL) |
| `DATABASE_SSL` | `true` for Render's external URL, `false` for a database on your own computer |
| `JWT_SECRET` | Any random text of 32+ characters. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `GEMINI_API_KEY` | Your Gemini key |
| `GEMINI_MODEL` | `gemini-3.8-flash` |

The API runs at <http://localhost:4000>. With no email provider set, emails and verification codes are **printed in this terminal**, so you can test every flow locally.

### 2. Frontend (in a second terminal)
```bash
cd client
cp .env.example .env
npm install
npm run dev
```
`client/.env` already points at `http://localhost:4000`. Open <http://localhost:5173>.

### 3. Tests
```bash
cd server && npm test && npm run lint
cd client && npm test && npm run lint && npm run build
```

### Getting the latest code
```bash
git pull
```
Run `npm install` in `server` and `client` again if a `package.json` changed. `.env` files are never committed, so after a fresh `git clone` you must recreate them from the `.env.example` files.

---

## Deploy

### 1. Database (Render)
**New + → Postgres**, Free plan. When it's ready, keep both the **Internal** URL (for the backend on Render) and the **External** URL (for local development).

### 2. Backend (Render web service)
**New + → Web Service**, then connect the GitHub repo:

| Setting | Value |
| --- | --- |
| Root Directory | `server` |
| Runtime | Node |
| Build Command | `npm ci --omit=dev` (clear the pre-filled `yarn` first) |
| Start Command | `npm start` (runs migrations, then starts the API) |
| Health Check Path | `/api/health` |

Environment variables:

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22` |
| `DATABASE_URL` | The database's **Internal** URL |
| `DATABASE_SSL` | `false` (internal connections don't need SSL) |
| `JWT_SECRET` | A new random 32+ character string |
| `GEMINI_API_KEY` | Your Gemini key |
| `GEMINI_MODEL` | `gemini-3.8-flash` |
| `BREVO_API_KEY` | From Brevo → SMTP & API → API Keys |
| `MAIL_FROM_EMAIL` | A sender address you verified in Brevo |
| `CORS_ORIGIN` | Your Vercel URL, with no trailing `/` |
| `APP_URL` | Your Vercel URL |

Render's free plan blocks SMTP ports, which is why email goes through **Brevo's HTTP API**. To check the deploy, open `https://<service>.onrender.com/api/health`; it should show `{"status":"ok"}`.

> Alternatively, **New + → Blueprint** reads `render.yaml` and creates the database and web service in one go. You still have to fill in the secret values.

### 3. Frontend (Vercel)
1. **Add New → Project**, import the repo and set **Root Directory** to `client`. Vite is detected automatically.
2. Add the environment variable `VITE_API_URL=https://<service>.onrender.com`, with no trailing `/`.
3. Deploy. `vercel.json` handles SPA routing, security headers and asset caching.
4. Back in Render, set `CORS_ORIGIN` and `APP_URL` to the Vercel URL and save. Render redeploys automatically.

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `npm run migrate` fails with `ECONNRESET` | Render's external database requires SSL. Set `DATABASE_SSL=true` and use the **External** URL. If it still fails, your network may block port 5432; try a mobile hotspot. |
| Render build: `yarnnpm: command not found` | The pre-filled `yarn` was left in the Build Command. Set it to exactly `npm ci --omit=dev`. |
| Vercel: "invalid vercel.json" | The file isn't valid JSON, usually because of a missing comma. Compare it with the copy in this repo. |
| Site says "Cannot reach the server" | `VITE_API_URL` (Vercel) or `CORS_ORIGIN` (Render) is wrong, often because of a trailing `/`. The backend may also be waking up; wait 30 seconds. |
| AI: "not configured on the server" | `GEMINI_API_KEY` is missing on the server. |
| AI: "unavailable right now" | Check the Render logs for the line starting `Gemini chat request failed`. **404 "model … no longer available"**: set `GEMINI_MODEL=gemini-3.8-flash`. **402 "prepayment credits are depleted"**: add credits in AI Studio, or use a free-tier key from a Google account without billing. **429**: you hit the rate limit; wait a minute. |

---

## API overview

All routes are under `/api`. Everything except `auth/*` (apart from `auth/me`) requires `Authorization: Bearer <token>`.

| Method & path | Who | Purpose |
| --- | --- | --- |
| `POST auth/signup`, `auth/login`, `auth/forgot-password`, `auth/reset-password` · `GET auth/me` | public / user | Accounts |
| `PATCH account/profile` · `POST account/email/{request,confirm}` · `POST account/password/{request,confirm}` | user | Profile and verified changes |
| `GET/POST events` · `POST events/join` | user | List, create, join |
| `GET events/:id` | any member | Details, dates, tasks, members |
| `PATCH events/:id` | editor+ (status: head) | Update details or status |
| `DELETE events/:id` · `PATCH/DELETE events/:id/members/:userId` | head | Delete event, manage access |
| `POST events/:id/leave` | member | Leave |
| `POST/DELETE events/:id/dates[/:dateId]` | editor+ | Important dates |
| `GET/POST/PATCH/DELETE events/:id/tasks[...]`, `POST tasks/bulk` | viewer reads, editor+ writes | Tasks |
| `POST events/:id/tasks/suggestions` | editor+ | Gemini task recommendations |
| `GET/POST chats` · `GET/PATCH/DELETE chats/:id` · `POST chats/:id/messages` | owner | AI chats and linking to events |
| `GET/POST notes` · `PATCH/DELETE notes/:id` | owner | Notes |

## Project structure

```
server/
  src/
    app.js              Express app (middleware + routes)
    config.js           Validated environment variables
    db/                 Pool, schema.sql, migrate script
    middleware/         auth, validation, errors, rate limits
    routes/             auth, account, events, tasks, chats, notes
    services/           ai (Gemini), email, otp, event access + data
    utils/              shared schemas, security helpers, status rules
  tests/                Vitest + Supertest
client/
  src/
    api/                fetch wrapper
    context/            auth state
    hooks/              useApi, useTaskActions
    components/         form controls, Kanban board, chat, account forms…
    pages/              Home, Assistant, Events, EventDetail, CreateEvent, You, auth/*
    utils/              status rules, formatting, validation
```
