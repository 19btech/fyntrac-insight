# Fyntrac Analytics Service — Implementation Prompt
### Metabase-Inspired Embedded BI Platform (MongoDB + React + MUI)

---

## CONTEXT & GOAL

Build **Fyntrac Analytics** — a standalone, self-hosted analytics microservice that looks and behaves like Metabase, purpose-built for MongoDB and designed to be embedded into the Fyntrac application via JWT-authenticated API integration.

This is a **separate service** with its own frontend and backend. The Fyntrac main app will integrate it by passing a signed JWT containing the `tenantId` and user role. All queries are automatically scoped to that tenant.

---

## TECH STACK

| Layer | Technology |
|---|---|
| Frontend | React 18, MUI v5 (Material UI), React Router v6 |
| Charts | Recharts |
| Query Editor | Monaco Editor (@monaco-editor/react) |
| Drag-and-drop layout | react-grid-layout |
| Backend | Node.js + Express |
| Database | MongoDB (via Mongoose) — analytics metadata store + target data source |
| Auth | JWT (RS256) — validated from Fyntrac main app |
| Caching | In-memory (node-cache) with Redis adapter option |
| AI Chatbot | Anthropic Claude API (claude-sonnet-4-20250514) via streaming |
| Scheduler | node-cron (for alerts) |
| Export | html2canvas (PNG), json2csv (CSV export) |

---

## PROJECT STRUCTURE

```
fyntrac-analytics/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── query.routes.js        # Execute aggregation pipelines
│   │   │   ├── dashboard.routes.js    # CRUD for dashboards
│   │   │   ├── question.routes.js     # CRUD for saved questions/queries
│   │   │   ├── collection.routes.js   # Folder/collection management
│   │   │   ├── schema.routes.js       # MongoDB schema introspection
│   │   │   ├── ai.routes.js           # AI chatbot + pipeline gen endpoints
│   │   │   ├── alert.routes.js        # Data alert management
│   │   │   └── share.routes.js        # Public share token management
│   │   ├── models/
│   │   │   ├── Dashboard.model.js
│   │   │   ├── Question.model.js
│   │   │   ├── Collection.model.js
│   │   │   ├── Metric.model.js
│   │   │   ├── Alert.model.js
│   │   │   ├── ShareToken.model.js
│   │   │   └── AuditLog.model.js
│   │   ├── services/
│   │   │   ├── mongo.service.js       # Connect to target MongoDB, execute pipelines
│   │   │   ├── schema.service.js      # Introspect collections, infer field types
│   │   │   ├── ai.service.js          # Claude API integration, streaming
│   │   │   ├── cache.service.js       # Query result caching (TTL-based)
│   │   │   └── alert.service.js       # node-cron alert evaluation
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js     # Validate JWT, extract tenantId + role
│   │   │   └── tenant.middleware.js   # Inject tenantId into all query contexts
│   │   └── index.js
├── frontend/
│   ├── src/
│   │   ├── theme/
│   │   │   └── metabaseTheme.js       # MUI theme matching Metabase colors/typography
│   │   ├── layout/
│   │   │   ├── AppShell.jsx           # Top navbar + left sidebar layout wrapper
│   │   │   ├── Sidebar.jsx            # Collapsible left nav
│   │   │   └── Topbar.jsx             # Search, New button, breadcrumbs, user menu
│   │   ├── pages/
│   │   │   ├── Home.jsx               # Landing with recent + pinned items
│   │   │   ├── Dashboard.jsx          # Dashboard viewer + editor
│   │   │   ├── QuestionEditor.jsx     # Query builder + native pipeline editor
│   │   │   ├── Browse.jsx             # Browse collections folder tree
│   │   │   ├── Collection.jsx         # Collection contents
│   │   │   └── SharedDashboard.jsx    # Public share view (no auth)
│   │   ├── components/
│   │   │   ├── dashboard/
│   │   │   │   ├── DashboardGrid.jsx
│   │   │   │   ├── DashboardCard.jsx
│   │   │   │   ├── DashboardFilters.jsx
│   │   │   │   ├── DashboardTabs.jsx
│   │   │   │   └── TextCard.jsx
│   │   │   ├── charts/
│   │   │   │   ├── LineChart.jsx
│   │   │   │   ├── BarChart.jsx
│   │   │   │   ├── AreaChart.jsx
│   │   │   │   ├── PieChart.jsx
│   │   │   │   ├── ComboChart.jsx
│   │   │   │   ├── ScatterChart.jsx
│   │   │   │   ├── FunnelChart.jsx
│   │   │   │   ├── MetricCard.jsx
│   │   │   │   ├── DataTable.jsx
│   │   │   │   └── ChartRenderer.jsx
│   │   │   ├── query-builder/
│   │   │   │   ├── CollectionPicker.jsx
│   │   │   │   ├── FieldPicker.jsx
│   │   │   │   ├── FilterBuilder.jsx
│   │   │   │   ├── SummarizePanel.jsx
│   │   │   │   ├── SortLimitPanel.jsx
│   │   │   │   └── VisualizeButton.jsx
│   │   │   ├── native-editor/
│   │   │   │   ├── PipelineEditor.jsx
│   │   │   │   ├── ResultsPreview.jsx
│   │   │   │   └── VariablePanel.jsx
│   │   │   ├── ai/
│   │   │   │   ├── AIChatDrawer.jsx
│   │   │   │   ├── AIChatMessage.jsx
│   │   │   │   ├── AIInsightBadge.jsx
│   │   │   │   └── AIQuerySuggestions.jsx
│   │   │   └── shared/
│   │   │       ├── SearchModal.jsx
│   │   │       ├── NewItemMenu.jsx
│   │   │       ├── ShareModal.jsx
│   │   │       ├── DownloadMenu.jsx
│   │   │       └── CollectionBreadcrumb.jsx
│   │   ├── hooks/
│   │   │   ├── useQuery.js
│   │   │   ├── useDashboard.js
│   │   │   ├── useSchema.js
│   │   │   └── useAI.js
│   │   ├── store/
│   │   │   └── filterStore.js         # Zustand store for dashboard filter state
│   │   └── App.jsx
```

