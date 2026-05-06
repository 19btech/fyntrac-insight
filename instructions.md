# Fyntrac Insight — Setup & Usage Guide

A simple, step-by-step manual for the Fyntrac Insight analytics service
(Metabase-style BI on top of MongoDB) — how to install it, how each piece
works, and how to test it inside GitHub Codespaces.

---

## 1. What this app is

**Fyntrac Insight** is a self-hosted analytics service. Think of it as a
"Metabase for MongoDB" tailored for Fyntrac. It lets you:

- Browse MongoDB collections like a database explorer.
- Build questions visually (no code) **or** with raw aggregation pipelines.
- Save results as charts (bar, line, pie, waterfall, KPI, table…).
- Pin charts to dashboards with drag-and-drop tabs and filters.
- Set scheduled email subscriptions, alerts, comments, public shares.
- Ask an AI assistant (Anthropic / OpenAI / Gemini) to write pipelines for you.

Everything is **MongoDB-only** — no SQL anywhere.

---

## 2. Project layout

```
fynbase/
├── backend/          Node + Express API (port 4000)
│   └── src/
│       ├── index.js          App entry
│       ├── middleware/       Auth, embed, error handlers
│       ├── models/           Mongoose schemas (metadata store)
│       ├── routes/           REST endpoints
│       └── services/         Mongo, cache, AI, alerts, schema
│
├── frontend/         React 18 + MUI v5 SPA (port 3000)
│   └── src/
│       ├── App.jsx           Router + theme provider
│       ├── layout/           AppShell, Sidebar, Topbar
│       ├── pages/            Home, Browse, Editor, Dashboard, …
│       ├── components/       Charts, query builder, AI drawer
│       ├── store/            Zustand client state
│       └── theme/            MUI theme + animations
│
├── startup.sh        Starts backend + frontend in background
├── stop.sh           Stops both services
├── pids/             PID files (auto-created)
└── logs/             Backend + frontend logs (auto-created)
```

---

## 3. Prerequisites

You need on the machine running the app:

- **Node.js 18+** and **npm 9+** (Codespaces already has both).
- **MongoDB 6+** reachable on a URI you control.
  - You need *two* logical databases: one for **metadata** (dashboards,
    questions, etc.) and one for the **target data** you want to analyze.
  - They can live on the same MongoDB instance.
- An **RS256 public key** from the main Fyntrac app for verifying JWTs
  (only required if you want real auth; for local testing you can skip it).

---

## 4. First-time setup (step by step)

### Step 1 — Clone and enter the repo

```bash
git clone https://github.com/rahmed1904/fynbase.git
cd fynbase
```

In Codespaces this is already done for you.

### Step 2 — Install backend dependencies

```bash
cd backend
npm install
```

### Step 3 — Configure backend environment

```bash
cp .env.example .env
```

Open [backend/.env](backend/.env) and set the values:

| Variable | What to set |
|---|---|
| `PORT` | `4000` (default) |
| `MONGODB_URI` | Connection string to the **metadata** DB |
| `TARGET_MONGODB_URI` | Connection string to the **data** DB you want to query |
| `JWT_PUBLIC_KEY` | RS256 public key from main Fyntrac app (multi-line — escape newlines as `\n`) |
| `CORS_ORIGIN` | `http://localhost:3000` for local; Codespaces forwarded URL otherwise |
| `CACHE_TTL_SECONDS` | `300` (5 min cache for query results) |
| `SMTP_HOST/PORT/USER/PASS/FROM` | Optional — only needed for email alerts & subscriptions |
| `ANTHROPIC_API_KEY` | Optional — fallback AI key. Per-user keys are configured later in the UI. |

> **Tip:** for a quick local test you can leave `JWT_PUBLIC_KEY` empty and
> the dev fallback will accept any token. Do **not** do this in production.

### Step 4 — Install frontend dependencies

```bash
cd ../frontend
npm install
```

### Step 5 — Configure frontend environment

```bash
cp .env.example .env
```

Open [frontend/.env](frontend/.env):

