# PlanPal — GenAI Event Planning Assistant

PlanPal helps people organise **weddings, birthdays, anniversaries and community events**. You can plan budgets and timelines, keep vendor checklists and get ideas, all with a **Google Gemini** co-planner.

| Layer | Tech | Hosting |
| --- | --- | --- |
| Frontend | React 18 + Vite, React Router | Vercel |
| Backend | Node 20+, Express 5, Zod | Render |
| Database | PostgreSQL | Render Postgres |
| GenAI | `@google/genai` (Gemini 3.8 Flash by default) | Google AI Studio |
| Email | Brevo HTTP API or any SMTP server (console fallback in dev) | — |

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

**Event dashboard (Jira-style)**
- Columns: **Not started · In progress · Completed · Delayed**.
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
| **Efficiency** | Indexed queries, event detail loaded with parallel queries in one request, bulk task insert in one transaction, AI history capped at 20 messages, gzip compression, route-level code splitting with a long-cached vendor chunk, and optimistic task status updates. |
| **Testing** | 61 backend tests (Vitest + Supertest: auth, permissions, validation, AI integration with a mocked Gemini, OTP logic) and 17 frontend tests (Testing Library: password toggle, sign-up validation, Kanban grouping, safe markdown). CI runs lint, tests and the build. |
| **Accessibility** | Semantic landmarks, a skip link, labelled fields with `aria-describedby` errors, `role=alert`/`status` messages, keyboard-usable status selects next to drag and drop, `aria-current` on tabs and wizard steps, focus moved to each wizard step, AA-contrast colours with dark mode, reduced-motion support and 44px touch targets. |
| **Problem alignment** | Budgets, timelines, vendor checklists and personalised ideas through Gemini chat with event context, plus AI task generation with structured JSON output. |

---

## Run locally

Prerequisites: Node 20+, and PostgreSQL 14+ (or `docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=planpal postgres:16`).

```bash
# Backend
cd server
cp .env.example .env        # set JWT_SECRET (32+ chars) and GEMINI_API_KEY
npm install
npm run migrate             # creates the tables (idempotent)
npm run dev                 # http://localhost:4000

# Frontend (new terminal)
cd client
cp .env.example .env        # VITE_API_URL=http://localhost:4000
npm install
npm run dev                 # http://localhost:5173
```

Without an email provider configured, emails (welcome mail, verification codes) are printed in the backend terminal so you can test every flow locally.

### Tests

```bash
cd server && npm test && npm run lint
cd client && npm test && npm run lint && npm run build
```

---

## Deploy

### Backend + database on Render
1. Push this repo to GitHub.
2. In Render, go to **New + → Blueprint** and choose the repo. `render.yaml` creates `planpal-db` (Postgres) and `planpal-api` (root dir `server`). Tables are created automatically on every start.
3. Fill in the secret environment variables in the dashboard:
   - `CORS_ORIGIN` and `APP_URL`: your Vercel URL, e.g. `https://planpal.vercel.app`
   - `GEMINI_API_KEY`: from <https://aistudio.google.com/apikey>
   - Email: Render's free tier blocks SMTP ports, so use **Brevo**. Create a free account, verify a sender email, then set `BREVO_API_KEY` and `MAIL_FROM_EMAIL`.

### Frontend on Vercel
1. In Vercel, go to **Add New → Project**, import the repo and set the **Root Directory** to `client` (Vite is detected automatically).
2. Add the environment variable `VITE_API_URL=https://<your-render-service>.onrender.com`.
3. Deploy. `vercel.json` handles SPA routing, security headers and asset caching.

> Render's free instances sleep when idle, so the first request after a while can take about 30 seconds.

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
    components/         form controls, Kanban, chat, account forms…
    pages/              Home, Assistant, Events, EventDetail, CreateEvent, You, auth/*
    utils/              status rules, formatting, validation
```