---

## PHASE 1 — CORE (Build First)

### 1.1 Backend Foundation

**Auth Middleware (`auth.middleware.js`)**
- Validate incoming JWT signed by Fyntrac (RS256)
- Extract `tenantId`, `userId`, `role` from claims
- Attach to `req.user` for all downstream handlers
- All query executions must append `{ $match: { tenantId: req.user.tenantId } }` as the FIRST pipeline stage

**MongoDB Service (`mongo.service.js`)**
- Maintain a connection pool to the target MongoDB instance
- `executePipeline(collection, pipeline, tenantId)` — automatically prepends tenant $match
- `getCollections()` — list all collections available to this tenant
- `inferSchema(collection, tenantId)` — sample 100 docs, infer field names + types

**Query Routes (`query.routes.js`)**
```
POST /api/query/run
Body: { collection, pipeline: [...], variables: {} }
Response: { data: [...], columns: [...], executionTime: ms }
```
- Validate pipeline is a valid JSON array
- Substitute template variables ({{variable_name}})
- Prepend tenant $match
- Execute via mongo.service
- Cache result by SHA256(tenantId + collection + pipeline + variables) with configurable TTL (default 5 min)

**Schema Routes (`schema.routes.js`)**
```
GET /api/schema/collections
GET /api/schema/collections/:name/fields
```
Returns field names + inferred types (string, number, date, boolean, objectId, array, object)

**Dashboard Routes (`dashboard.routes.js`)**
```
GET    /api/dashboards
POST   /api/dashboards
GET    /api/dashboards/:id
PUT    /api/dashboards/:id
DELETE /api/dashboards/:id
```
Dashboard model: `{ name, description, tenantId, layout, cards, filters, tabs, createdBy, updatedAt }`

**Question Routes (`question.routes.js`)**
```
GET    /api/questions
POST   /api/questions
GET    /api/questions/:id
PUT    /api/questions/:id
DELETE /api/questions/:id
```
Question model: `{ name, description, tenantId, type: 'builder'|'native', queryConfig, chartConfig, collectionId, createdBy }`

---

### 1.2 MUI Theme — Metabase-Identical Visual Design

Create `metabaseTheme.js`:

```javascript
const palette = {
  primary: { main: '#509ee3', dark: '#2d86d4', light: '#74b3eb' },
  secondary: { main: '#f0f0f0' },
  background: {
    default: '#f9fbfc',     // Metabase page background
    paper: '#ffffff',
    sidebar: '#1e2029',     // Dark sidebar
    sidebarActive: '#3a3d4d',
  },
  text: {
    primary: '#4c5773',     // Metabase body text
    secondary: '#949aaa',
    sidebar: '#c7ccd4',
  },
  divider: '#eeecec',
  success: { main: '#84bb4c' },
  error: { main: '#ed6e6e' },
  warning: { main: '#f9cf48' },
};

// Font: Lato (import from Google Fonts in index.html)
const typography = {
  fontFamily: '"Lato", "Helvetica Neue", Arial, sans-serif',
  h1: { fontSize: '1.5rem', fontWeight: 700, color: palette.text.primary },
  h2: { fontSize: '1.25rem', fontWeight: 700, color: palette.text.primary },
  body1: { fontSize: '0.875rem', color: palette.text.primary },
  body2: { fontSize: '0.8125rem', color: palette.text.secondary },
};
```