| Variable | Value |
|---|---|
| `REACT_APP_API_BASE_URL` | `http://localhost:4000/api` (local) **or** the Codespaces backend URL + `/api` |
| `REACT_APP_SERVICE_NAME` | `Fyntrac Insight` |

### Step 6 — Start both services

From the repo root:

```bash
cd ..
./startup.sh
```

You should see:

```
[backend]  starting on http://localhost:4000 ...
[frontend] starting on http://localhost:3000 ...
```

The first frontend boot takes ~30–60 seconds while React compiles.

Open **http://localhost:3000** in your browser.

### Step 7 — Stop both services

```bash
./stop.sh
```

This kills both processes and clears [pids/](pids/).

---

## 5. How each component works

### 5.1 Backend (`/backend`)

Express server on port 4000. Entry: [backend/src/index.js](backend/src/index.js).

**Routes** (each lives in [backend/src/routes/](backend/src/routes/)):

| Route file | Purpose |
|---|---|
| `admin.routes.js` | Admin tasks (audit log, system info) |
| `ai-settings.routes.js` | Per-user AI provider keys — set / test / pick model |
| `ai.routes.js` | AI chat + "AI write a pipeline for me" |
| `alert.routes.js` | Threshold alerts on questions |
| `bookmark.routes.js` | Star/favorite items |
| `collection.routes.js` | Folder hierarchy for questions/dashboards |
| `comment.routes.js` | Comments + @mentions on questions/dashboards |
| `dashboard.routes.js` | Create/save/load dashboards (with tabs + filters) |
| `embed.routes.js` | HS256-signed embed iframes |
| `metric.routes.js` | Reusable named metrics |
| `model.routes.js` | "Saved models" — virtual collections built from pipelines |
| `query.routes.js` | Run aggregation pipelines (cached) |
| `question.routes.js` | Saved questions + revision history |
| `schema.routes.js` | Sample documents and infer field types |
| `share.routes.js` | Public share links for questions and dashboards |
| `snippet.routes.js` | Reusable pipeline snippets |
| `subscription.routes.js` | Scheduled email delivery (cron) |
| `trash.routes.js` | Soft-delete + restore |

**Services** ([backend/src/services/](backend/src/services/)):

- `mongo.service.js` — runs aggregation pipelines on the **target** DB,
  prepends a `$match` stage that enforces tenant + attribute filters.
- `cache.service.js` — in-memory `node-cache` keyed by pipeline hash.
- `schema.service.js` — samples N documents and infers field types.
- `ai.service.js` — high-level AI orchestration.
- `ai-providers.service.js` — unified Anthropic / OpenAI / Gemini calls.
- `ai-credentials.service.js` — AES-256-GCM encrypts user API keys at rest.
- `alert.service.js` — cron loop that evaluates alerts and subscriptions.

**To set up the backend** you only need to fill `.env` and run
`npm run dev`. The app creates its own collections inside the metadata DB
on first boot — no migrations needed.

### 5.2 Frontend (`/frontend`)

React 18 + MUI v5 SPA. Entry: [frontend/src/index.js](frontend/src/index.js)
which mounts [frontend/src/App.jsx](frontend/src/App.jsx).

**Layout** ([frontend/src/layout/](frontend/src/layout/)):

- `AppShell.jsx` — outer frame with sidebar + topbar + page fade-in transition.
- `Sidebar.jsx` — white sidebar with the Fyntrac Insight logo and indigo nav pills.
- `Topbar.jsx` — global search, theme toggle, AI button, profile menu.

**Pages** ([frontend/src/pages/](frontend/src/pages/)):

| Page | What it is |
|---|---|
| `Home.jsx` | Landing page — recents, pinned, your bookmarks |
| `Browse.jsx` | Database/collection explorer with field stats |
| `Collection.jsx` | A folder of questions and dashboards |
| `QuestionEditor.jsx` | Visual + native editor, chart picker, save/share |
| `Dashboard.jsx` | Drag-and-drop dashboard with tabs and filters |
| `Bookmarks.jsx` | All your starred items |
| `Models.jsx` | Saved models (virtual collections) |
| `Metrics.jsx` | Named reusable metrics |
| `Snippets.jsx` | Reusable pipeline snippets |
| `Trash.jsx` | Soft-deleted items, restorable |
| `Admin.jsx` | Audit log, settings |
| `SharedDashboard.jsx` / `SharedQuestion.jsx` | Public read-only views |

