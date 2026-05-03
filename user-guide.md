# Fyntrac Insight — User Guide

A friendly walkthrough of every feature in the app, written for end-users.
For installation and developer setup see [instructions.md](instructions.md).

---

## Table of contents

1. [Getting started](#1-getting-started)
2. [The home page](#2-the-home-page)
3. [Browse: explore your data](#3-browse-explore-your-data)
4. [Creating reports](#4-creating-reports)
5. [Charts & visualizations](#5-charts--visualizations)
6. [Saving reports and using collections](#6-saving-reports-and-using-collections)
7. [Dashboards](#7-dashboards)
8. [Filters & drill-through](#8-filters--drill-through)
9. [Bookmarks (favorites)](#9-bookmarks-favorites)
10. [Comments & @mentions](#10-comments--mentions)
11. [Report revision history](#11-report-revision-history)
12. [Public share links](#12-public-share-links)
13. [Embedding in another app](#13-embedding-in-another-app)
14. [Subscriptions (scheduled email)](#14-subscriptions-scheduled-email)
15. [Alerts](#15-alerts)
16. [Reconciliations](#16-reconciliations)
17. [Datasets](#17-datasets)
18. [KPIs](#18-kpis)
19. [Saved filters](#19-saved-filters)
20. [Trash & restore](#20-trash--restore)
21. [The AI co-pilot](#21-the-ai-co-pilot)
22. [AI settings (Anthropic / OpenAI / Gemini)](#22-ai-settings-anthropic--openai--gemini)
23. [Keyboard shortcuts](#23-keyboard-shortcuts)
24. [Theme toggle (light / dark)](#24-theme-toggle-light--dark)
25. [Admin area](#25-admin-area)

---

## 1. Getting started

When the app loads you see:

- a **white left sidebar** with the Fyntrac Insight logo,
- a **topbar** with global search, theme toggle, AI button and your profile,
- the main content area which fades in on every navigation.

The sidebar can be **collapsed** by clicking the chevron at the top — handy on
small screens. The active page is highlighted with an indigo pill.

> If you signed in via the main Fyntrac app, your JWT is already stored in
> session storage and every API call uses it automatically.

---

## 2. The home page

The home page (sidebar → **Home**) shows three sections:

- **Recents** — items you opened in the last few days
- **Pinned** — items pinned at the top of any collection
- **Your bookmarks** — quick links to anything you starred

Click any card to jump straight to the report or dashboard.

---

## 3. Browse: explore your data

Sidebar → **Browse Data**.

This is your "database explorer". You'll see:

1. The list of databases and the connected target database expanded.
2. Every collection inside it (e.g. `Transactions`, `ChartOfAccount`,
   `GeneralLedgerEntery`…).
3. Click any collection to open it.

> **System collections hidden.** Internal Fyntrac collections
> (`Settings`, `ModelFiles`, `sequences`, `system.*`, and any name
> beginning with `_`) are filtered out everywhere — Browse, the report
> picker, dataset wizard, KPI editor, and AI grounding — so you only
> ever see business data. Likewise, columns whose name starts with
> `_` (e.g. `_class`, `_pkey`) are stripped from result tables and
> chart axes.

For each collection you get:

- a **schema panel** on the right with the inferred field types
  (string / number / date / boolean / object / array),
- a **sample rows** preview of up to 100 documents,
- buttons to **Create a report** (jumps to the editor pre-filled with
  this collection) or **View as table**.

Tip: hover any field name to see the data type and a quick value preview.

---

## 4. Creating reports

A **report** is a saved aggregation pipeline + chart configuration
(historically called a "question" — the route paths still use
`/question/...` for backward-compatibility, but the UI labels
everywhere now say "Report").

Open the editor by clicking **+ New Report** anywhere in the app, or by
clicking **Create a report** on any collection.

### 4.1 Starter chooser

When you create a brand-new report you first see a **Starter chooser**
with finance-shaped intents:

- **Single number** — a KPI value with delta vs prior period
- **Trend over time** — line/area with smoothing
- **Breakdown by category** — bar with sort + Top-N
- **Top N rows** — leaderboard
- **Variance vs target** — Actual vs Budget by account, colored deltas
- **Detail rows** — table with filters
- **Ask the AI** — describe it in plain English

Picking an intent pre-fills the builder with sensible defaults
(chart type, axes, sort, limit) so you don't start from a blank page.

### 4.2 Visual builder

For people who don't want to write code. Pick from drop-downs:

- **From** — which collection or **dataset**
- **Filter** — add `where` clauses (e.g. `status = "paid"`)
- **Group by** — fields to group rows by (e.g. `month(createdAt)`)
- **Summarize** — aggregations (e.g. `sum(amount)`, `count`, `avg(price)`)
- **Sort** and **Limit**

The pipeline is generated for you. The **Format strip** above the
result lets you set currency, decimals, and date granularity in one
click. The **Chart Recommender** suggests the top-3 most useful
layouts for the shape of your result.

### 4.3 Native editor

For power users. A **Monaco** code editor where you write the raw
MongoDB aggregation pipeline as JSON, e.g.:

```json
[
  { "$match": { "status": "paid" } },
  { "$group": { "_id": "$status", "total": { "$sum": "$amount" } } }
]
```

A **Run** button executes the pipeline and a results panel appears
underneath with the row count and execution time.

> **Caching**: identical pipelines run within `CACHE_TTL_SECONDS` (5 min by
> default) are served from in-memory cache for instant results. The
> "cached" badge shows up when this happens.

---

## 5. Charts & visualizations

Every report result can be visualized in any of these formats:

| Chart | Best for |
|---|---|
| **Table** | Raw rows, the default |
| **Pivot table** | Multi-dimensional cross-tabs |
| **Bar / Column** | Compare categories |
| **Line / Area** | Trends over time |
| **Pie / Donut** | Share-of-total |
| **Scatter** | Relationship between two numerics |
| **Funnel** | Drop-off through stages |
| **Waterfall** | Running additions/subtractions |
| **KPI / Single value** | One headline number with delta |
| **Variance** | Actual vs Budget per account, colored deltas |
| **Map** (geo bubble) | Lat/lng points |

To switch: click the chart-type icon next to the **Run** button. Each
chart has its own settings panel (axes, colors, stacking, smoothing…).

---

## 6. Saving reports and using collections

Click **Save** in the editor:

- give it a name and optional description,
- pick a **collection** (folder) to save it in,
- optionally **pin** it to the top.

Sidebar → **Browse Data** lists all folders. Each collection
page shows its contents in a grid with thumbnails. You can:

- **drag-and-drop** items between collections,
- **rename** or **archive** a collection,
- create **sub-collections** for nested folders.

---

## 7. Dashboards

A dashboard is a grid of cards (reports) you can arrange freely.

Sidebar → **+ New dashboard**:

1. Click **+ Add card** → pick one or more saved reports.
2. **Drag** cards by their header to move them.
3. **Resize** by dragging the bottom-right corner.
4. Click **Save layout**.

### 7.1 Tabs

A dashboard can have multiple **tabs** (e.g. *Sales*, *Operations*,
*Risk*). Click the **+** next to the tab bar to add a new one. Cards
live inside whichever tab is active.

### 7.2 Card menu

Right-click any card (or click the ⋯) for:

- Open the underlying report
- Duplicate
- Refresh now
- Remove from dashboard

### 7.3 Auto-refresh

Set a refresh interval (1m / 5m / 15m / hourly) in the dashboard
settings menu — useful for ops dashboards on a wall TV.

---

## 8. Filters & drill-through

Dashboards support **shared filters** that apply to every card at once.

1. Click **+ Add filter** in the dashboard toolbar.
2. Choose a type: **Date**, **Category**, **Number**, **Text**.
3. Map the filter to a field on each card (e.g. `createdAt` on Card A,
   `txnDate` on Card B). The card's pipeline gets a `$match` stage
   prepended at run time.

**Drill-through**: click a bar / pie slice / table row to drill into
the underlying rows. A side drawer opens showing the documents that
make up that data point — handy for investigating outliers.

---

## 9. Bookmarks (favorites)

Star (☆) any **report**, **dashboard**, **collection** or **dataset** to add it to your
personal **Bookmarks** page.

- Sidebar → **Bookmarks** to see them all.
- The Home page also lists your most-recent 6 bookmarks.

Bookmarks are private to your user account.

---

## 10. Comments & @mentions

Every report and dashboard has a **comments panel** on the right.

- Type a comment and **@mention** a teammate by name.
- They get an in-app notification (and email if SMTP is configured).
- Use comments to ask "why is this number weird?" right in context.

Resolved threads can be marked **done** to keep the panel tidy.

---

## 11. Report revision history

Every save creates a new revision. Open a report → **History**:

- See who changed what and when.
- Click any revision to **preview** the old chart.
- **Revert** to that revision in one click.

This is great when a teammate's tweak breaks a number you trusted.

---

## 12. Public share links

Open any report or dashboard → click **Share** → toggle **Public link**.

- A read-only URL like `https://your-app/share/<token>` is generated.
- Anyone with the link can view — **no login required**.
- The shared view is sandboxed: filters work, but no editing, comments,
  or AI features.
- The footer says **"Powered by Fyntrac Insight"**.

You can revoke the link any time — the token is rotated and the old
URL stops working immediately.

---

## 13. Embedding in another app

For embedding inside the main Fyntrac app or any iframe:

1. Open the report/dashboard → **Share** → **Embed**.
2. Copy the snippet — it includes a signed HS256 JWT scoped to that
   resource only.
3. Paste into your host page:

   ```html
   <iframe
     src="https://your-app/embed/dashboard/123?token=eyJhbGciOi..."
     width="100%" height="700" frameborder="0">
   </iframe>
   ```

Embed tokens expire after 1 hour by default.

---

## 14. Subscriptions (scheduled email)

Want a dashboard delivered every morning at 9?

1. Open the dashboard → **Subscriptions**.
2. **+ New subscription**:
   - **Recipients** — comma-separated emails or @mention teammates,
   - **Schedule** — daily / weekly / monthly / cron expression,
   - **Format** — PNG, PDF or CSV attachment,
   - **Filters** — apply specific filter values for the email.
3. **Save**.

A cron job inside the backend runs every minute and fires due
subscriptions. Email goes through the SMTP server you configured in
`backend/.env`.

---

## 15. Alerts

Get notified when a KPI crosses a threshold.

1. Open a single-value (KPI) report → click the **🔔 Alert** button.
2. Set the trigger:
   - **Above / Below / Changed by** a value,
   - check **every** N minutes.
3. Pick recipients (email, optionally Slack webhook).

The backend evaluates alerts on the same cron loop as subscriptions.
You'll see a yellow badge on the report once the alert is active.

---

## 16. Reconciliations

A **reconciliation** compares two sources side-by-side and tells you
where they agree and where they don't — essential for closing the
books, validating ETL, or spot-checking an integration.

Sidebar → **Reconciliations** → **+ New Reconciliation**.

### 16.1 Pick two sources

Each side (A and B) can be either:

- a saved **Dataset** — always on, always fresh, no upload needed; or
- a **CSV file** uploaded inline (up to ~25 MB).

Datasets are the source-of-truth side; CSVs are usually the
third-party file you're checking against.

### 16.2 Map columns

The **Mapping wizard** auto-suggests:

- **Keys** — columns that uniquely identify a row on each side
  (e.g. `account_no`, `txn_id`).
- **Measures** — numeric columns to compare (e.g. `amount`).
- **Attributes** — categorical columns that should match exactly
  (e.g. `currency`, `status`).

Suggestions are scored on name similarity, type, value overlap, and
cardinality. Tweak the auto-mapping with the dropdowns and add
**transforms** per column — trim, upper-case, strip non-alphanumeric,
number, abs, or `date:day|month|quarter|year`.

### 16.3 Tolerances and options

- Per-measure **absolute** and **percentage** tolerance (e.g. `±0.01`
  or `±0.5%`) — a row inside the tolerance is **matched**.
- **Aggregate before match** — sum measures by key first, then compare
  (useful when one side has line items and the other has totals).
- **Schedule** — cron-style. The recon runs automatically and emails
  recipients when the mismatch count or amount crosses your threshold.

### 16.4 Run and review

Click **Run now**. Results land in 4 tabs:

- **Matched** — keys present on both sides, measures within tolerance.
- **Mismatched** — keys on both sides but measures differ; deltas are
  shown with green/red colour-coding.
- **Only A** — keys missing from side B.
- **Only B** — keys missing from side A.

Each tab can be **exported as CSV** for sharing with auditors. The run
history card shows totals for the last 30 runs so you can spot drift.

---

## 17. Datasets

A **dataset** is a virtual collection — a reusable aggregation that
other reports can query as if it were a real collection. (Internally
the code calls these "saved models"; the UI label everywhere is
**Datasets**.)

Sidebar → **Datasets** → **+ New Dataset**:

1. Pick a starter — **Blank dataset**, **Combine two tables** (join),
   **Roll up by period** (group by month/quarter/year), or **From an
   existing report**.
2. Build the pipeline that shapes the data (joins, computed fields,
   filters).
3. Save with a name like `paid_orders_v1`.

Now any new report can pick `paid_orders_v1` from the **From**
dropdown — the dataset's pipeline is automatically prepended.

Datasets are also the only valid "source A" for a Reconciliation —
so curating them is the team's way of agreeing on the numbers.

---

## 18. KPIs

A **KPI** is a named, reusable aggregation (e.g. "Net Revenue").
The code refers to these as `metrics`; the UI calls them **KPIs**.

Sidebar → **KPIs** → **+ New KPI**:

- pick a dataset or collection,
- define the formula (e.g. `sum($amount) - sum($refund)`),
- give it a name and description,
- optionally a **format** (currency, percentage, number with N decimals).

KPIs show up in the **Summarize** dropdown of any report that
references the same source — so the whole team computes "Net Revenue"
the same way.

---

## 19. Saved filters

A **saved filter** is a reusable chunk of pipeline JSON. (Code calls
these `snippets`; UI says **Saved Filters**.)

Sidebar → **Saved Filters** → **+ New Saved Filter**:

- name it (e.g. `last_30_days`),
- write the partial pipeline:

  ```json
  [{ "$match": { "createdAt": { "$gte": "{{thirty_days_ago}}" } } }]
  ```

In the native editor, type `{{` and the saved-filter picker pops up —
pick `last_30_days` and the editor inserts it inline.

---

## 20. Trash & restore

Deleted items go to the **Trash**, not the void.

Sidebar → **Trash**:

- See reports, dashboards, collections, datasets, KPIs, and saved
  filters you removed.
- Click **Restore** to put them back where they were.
- Click **Delete forever** to purge permanently.

Items older than 30 days are auto-purged.

---

## 21. The AI co-pilot

Click the **sparkle icon** in the topbar (or press **Ctrl/Cmd+K** then
*Ask AI*) to open the **AI Chat Drawer**.

The co-pilot is **intent-driven**: instead of free-form prompts only,
you can pick from finance-shaped intents (Trend, Breakdown, Variance,
Top-N, KPI, Detail). Each intent grounds the AI with the right
collections, joins, and chart defaults.

Things you can do:

- ask in plain English: *"top 10 transactions by amount last month"*
  — the AI writes the aggregation pipeline,
- click **Run** to execute it and pipe the result into the report
  editor,
- ask follow-ups: *"now group by status"*, *"chart this as a bar"*.

Inside any report editor you also get an **AI panel**:

- **Plan** — the AI proposes a step-by-step pipeline; review the plan
  card and click **Apply** to load it into the editor.
- **Explain this number** — click any cell or KPI value and the AI
  describes what produced it (filters, group, aggregation).
- **Inline proposer** — a one-line prompt above the result lets you
  tweak the report ("add prior-year comparison", "break out by
  region") without leaving the page.

The active provider/model is shown as a chip in the drawer header.

---

## 22. AI settings (Anthropic / OpenAI / Gemini)

Click the **gear** in the AI drawer header → **AI Settings**.

Three tabs — **Anthropic**, **OpenAI**, **Gemini**:

1. Paste your API key.
2. Click **Test Key** — confirms the key is valid.
3. Pick a **model** from the auto-populated dropdown
   (e.g. `claude-sonnet-4-5`, `gpt-4o`, `gemini-1.5-pro`).
4. Click **Make active** — that's now the model used everywhere.

Keys are encrypted with **AES-256-GCM** before being stored. Each user
has their own keys; nothing is shared.

You can switch providers at any time without losing your chat history.

---

## 23. Keyboard shortcuts

| Key | Action |
|---|---|
| `Ctrl/Cmd + K` | Open command palette / global search |
| `Ctrl/Cmd + Enter` | Run pipeline (in editor) |
| `Ctrl/Cmd + S` | Save report / dashboard |
| `Ctrl/Cmd + /` | Toggle AI drawer |
| `?` | Show keyboard shortcuts dialog |
| `Esc` | Close any modal / drawer |

The full list lives behind the `?` shortcut.

---

## 24. Theme toggle (light / dark)

The **sun/moon** icon in the topbar switches between light and dark
mode. The choice is remembered across sessions.

Both themes use the Fyntrac brand palette: indigo `#6366f1`, navy
`#14213d`, amber `#f59e0b` accent. Charts auto-adjust colors for
readability in either mode.

---

## 25. Admin area

Sidebar → **Admin** (visible if your role is `admin`):

- **Audit log** — every create/update/delete action with user, time
  and IP.
- **Users & roles** — see who has access; promote/demote.
- **Connection settings** — view (read-only) the configured MongoDB URIs.
- **Cache** — see cache hit ratio; click **Flush** to invalidate.
- **System info** — version, uptime, Node version, memory usage.

---

## Need more?

- For **install / setup / dev troubleshooting** see [instructions.md](instructions.md).
- For source code see the [backend/](backend/) and [frontend/](frontend/) folders.
- File issues or feature requests in the GitHub repo.