Key visual rules matching Metabase exactly:
- Sidebar: dark background #1e2029, collapsible to icon-only
- Top navbar: white, 1px bottom border #eeecec, no shadow
- Cards: white, border-radius 8px, box-shadow `0 1px 3px rgba(0,0,0,0.08)`
- Buttons: rounded, primary blue #509ee3
- Page background: #f9fbfc (very light blue-gray)
- Active sidebar item: background #3a3d4d + 3px left border #509ee3

---

### 1.3 App Shell Layout

**`AppShell.jsx`**
- Left sidebar: 240px wide, collapsible to 56px icon-only
- Top navbar: 56px tall, full width
- Main content area with correct padding and scroll

**`Sidebar.jsx`** — dark left navigation
```
[Fyntrac Analytics Logo]
─────────────────────────
Home
Search
─────────────────────────
Dashboards
Questions
Browse Collections
─────────────────────────
[+ New]
─────────────────────────
Settings (admin only)
```

**`Topbar.jsx`**
- Left: hamburger toggle + breadcrumb trail
- Center: global search bar (opens SearchModal on focus, Cmd+K shortcut)
- Right: "+ New" button, AI chat icon, dark mode toggle, user avatar menu

---

### 1.4 Dashboard Page

**View mode:**
- Filter bar at top (if dashboard has filters)
- react-grid-layout grid (read-only)
- Each card: chart title, chart, three-dot overflow menu (Download PNG, Download CSV, View Question, Fullscreen, AI Insight)
- Auto-refresh selector (Off, 1m, 5m, 10m, 30m, 1hr)
- Header: name, description, pencil (edit), share button

**Edit mode:**
- react-grid-layout becomes draggable + resizable
- Toolbar: "+ Add question", "+ Add text card", "+ Add filter", "Save", "Discard"
- Card hover: shows X (remove), duplicate icon, resize grip (bottom-right)
- Filter configuration sidebar

**Persistence:**
Save `layout` (react-grid-layout positions array) + `cards` (questionId + chartConfig overrides) + `filters` to MongoDB.

---

### 1.5 Question Editor

Two-tab interface: **Query Builder** | **Native (Pipeline)**

**Query Builder tab:**
```
[Pick collection ▼] → [Filter +] → [Summarize +] → [Sort/Limit]
                                                           ↓
                                                  [▶ Visualize]
```
- Collection picker: searchable dropdown from schema introspection
- Filter builder: field + operator (equals, contains, >, <, between, in, is null) + value → generates $match
- Summarize: Group by field(s) + aggregation (Count, Sum, Avg, Min, Max) → generates $group
- Sort (field + asc/desc) + Limit (numeric input)
- Visualize: runs query, auto-suggests chart type from result shape

**Native Pipeline tab:**
- Monaco Editor (JSON mode, full height)
- Template variable panel: auto-detected {{variable}} tags → type + default value input
- "Run" button → results displayed below
- Variable override panel for testing

**Results + Chart panel:**
- Tab strip: Table | Line | Bar | Area | Pie | Metric | Scatter | Combo
- Chart config sidebar: x-axis, y-axis field(s), goal line, label format
- Save button → name + collection folder modal

---

### 1.6 Tenant Scoping (CRITICAL)

Every MongoDB aggregation pipeline executed by the backend MUST begin with:
```javascript
{ $match: { tenantId: req.user.tenantId } }
```
This is enforced at the `mongo.service.js` execution layer — not at the route level. Reject any pipeline where the first stage attempts to set a different tenantId. Log violations.

---

## PHASE 2 — AI CHATBOT (Metabot Equivalent)

### 2.1 AI Service

**`ai.service.js`** using Anthropic streaming SDK:

```javascript
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function* streamChatResponse(messages, schemaContext) {
  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: buildSystemPrompt(schemaContext),
    messages,
  });
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta') yield chunk.delta.text;
  }
}
```