**Components** ([frontend/src/components/](frontend/src/components/)):

- `charts/` — Bar, Line, Pie, Area, Funnel, Waterfall, KPI, Table, Pivot.
- `query-builder/` — Visual builder (filter, group, summarize).
- `native-editor/` — Monaco editor for raw aggregation JSON.
- `dashboard/` — Grid, tab bar, filter widgets.
- `ai/` — Chat drawer, settings dialog, "ask AI to write this query" panel.
- `shared/` — Reusable cards, dialogs, empty states.

**Store** ([frontend/src/store/](frontend/src/store/)) — small Zustand
slices for current user, theme mode, AI drawer state.

**Theme** ([frontend/src/theme/metabaseTheme.js](frontend/src/theme/metabaseTheme.js))
— Inter font, indigo `#6366f1` primary, navy `#14213d` CTA, amber accent,
plus global keyframes (`fyntracFadeIn`, `fyntracPulse`) and motion transitions
on every interactive MUI component.

**To set up the frontend** you only need to fill `.env` and run
`npm start`. No build step needed for development.

### 5.3 The startup/stop scripts

[startup.sh](startup.sh):

1. Creates `pids/` and `logs/` if missing.
2. Skips backend if `pids/backend.pid` is alive.
3. Otherwise runs `npm run dev` inside `backend/`, redirects output to
   `logs/backend.log`, writes the PID.
4. Repeats the same for frontend (`npm start`, `logs/frontend.log`).

[stop.sh](stop.sh):

1. Reads `pids/backend.pid` and `pids/frontend.pid`.
2. Sends SIGTERM to each.
3. Falls back to `pkill` patterns if the PID file is missing.
4. Removes the PID files.

**Sync check (April 2026):** confirmed in sync with the app —
- backend: `npm run dev` → `nodemon src/index.js` → port `4000` ✅
- frontend: `npm start` → `react-scripts start` → port `3000` ✅
- log paths match `logs/backend.log` and `logs/frontend.log` ✅
- PID handling matches `pids/backend.pid` and `pids/frontend.pid` ✅

No changes are needed in either script.

---

## 6. Configuring AI providers

After the app is running and you have logged in:

1. Click the **AI button** (sparkle icon) in the topbar to open the chat drawer.
2. Click the **gear icon** in the drawer header → "AI Settings".
3. Pick a tab: **Anthropic**, **OpenAI**, or **Gemini**.
4. Paste your API key → click **Test Key**.
5. Pick a model from the dropdown that appears.
6. Click **Make active**. That model is now used for all AI features
   (chat, "AI write a pipeline for me", auto-summary).

Keys are AES-256-GCM encrypted before being stored.

---

## 7. Testing the app inside Codespaces

> Codespaces forwards ports automatically. The backend and frontend will
> appear under the **Ports** tab as `4000` and `3000`.

### Step 1 — Start a MongoDB instance

If your dev container does **not** include MongoDB, start one with Docker:

```bash
docker run -d --name fyntrac-mongo -p 27017:27017 mongo:7
```

Verify:

```bash
docker exec -it fyntrac-mongo mongosh --eval "db.adminCommand('ping')"
```

### Step 2 — Configure both `.env` files

```bash
# backend
cd backend
cp .env.example .env
# edit .env: keep MONGODB_URI=mongodb://localhost:27017/<TENANT>_INSIGHT
#           keep TARGET_MONGODB_URI=mongodb://localhost:27017/<TENANT>
#           leave JWT_PUBLIC_KEY blank for the dev fallback
cd ..

# frontend
cd frontend
cp .env.example .env
cd ..
```

### Step 3 — Install dependencies (once)

```bash
( cd backend && npm install )
( cd frontend && npm install )
```

### Step 4 — Seed some test data (optional but recommended)

In the Codespaces terminal:

```bash
docker exec -i fyntrac-mongo mongosh fyntrac_data <<'EOF'
db.orders.insertMany([
  { tenantId: "t1", amount: 120, status: "paid",   createdAt: new Date("2026-01-05") },
  { tenantId: "t1", amount: 320, status: "paid",   createdAt: new Date("2026-02-10") },
  { tenantId: "t1", amount:  90, status: "refund", createdAt: new Date("2026-02-12") },
  { tenantId: "t1", amount: 410, status: "paid",   createdAt: new Date("2026-03-04") },
  { tenantId: "t1", amount: 280, status: "paid",   createdAt: new Date("2026-03-22") }
]);
EOF
```

### Step 5 — Start the app

```bash
./startup.sh
```

Watch the logs:

```bash
tail -f logs/backend.log     # in one terminal
tail -f logs/frontend.log    # in another
```

### Step 6 — Open the forwarded URLs

In the Codespaces **Ports** panel:

- Click the globe icon next to **3000** → opens the frontend.
- The frontend talks to backend at `http://localhost:4000/api` because
  Codespaces forwards localhost transparently in the same container.

> **If you preview in an external browser**, set
> `REACT_APP_API_BASE_URL` to the Codespaces forwarded URL of port 4000
> + `/api`, set `CORS_ORIGIN` in the backend to the forwarded URL of
> port 3000, and restart both services.

### Step 7 — Smoke test checklist

Once the UI loads, verify each capability:

1. **Browse data**
   - Sidebar → **Browse** → expand `fyntrac_data` → click `orders`.
   - You should see 5 sample rows and inferred field types.

2. **Build a question**
   - Click **+ New question**.
   - Pick `orders`, group by `status`, summarize `sum(amount)`.
   - Switch to **Bar chart** → click **Save** → place in a collection.

3. **Pin to a dashboard**
   - Sidebar → **+ New dashboard** → name it.
   - Click **Add card** → pick the question you just saved.
   - Drag to resize, save the dashboard.

4. **AI assistant**
   - Open AI drawer, configure a provider key (see §6).
   - Ask: *"sum of paid orders by month"* — confirm a pipeline is generated.

5. **Bookmarks**
   - Star the dashboard → **Bookmarks** page should list it.

6. **Public share**
   - Open the dashboard → **Share** → enable public link → open in
     incognito → see read-only view with "Powered by Fyntrac Insight".

7. **Subscription**
   - On the dashboard → **Subscriptions** → schedule daily 9am email.
   - Check `logs/backend.log` for cron tick lines.

8. **Trash**
   - Delete a question → **Trash** page → click **Restore**.

9. **Animations** (visual)
   - Switch routes (Home → Browse → Dashboard) — each page **fades in**.
   - Hover any card on the home page — it lifts.
   - Press any button — slight scale-down on click.
   - Open a dialog — grows from center.
   - Sidebar nav items slide right on hover and turn indigo when active.

10. **Stop**
    ```bash
    ./stop.sh
    ```

If all 10 checks pass, your install is healthy.

---

## 8. Common issues

| Symptom | Fix |
|---|---|
| `EADDRINUSE :4000` | Run `./stop.sh`, or `lsof -ti :4000 \| xargs kill -9`. |
| Frontend stuck on "Compiling…" | First boot takes ~60s; check `logs/frontend.log`. |
| `MongoNetworkError` | Confirm MongoDB is running and `MONGODB_URI` is correct. |
| 401 on every API call | `JWT_PUBLIC_KEY` mismatch — for local dev leave it blank. |
| AI calls fail | Configure a provider key in **AI Settings** (§6). |
| CORS errors in Codespaces | Set `CORS_ORIGIN` to the exact frontend forwarded URL and restart backend. |

---

## 9. Useful one-liners

```bash
# Backend live logs
tail -f logs/backend.log

# Frontend live logs
tail -f logs/frontend.log

# Restart everything
./stop.sh && ./startup.sh

# Production build of the frontend
cd frontend && NODE_OPTIONS="--max-old-space-size=6144" npm run build

# List metadata collections
docker exec -it fyntrac-mongo mongosh MASTER_INSIGHT --eval "db.getCollectionNames()"
```