**System prompt structure (`buildSystemPrompt`):**
```
You are Fyntrac Analytics AI, an intelligent data assistant.

You have access to these MongoDB collections and schemas:
${collections.map(c => `Collection: ${c.name}\nFields: ${c.fields.map(f => `${f.name} (${f.type})`).join(', ')}`).join('\n\n')}

When generating MongoDB aggregation pipelines:
- ALWAYS start with: { "$match": { "tenantId": "{{TENANT_ID}}" } }
- Use valid MongoDB aggregation operators only
- Wrap pipeline JSON in triple backticks with language tag "json"
- Suggest the best chart type for the result

When explaining insights:
- 2-4 sentences: trends, outliers, key takeaways
- Suggest follow-up questions

Current tenantId: {{TENANT_ID}}
Current role: {{ROLE}}
```

**AI Routes (`ai.routes.js`):**
```
POST /api/ai/chat               # Streaming chat endpoint (SSE)
POST /api/ai/generate-pipeline  # Generate pipeline from natural language
POST /api/ai/insight            # Explain chart data (streaming)
POST /api/ai/suggestions        # 3 contextual query suggestions for a collection
```

---

### 2.2 AI Chat Drawer (`AIChatDrawer.jsx`)

Slide-in MUI Drawer from the right (480px wide). Opens via AI icon in topbar or Cmd+Shift+A.

```
┌─────────────────────────────┐
│  Fyntrac AI          [✕]    │
├─────────────────────────────┤
│                             │
│  [assistant bubble]         │
│              [user bubble]  │
│  [assistant bubble]         │
│  ┌─────────────────────┐   │
│  │ Run this query →    │   │  ← when AI generates a pipeline
│  └─────────────────────┘   │
│                             │
│  Try asking:                │
│  [How many rules ran today?]│
│  [Failed rules by type]     │
│                             │
├─────────────────────────────┤
│  [Type a question...  ] [↑] │
└─────────────────────────────┘
```

- Streaming: text appears token-by-token using SSE
- When AI generates a pipeline: show "Run this query →" button that opens QuestionEditor pre-populated
- Context-aware: inject current dashboard name + visible filter state into the AI context
- Suggested questions: 3 chips refreshed per collection via `/api/ai/suggestions`

---

### 2.3 AI Insight on Chart Cards

Each chart card header has a sparkle icon (✨). On click:
1. Send first 50 rows of chart data + chart config to `/api/ai/insight`
2. Stream 2-3 sentence insight below the chart
3. "Ask follow-up →" opens AIChatDrawer with chart context pre-loaded

---

### 2.4 AI Pipeline Suggestions in Editor

Above the native pipeline Monaco editor, show 3 suggestion chips per collection:
- "Top 10 by count"
- "Trend over last 30 days"
- "Distribution by [primary field]"

Clicking a chip calls `/api/ai/generate-pipeline`, inserts result into Monaco editor, shows explanation as a callout.

---

## PHASE 2 (CONTINUED)

### Saved Models
Named, reusable aggregation pipelines that act as virtual collections. Show with a package icon in the collection picker alongside raw collections. Model pipeline is prepended to any further query.

### Metrics Definitions
Named KPIs: `{ name, collection, pipeline, displayFormat, prefix, suffix, goalValue, trend }`. Pre-built as KPI cards addable to any dashboard.

### Result Caching
Cache key: SHA256(`tenantId:collection:JSON.stringify(pipeline)`). Default TTL 5 minutes. Return `X-Cache: HIT` header + `cachedAt` timestamp. Manual "Refresh" button on card.

### Cross-Filtering
Chart click events update Zustand `filterStore`. All dashboard cards listen to the store and re-fetch when filter values change. Implementation: each card subscribes to filter state; click handlers call `filterStore.setFilter(field, value)`.

### Public Share Links
```
POST /api/share → { token, url: '/share/{token}' }
```
`SharedDashboard.jsx` — read-only view, no auth, fetches via token. "Powered by Fyntrac Analytics" footer.

### Download Options
- PNG: `html2canvas(cardElement)` → download
- CSV: `json2csv(queryResult)` → download
- Both triggered from card overflow (three-dot) menu

---

## PHASE 3 — ADVANCED

### Email Alerts (node-cron)
- Alert model: `{ questionId, condition: { operator, threshold }, frequency, recipients }`
- Cron job evaluates alerts, compares metric value to threshold, sends HTML email via Nodemailer
- Alert conditions: greater than, less than, equals, changes by %

### Row-Level Security
Extend tenant $match with user JWT attributes:
```javascript
function buildSecurityFilter(user) {
  const filter = { tenantId: user.tenantId };
  if (user.attributes?.region) filter.region = user.attributes.region;
  if (user.attributes?.department) filter.department = user.attributes.department;
  return { $match: filter };
}
```
Attribute→field mappings stored in a `TenantSecurityConfig` collection.

### Usage Analytics (Audit Log)
Log every action: `{ tenantId, userId, action, resourceId, resourceType, executionTimeMs, timestamp }`. Admin-only dashboard showing most viewed dashboards, active users, query performance.

### Dashboard Version History
Store last 15 versions of each dashboard as snapshots in MongoDB. Version history modal with restore capability.

---

## FYNTRAC MAIN APP INTEGRATION CONTRACT

**Option A — iframe embed:**
```html
<iframe
  src="https://analytics.fyntrac.com/?token={JWT}"
  style="width: 100%; height: 100%; border: none;"
/>
```

**Option B — subdomain / proxied route:**
Analytics served at `analytics.fyntrac.com` or `/analytics` proxied route. JWT passed as query param on initial load, stored in sessionStorage.

**JWT payload expected:**
```json
{
  "sub": "user_id",
  "tenantId": "tenant_abc123",
  "role": "admin" | "editor" | "viewer",
  "attributes": { "region": "APAC", "department": "Finance" },
  "exp": 1234567890,
  "iss": "fyntrac-main"
}
```

---

## ENVIRONMENT VARIABLES

```env
# Backend
PORT=4000
MONGODB_URI=mongodb://localhost:27017/<TENANT>_INSIGHT
TARGET_MONGODB_URI=mongodb://localhost:27017/<TENANT>
JWT_PUBLIC_KEY=<RS256 public key from Fyntrac main app>
ANTHROPIC_API_KEY=sk-ant-...
CACHE_TTL_SECONDS=300
CORS_ORIGIN=https://app.fyntrac.com

# Frontend
REACT_APP_API_BASE_URL=http://localhost:4000/api
REACT_APP_SERVICE_NAME=Fyntrac Analytics
```

---

## UI DESIGN SPECIFICATIONS

### Color Tokens (match Metabase exactly)
| Token | Hex | Usage |
|---|---|---|
| `--brand` | #509ee3 | Primary buttons, links, active states |
| `--sidebar-bg` | #1e2029 | Sidebar background |
| `--sidebar-text` | #c7ccd4 | Sidebar nav items |
| `--sidebar-active` | #3a3d4d | Active sidebar item background |
| `--page-bg` | #f9fbfc | Main content background |
| `--card-bg` | #ffffff | Chart card background |
| `--card-border` | #eeecec | Card and divider borders |
| `--text-primary` | #4c5773 | Main body text |
| `--text-secondary` | #949aaa | Muted/helper text |
| `--success` | #84bb4c | Positive trends, up arrows |
| `--error` | #ed6e6e | Error states, down trends |
| `--warning` | #f9cf48 | Warning states |

### Typography
- Font family: **Lato** (import from Google Fonts)
- Body: 14px / weight 400
- Card titles: 14px / weight 700
- Dashboard name: 20px / weight 700
- Sidebar nav items: 13px / weight 400

### Component Dimensions
- Sidebar width: 240px (collapsed: 56px)
- Top navbar height: 56px
- Dashboard filter bar height: 48px
- Chart card border-radius: 8px
- Chart card box-shadow: `0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)`
- Card header height: 40px, padding 0 16px
- Active sidebar item: left border 3px solid #509ee3 + bg #3a3d4d

---

## IMPLEMENTATION ORDER

Build in this sequence for earliest working demo:

1. Backend: auth middleware → mongo service → query execution endpoint
2. MUI theme + AppShell + Sidebar + Topbar
3. Dashboard viewer (read-only, hardcoded test questions)
4. Question native pipeline editor + results table
5. Chart components: Line, Bar, Pie, MetricCard, DataTable
6. Dashboard editor: react-grid-layout drag/resize + save to MongoDB
7. Dashboard filters + filter binding to chart cards
8. Query builder: collection picker → filter builder → summarize → visualize
9. Save/load questions and dashboards
10. Collections / Browse UI
11. AI chat drawer + streaming (Phase 2)
12. AI insight badges on chart cards
13. AI pipeline generation in editor
14. Public share links
15. Download PNG / CSV
16. Saved models + metrics definitions
17. Cross-filtering
18. Result caching
19. Alerts (node-cron + Nodemailer)
20. Usage analytics / audit log

---

## CONSTRAINTS

- No own auth system — consumes JWTs from Fyntrac only
- Target MongoDB is read-only (no write operations on data source)
- Metadata (dashboards, questions, collections) uses a SEPARATE MongoDB database from target data
- Multi-tenancy enforced at mongo.service.js layer — never trust frontend-passed tenantId
- AI-generated pipelines must be validated for tenant $match before execution
- This is an original implementation inspired by Metabase UX — do not copy Metabase source code or assets
