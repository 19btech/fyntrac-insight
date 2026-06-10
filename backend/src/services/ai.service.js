const credService = require('./ai-credentials.service');
const providers = require('./ai-providers.service');
const mongoService = require('./mongo.service');
const duckdbService = require('./duckdb.service');

/**
 * Resolve effective AI credentials for a user.
 */
async function resolveCreds(user) {
  const AISettings = user.getModel('AISettings');
  const settings = await AISettings.findOne({ tenantId: user.tenantId, userId: user.userId });
  const provider = settings?.activeProvider || 'anthropic';
  const cfg = settings?.providers?.[provider] || {};
  let apiKey = '';
  if (cfg.encryptedKey) {
    try { apiKey = credService.decrypt(cfg.encryptedKey); } catch { apiKey = ''; }
  }
  if (!apiKey) {
    apiKey =
      provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY :
      provider === 'openai' ? process.env.OPENAI_API_KEY :
      provider === 'gemini' ? process.env.GEMINI_API_KEY : '';
  }
  if (!apiKey) {
    throw new Error(
      `No API key configured for ${provider}. Open the AI panel and add a key in Settings.`
    );
  }
  const model = settings?.activeModel || cfg.model || providers.DEFAULT_MODELS[provider];
  const conservative = !!settings?.conservativeMode;
  return { provider, apiKey, model, conservative };
}

/**
 * Pull the user's curated objects so the AI can reference them by name
 * instead of inventing field paths.
 */
async function buildGroundedContext(user) {
  const tenantId = user.tenantId;
  const SavedModel = user.getModel('SavedModel');
  const Metric = user.getModel('Metric');
  const [datasets, kpis] = await Promise.all([
    SavedModel.find({ tenantId, archived: { $ne: true } }).select('name description collection verified').limit(50).lean(),
    Metric.find({ tenantId, archived: { $ne: true } }).select('name description collection definition format').limit(50).lean(),
  ]);
  return { datasets, kpis };
}

function buildSystemPrompt(schemaContext, grounded, tenantId, role, conservative = false) {
  const schemaBlock = schemaContext
    .map(
      (c) =>
        `Collection: ${c.name}\nFields: ${c.fields.map((f) => `${f.name} (${f.type})`).join(', ')}`
    )
    .join('\n\n');

  const datasetBlock = grounded.datasets.length
    ? grounded.datasets.map(d => `- "${d.name}" (collection: ${d.collection})${d.verified ? ' [certified]' : ''}${d.description ? `: ${d.description}` : ''}`).join('\n')
    : '(none)';

  const kpiBlock = grounded.kpis.length
    ? grounded.kpis.map(k => `- "${k.name}" (collection: ${k.collection}, format: ${k.format?.kind || 'number'})${k.description ? `: ${k.description}` : ''}`).join('\n')
    : '(none)';

  return `You are Fyntrac Insight, an AI analytics guide and co-pilot for finance teams.

Your job is to BE the analyst, guide, and explainer — not to delegate work back to the user.

THINGS THE USER HAS ALREADY DEFINED — prefer these over raw collections:

Datasets (curated, reusable pipelines):
${datasetBlock}

KPIs (named metrics with formatting and targets):
${kpiBlock}

Raw collections and inferred schemas (use only if no Dataset fits):
${schemaBlock}

WHAT YOU CAN DO — you are an AGENT with tools. Use them; never claim you can't:
- run_sql: WRITE and RUN a read-only SQL query (DuckDB / PostgreSQL-style: SELECT, JOIN, WITH, CASE, window functions) over the user's data. The result table AND the exact SQL you wrote are shown to the user automatically, with a copy button and "Open in Prism". Use this whenever the user asks you to "write/create a SQL query", "create a Prism query" (a Prism query IS a SQL query), "run a query", or asks a data question best answered with SQL. After it runs, add a 1–2 sentence interpretation. NEVER reply "I don't generate SQL here" or "I can't create a query" — you can, so do it.
- propose_kpi: propose a KPI for the user to create (they confirm on a card). Use when they ask to create/build a KPI or metric. Filters + time intelligence are added automatically.
- compute_aggregation: run a MongoDB aggregation for exact numbers when the in-context sample is only partial.
Tables in SQL are the collections in the catalog above; columns are their fields.
When the user asks "what can you do?" / "what are your capabilities?", tell them plainly: answer questions about their data (and show the SQL + an inline result table), write and run SQL / Prism queries, propose KPIs they can create with one click, and explain or analyse the dataset, report, or reconciliation they have open.

CHAT BEHAVIOUR RULES (apply in ALL conversational responses):
1. Do NOT paste MongoDB aggregation-pipeline JSON or tell the user to go run something themselves. You CAN, however, write and RUN SQL with run_sql — do that whenever a query/SQL is requested or it's the clearest way to answer a data question. Stay consistent: if you can run it, run it; don't first refuse and then do it.
2. When asked for aggregations (sum, average, count, max, min), compute them directly from the sample rows provided in the active modal context and present the numeric result. If the sample is partial, say so clearly (e.g. "Based on the 25 preview rows…") and give the actual computed number — or run run_sql / compute_aggregation for the exact figure.
3. When asked how to do something in the UI (filter, sort, group, join, add a step, interpret a tab), give clear step-by-step instructions in plain English — no code.
4. When asked to explain a modal, dataset, report, or reconciliation, describe what it does, what each tab is for, and how to use it — in conversational prose, not bullet lists of field paths.
5. Don't tell the user to run a MongoDB pipeline themselves. Either compute the answer directly, or use run_sql (which runs it for them and shows the SQL).
6. Format answers with markdown: **bold** key numbers, use tables for multi-column results, use bullet points for lists of steps or options. Keep answers concise and finance-friendly.
7. ALWAYS scope any internal understanding to tenantId "${tenantId}".
8. When the active context says sample is PARTIAL and the user asks for exact computations (total, sum, average, max, min, top-N, highest, lowest, count) — use the compute_aggregation tool against the FULL dataset using the collection and pipeline shown in the active context block. Prepend the report/dataset pipeline before your aggregation stages so field transformations are applied correctly.
9. When the active context says sample is COMPLETE (all rows present), compute directly from those rows — do NOT call the tool, it is unnecessary.
10. After receiving compute_aggregation results, answer directly in plain English with **bold** key numbers. Do not mention the tool, the pipeline, or any technical details.
11. NEVER say "there was an issue", "I encountered an error", or "I was unable to retrieve" as a result of tool failure. If the tool fails or returns empty results, silently compute from the sample rows and answer directly.
12. For UI how-to questions (how do I filter, how do I group), answer in plain English steps — no tool use needed.
${conservative ? '11. CONSERVATIVE MODE: only reason about collections referenced by an existing Dataset or KPI.' : ''}

Current tenantId: ${tenantId}
Current role: ${role}`;
}

function buildActiveReportBlock(dashboardContext) {
  const r = dashboardContext && dashboardContext.activeReport;
  if (!r) return '';
  const cols = (r.columns || []).map((c) => (typeof c === 'string' ? c : c.name)).filter(Boolean);
  const sampleRows = Array.isArray(r.sampleRows) ? r.sampleRows.slice(0, 50) : [];
  const samplePreview = sampleRows.length
    ? JSON.stringify(sampleRows)
    : '(no rows yet — the report has not been run)';
  const totalRows = r.rowCount ?? sampleRows.length;
  const isComplete = sampleRows.length >= totalRows && sampleRows.length > 0;
  const completenessNote = sampleRows.length === 0
    ? 'Sample status: NO DATA YET'
    : isComplete
      ? `Sample status: COMPLETE — all ${totalRows} row(s) are in the sample above. Compute aggregations directly from these rows; do NOT use the compute_aggregation tool.`
      : `Sample status: PARTIAL — ${sampleRows.length} of ${totalRows} rows shown. Use the compute_aggregation tool for exact aggregations, prepending the pipeline above before your stages.`;
  return `\n\nACTIVE REPORT (the user is currently viewing this; ground ALL answers here):
Name: ${r.name || '(unnamed)'}${r.description ? `\nDescription: ${r.description}` : ''}
Source collection: ${r.collection || '(none)'}
Chart type: ${r.chartType || 'table'}
Total row count: ${totalRows}
Columns: ${cols.length ? cols.join(', ') : '(unknown)'}
Pipeline: ${JSON.stringify(r.pipeline || [])}
${completenessNote}
Sample rows (${sampleRows.length} of ${totalRows}): ${samplePreview}

MODAL GUIDE — when the user asks "how does this work?" or "what do these tabs do?", explain:
- Overview tab: name, description, data source, chart type settings
- Build tab: drag-and-drop pipeline builder (Filter, Group, Sort, Limit, Combine steps)
- Results tab: live chart / table of the run output; supports sorting columns, applying filters in the header, and zooming charts
- History tab: list of past report versions with restore option
- Side rail: "Ask AI to explain" to open this chat, "Narrate results" to auto-write a business summary, "Run" to execute the report

DATA ANALYSIS — when the user asks for sums, averages, highest/lowest, counts, or any aggregation:
- Check the sample status above first
- If COMPLETE: compute directly from the sample rows and answer with **bold** key numbers
- If PARTIAL: use the compute_aggregation tool (prepend the pipeline above before your stages)
- NEVER say "based on sample rows" when the sample is COMPLETE — just give the answer directly

Do NOT paste MongoDB pipeline JSON or tell the user to run a match stage themselves. You MAY write and RUN a SQL query with run_sql when the user wants a query or an exact figure (the SQL + result are shown to them). Otherwise give direct, computed answers in plain finance-friendly English.`;
}

function buildActiveDatasetBlock(dashboardContext) {
  const d = dashboardContext && dashboardContext.activeDataset;
  if (!d) return '';
  const cols = (d.columns || []).map((c) => (typeof c === 'string' ? c : c.name)).filter(Boolean);
  const dSampleRows = Array.isArray(d.sampleRows) ? d.sampleRows.slice(0, 25) : [];
  const dSamplePreview = dSampleRows.length
    ? JSON.stringify(dSampleRows)
    : '(no preview yet — the dataset has not been run)';
  const dTotalRows = d.rowCount ?? dSampleRows.length;
  const dIsComplete = dSampleRows.length >= dTotalRows && dSampleRows.length > 0;
  const dCompletenessNote = dSampleRows.length === 0
    ? 'Sample status: NO DATA YET'
    : dIsComplete
      ? `Sample status: COMPLETE — all ${dTotalRows} row(s) are in the sample above. Compute aggregations directly from these rows; do NOT use the compute_aggregation tool.`
      : `Sample status: PARTIAL — ${dSampleRows.length} of ${dTotalRows} rows shown. Use the compute_aggregation tool for exact aggregations, using the collection and compiled pipeline above as a prefix before your stages.`;
  const stepsSummary = Array.isArray(d.steps) && d.steps.length
    ? d.steps.map((s, i) => `  ${i + 1}. ${s.kind}${s.disabled ? ' (disabled)' : ''}: ${JSON.stringify({ ...s, kind: undefined, disabled: undefined })}`).join('\n')
    : '  (no steps yet)';
  return `\n\nACTIVE DATASET (the user is currently building/viewing this; ground ALL answers here):
Name: ${d.name || '(unnamed)'}${d.description ? `\nDescription: ${d.description}` : ''}
Source table: ${d.sourceCollection || '(none)'}
Verified: ${d.verified ? 'yes' : 'no'}
Total row count: ${dTotalRows}
Output columns: ${cols.length ? cols.join(', ') : '(unknown)'}
Build steps:
${stepsSummary}
Compiled pipeline: ${JSON.stringify(d.pipeline || [])}
${dCompletenessNote}
Sample rows (${dSampleRows.length} of ${dTotalRows}): ${dSamplePreview}

MODAL GUIDE — when the user asks how this modal works or what the tabs do:
- Side rail: set Name, Description, Source table, Trust/Certification, Sampling; "Ask AI to explain" opens this chat; "Run preview" runs the pipeline; "Save dataset" persists
- Build tab: visual pipeline builder — add Filter, Group By, Combine (join), Sort, Limit, or Rename steps; each appears as a card in sequence
- Preview tab: table showing actual output rows after the last run; click column headers to sort
- Lineage tab: shows which reports and KPIs depend on this dataset
- History tab: past saved versions with restore option
- Filter step: removes rows matching a condition (like a WHERE clause)
- Group By step: aggregates rows (like GROUP BY + SUM/AVG/COUNT)
- Combine step: joins another collection or dataset (like a JOIN)
- Sort step: orders rows by one or more fields
- Limit step: takes the top N rows

DATA ANALYSIS — for sums, averages, highest/lowest, counts, or any aggregation:
- Check the sample status above first
- If COMPLETE: compute directly from the sample rows and answer with **bold** key numbers
- If PARTIAL: use the compute_aggregation tool
- NEVER say "based on sample rows" when the sample is COMPLETE — just give the answer directly

Do NOT paste MongoDB pipeline JSON or tell the user to add a match/group stage themselves. You MAY write and RUN a SQL query with run_sql when the user wants a query or an exact figure (the SQL + result are shown to them). Otherwise give direct answers and plain-English UI guidance.`;
}

function buildActiveReconBlock(dashboardContext) {
  const r = dashboardContext && dashboardContext.activeRecon;
  if (!r) return '';
  const sideLabel = (s) => (s ? `${s.kind || '?'} \u2192 ${s.displayName || s.refId || '?'}` : '(not set)');
  const colsA = Array.isArray(r.columnsA) ? r.columnsA.map((c) => (typeof c === 'string' ? c : c.name)).filter(Boolean) : [];
  const colsB = Array.isArray(r.columnsB) ? r.columnsB.map((c) => (typeof c === 'string' ? c : c.name)).filter(Boolean) : [];
  const m = r.mapping || {};
  const keys = (m.keys || []).map((k) => `${k.a || '?'} = ${k.b || '?'}`).join(', ') || '(none)';
  const measures = (m.measures || []).map((x) => `${x.a || '?'} \u2194 ${x.b || '?'}${x.tolerance ? ` (\u00b1${x.tolerance})` : ''}`).join(', ') || '(none)';
  const last = r.lastRunSummary && r.lastRunSummary.rowCounts
    ? `matched=${r.lastRunSummary.rowCounts.matched ?? 0}, mismatched=${r.lastRunSummary.rowCounts.mismatched ?? 0}, A-only=${r.lastRunSummary.rowCounts.onlyA ?? 0}, B-only=${r.lastRunSummary.rowCounts.onlyB ?? 0}`
    : '(no runs yet)';
  // Actual break rows from the results grid (when a run exists) so the model can
  // analyse the variances, not just the headline counts.
  const breakRows = r.lastRunBreaks && Array.isArray(r.lastRunBreaks.rows) ? r.lastRunBreaks.rows.slice(0, 30) : [];
  const breaksBlock = breakRows.length
    ? `\nMismatched/break rows from the results grid (${breakRows.length} of ${r.lastRunBreaks.total ?? breakRows.length}): ${JSON.stringify(breakRows.map((b) => ({ key: b.key, a: b.a, b: b.b, deltas: b.deltas, status: b.status, category: b.category, note: b.note })))}`
    : '';
  return `\n\nACTIVE RECONCILIATION (the user is currently editing/viewing this; ground ALL answers here):
Name: ${r.name || '(unnamed)'}${r.description ? `\nDescription: ${r.description}` : ''}
Side A: ${sideLabel(r.sourceA)}${colsA.length ? `\nA columns: ${colsA.join(', ')}` : ''}
Side B: ${sideLabel(r.sourceB)}${colsB.length ? `\nB columns: ${colsB.join(', ')}` : ''}
Keys: ${keys}
Measures: ${measures}
Options: ${JSON.stringify(r.options || {})}
Schedule: ${r.schedule && r.schedule.enabled ? `cron=${r.schedule.cron}, recipients=${(r.schedule.recipients || []).join(', ') || '(none)'}` : 'off'}
Last run summary: ${last}${breaksBlock}
Total runs: ${r.runCount ?? 0}

MODAL GUIDE — when the user asks how this modal works or what the tabs do:
- Side rail: Name and description editor, Side A / Side B source selectors, status chips, "Ask AI to explain" button, "Run now" button, "Save" button
- Mapping tab: define Keys (fields that identify the same row across sources), Measures (numeric fields to compare for variance), and Attributes (extra fields to include in the output); "AI suggest mapping" auto-fills a mapping based on column names
- Results tab: shows the latest run output — matched rows, mismatched rows (with variance highlighted), A-only rows, and B-only rows; rows are colour-coded (green = match, red = mismatch/missing)
- History tab: past run records with timestamps, row counts, and status; click a run to view its full results
- Schedule tab: set up automatic recurring runs by cron expression and email recipients
- Keys explained: fields whose values must be equal to consider two rows "the same record" (like a JOIN key)
- Measures explained: numeric fields compared for equality (with optional tolerance); mismatches indicate a variance
- Matched: rows found in both sources with all measures within tolerance
- Mismatched: rows found in both sources but at least one measure differs beyond tolerance
- A-only / B-only: rows present in one source but missing in the other

When the user asks "what is being reconciled?", "why are there variances?", "what does mismatch mean?", "how do I add a key?", "how do I set a tolerance?", or anything about interpreting results, answer DIRECTLY from the configuration, last-run summary, and the break rows above using plain finance-friendly English. You MAY also write and RUN a SQL query with run_sql to dig into either side's source data. Do not paste raw MongoDB pipeline JSON.`;
}

function buildActiveKpiBlock(dashboardContext) {
  const k = dashboardContext && dashboardContext.activeKpi;
  if (!k) return '';
  const fmtLabel = (f) => {
    if (!f) return 'number';
    let s = f.kind || 'number';
    if (f.currencyCode) s += ` (${f.currencyCode})`;
    if (f.compact) s += ', compact';
    return s;
  };
  const targetsLine = k.targets
    ? `Target: ${k.targets.value ?? 'none'}, direction: ${k.targets.direction || 'higherBetter'}`
    : 'No target set';
  const defLine = k.definition
    ? JSON.stringify(k.definition)
    : (k.pipeline?.length ? `Custom pipeline (${k.pipeline.length} stages)` : '(none)');
  return `\n\nACTIVE KPI (the user is currently editing this metric; ground ALL answers here):
Name: ${k.name || '(unnamed)'}${k.description ? `\nDescription: ${k.description}` : ''}
Source collection: ${k.collection || '(none)'}
Verified: ${k.verified ? 'yes' : 'no'}
Format: ${fmtLabel(k.format)}
${targetsLine}
Definition: ${defLine}

MODAL GUIDE — when the user asks how this modal works:
- Source tab: pick the data source (Collection, Dataset, or Report) and the field to aggregate
- Definition tab: set the aggregation (Sum, Average, Count, Min, Max), optional denominator for ratios, and date/time filter
- Format tab: choose number, currency, or percent; set decimals, compact notation, prefix/suffix
- Targets tab: set a goal value and direction (higher is better / lower is better); add colour bands for red/amber/green RAG status
- Preview tile: updates live every time the config changes — shows the current computed value, trend, and goal bar

When the user asks about the KPI value, trend, or target, answer from the definition and current values above. Do NOT show pipeline code.`;
}

/**
 * Execute a compute_aggregation tool call on behalf of the AI.
 * Validates the collection, caps output at 500 rows, and returns the result.
 */
async function executeComputeAggregation(collection, pipeline, user) {
  try {
    const available = await mongoService.getCollections();
    if (!available.includes(collection)) {
      return { error: `Collection '${collection}' not found or not accessible.` };
    }
    if (!Array.isArray(pipeline)) {
      return { error: 'pipeline must be an array of aggregation stage objects.' };
    }
    // Cap at 500 rows unless the pipeline already has a $limit at the end.
    const cappedPipeline = [...pipeline];
    const lastStage = cappedPipeline[cappedPipeline.length - 1];
    if (!lastStage || Object.keys(lastStage)[0] !== '$limit') {
      cappedPipeline.push({ $limit: 500 });
    }
    const result = await mongoService.executePipeline(collection, cappedPipeline, user);
    const truncated = result.data.length >= 500;
    return {
      rows: result.data.slice(0, 500),
      rowCount: result.data.length,
      columns: result.columns,
      executionTimeMs: result.executionTime,
      truncated,
    };
  } catch (err) {
    return { error: err.message || String(err) };
  }
}

/**
 * run_sql tool — execute a read-only SELECT via the Prism/DuckDB engine and
 * return BOTH a compact summary for the model and a rich `clientArtifact` the
 * chat renders inline as a result table (with the SQL shown).
 */
const ARTIFACT_ROWS = 50;
async function executeRunSql(sql, user) {
  if (!sql || typeof sql !== 'string' || !sql.trim()) return { error: 'sql is required' };
  try {
    const res = await duckdbService.runQuery({ sql, user, page: 0, pageSize: ARTIFACT_ROWS });
    const columns = res.columns || [];
    const rows = (res.rows || []).slice(0, ARTIFACT_ROWS);
    const rowCount = res.rowCount ?? rows.length;
    return {
      forModel: { columns, rowCount, sampleRows: rows.slice(0, 8) },
      clientArtifact: {
        type: 'query_result', sql: sql.trim(), columns, rows, rowCount,
        truncated: rowCount > rows.length,
      },
    };
  } catch (err) {
    return { error: err.message || String(err) };
  }
}

/**
 * propose_kpi tool — normalise a KPI draft and hand it to the UI as a confirm
 * card. Nothing is persisted here; the user creates it from the chat.
 *
 * The requested field is validated against the collection's real schema so the
 * resulting KPI actually evaluates to a NUMBER on the KPIs screen: if the field
 * is missing or non-numeric we substitute a numeric field, falling back to a
 * row count when the collection has no numeric columns.
 */
const FILTER_OPS = ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$regex', '$exists'];

async function proposeKpi(input = {}, user) {
  const AGGS = ['$sum', '$avg', '$count', '$min', '$max'];
  let agg = AGGS.includes(input.agg) ? input.agg : '$sum';
  const collection = String(input.collection || '');
  let field = agg === '$count' ? '' : String(input.field || '');

  // Load the collection schema once — drives field validation, filter
  // validation, and time-intelligence (period-field) detection.
  let schema = [];
  if (collection) {
    try { schema = (await mongoService.inferSchema(collection, user)) || []; } catch { schema = []; }
  }
  const byName = new Map(schema.map((f) => [f.name, f]));
  const numericNames = schema.filter((f) => f.type === 'number' && f.semanticType !== 'period').map((f) => f.name);

  // Ensure the aggregated field is real + numeric so the KPI evaluates.
  if (agg !== '$count') {
    if (!numericNames.includes(field)) {
      if (numericNames.length) field = numericNames[0];
      else { agg = '$count'; field = ''; }
    }
  }

  // Validate the model's proposed filters against the real schema; drop any
  // that reference an unknown field or operator, and coerce numeric values.
  const filters = [];
  for (const f of (Array.isArray(input.filters) ? input.filters : [])) {
    if (!f || !f.field || !byName.has(f.field)) continue;
    const operator = FILTER_OPS.includes(f.operator) ? f.operator : '$eq';
    let value = f.value;
    const meta = byName.get(f.field);
    if (operator !== '$in' && operator !== '$nin' && operator !== '$regex'
        && meta && meta.type === 'number' && typeof value === 'string'
        && value.trim() !== '' && !Number.isNaN(Number(value))) {
      value = Number(value);
    }
    filters.push({ field: f.field, operator, value });
  }

  // Time intelligence — ALWAYS when the collection has a period or date field
  // (latest value = current period, previous = comparison).
  const periodCandidate = schema.find((f) => f.semanticType === 'period')
    || schema.find((f) => f.type === 'date');
  const timeIntel = periodCandidate ? { periodField: periodCandidate.name, comparison: 'lastPeriod' } : {};

  const draft = {
    name: String(input.name || 'New KPI').slice(0, 120),
    description: String(input.description || '').slice(0, 500),
    source: { kind: 'collection' },
    collection,
    definition: {
      numerator: { agg, field, filters: [] },
      denominator: null,
      filters,
      ...timeIntel,
    },
    format: { kind: 'number', decimals: 0 },
  };
  return {
    forModel: { ok: true, note: 'A KPI draft (with filters + time intelligence) was shown to the user for confirmation.' },
    clientArtifact: { type: 'kpi_draft', draft },
  };
}

async function* streamChatResponse(messages, schemaContext, user, dashboardContext) {
  const creds = await resolveCreds(user);
  const grounded = await buildGroundedContext(user);
  const baseSystem = buildSystemPrompt(schemaContext, grounded, user.tenantId, user.role, creds.conservative);
  const system =
    baseSystem +
    buildActiveReportBlock(dashboardContext) +
    buildActiveDatasetBlock(dashboardContext) +
    buildActiveReconBlock(dashboardContext) +
    buildActiveKpiBlock(dashboardContext);
  const onToolCall = async (name, input) => {
    if (name === 'compute_aggregation') {
      return executeComputeAggregation(input.collection, input.pipeline, user);
    }
    if (name === 'run_sql') {
      return executeRunSql(input.sql, user);
    }
    if (name === 'propose_kpi') {
      return proposeKpi(input, user);
    }
    return { error: `Unknown tool: ${name}` };
  };
  yield* providers.streamChatWithTools({ ...creds, system, messages, maxTokens: 2048, onToolCall });
}

async function generatePipeline(naturalLanguage, schemaContext, user) {
  const creds = await resolveCreds(user);
  const grounded = await buildGroundedContext(user);
  const system = buildSystemPrompt(schemaContext, grounded, user.tenantId, user.role, creds.conservative);
  return providers.complete({
    ...creds,
    system,
    messages: [{ role: 'user', content: `Generate a MongoDB aggregation pipeline for: ${naturalLanguage}. Wrap the JSON in \`\`\`json fences.` }],
    maxTokens: 1024,
  });
}

async function* streamInsight(chartData, chartConfig, schemaContext, user) {
  const creds = await resolveCreds(user);
  const grounded = await buildGroundedContext(user);
  const system = buildSystemPrompt(schemaContext, grounded, user.tenantId, user.role, creds.conservative);
  const dataPreview = JSON.stringify(chartData.slice(0, 50));
  const messages = [{
    role: 'user',
    content: `Provide a 2-3 sentence insight for this chart data:\nChart type: ${chartConfig?.chartType || 'unknown'}\nData (first 50 rows): ${dataPreview}\nEnd with ONE follow-up question the user might ask next.`,
  }];
  yield* providers.streamChat({ ...creds, system, messages, maxTokens: 512 });
}

async function getSuggestions(collectionName, fields, user) {
  const creds = await resolveCreds(user);
  const system = buildSystemPrompt([], { datasets: [], kpis: [] }, user.tenantId, user.role, creds.conservative);
  const fieldList = fields.map((f) => `${f.name} (${f.type})`).join(', ');
  const text = await providers.complete({
    ...creds,
    system,
    messages: [{
      role: 'user',
      content: `Provide exactly 3 short, useful query suggestions for the MongoDB collection "${collectionName}" with fields: ${fieldList}. Return as a JSON array of strings only.`,
    }],
    maxTokens: 256,
  });
  try {
    const match = text.match(/\[[\s\S]*?\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch {
    return [];
  }
}

/**
 * Structured "plan" — given a natural-language request, return JSON describing
 * the intended report so the UI can render named slots (plan, sources,
 * builderState, chartType) instead of parsing markdown code fences.
 *
 * Returns { plan, sources, collection, builderState, chartType, format, pipeline }.
 * Falls back to a partial object if the model misformats the JSON.
 */
async function generatePlan({ prompt, intent, currentContext }, schemaContext, user) {
  const creds = await resolveCreds(user);
  const grounded = await buildGroundedContext(user);
  const system = buildSystemPrompt(schemaContext, grounded, user.tenantId, user.role, creds.conservative);

  const planSchema = `{
  "plan": "<one sentence describing what you'll do>",
  "sources": [{"kind": "dataset"|"savedFilter"|"kpi"|"collection", "name": "<exact name>"}],
  "collection": "<source collection or dataset.collection>",
  "chartType": "table"|"line"|"bar"|"area"|"pie"|"scalar"|"pivot",
  "builderState": {
    "filters": [{"field": "<path>", "operator": "$eq|$gt|$gte|$lt|$lte|$ne|$regex|$in", "value": "<...>"}],
    "groupBys": ["<field>"],
    "metrics": [{"agg": "$sum|$avg|$count|$min|$max", "field": "<path>", "alias": "<name>"}],
    "sortField": "<alias|field>",
    "sortDir": -1|1,
    "limit": 0
  },
  "format": {"kind": "number"|"currency"|"percent", "decimals": 0, "compact": false},
  "pipeline": [ <optional raw mongo aggregation as fallback> ]
}`;

  const userPrompt = `Intent: ${intent || 'free'}
${currentContext ? `Current context: ${JSON.stringify(currentContext)}\n` : ''}User request: ${prompt}

Return ONLY a single JSON object that conforms exactly to this schema (no prose, no fences):
${planSchema}`;

  const text = await providers.complete({
    ...creds, system,
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 1500,
  });

  // Extract first {...} block tolerantly
  let json = null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { json = JSON.parse(candidate.slice(start, end + 1)); } catch { json = null; }
  }
  if (!json) {
    return { plan: text.slice(0, 240), sources: [], builderState: null, chartType: 'table', raw: text };
  }
  return json;
}

/**
 * Structured "explain" — grounded explanation of a chart/KPI value, returning
 * { summary, drivers: [{ label, delta }], followUps: [string] }.
 */
async function explainResult({ data, chartConfig, kpiContext, prompt }, schemaContext, user) {
  const creds = await resolveCreds(user);
  const grounded = await buildGroundedContext(user);
  const system = buildSystemPrompt(schemaContext, grounded, user.tenantId, user.role, creds.conservative);
  const preview = JSON.stringify((data || []).slice(0, 40));
  const userPrompt = `Explain the following result for a finance audience.
${kpiContext ? `KPI: ${JSON.stringify(kpiContext)}\n` : ''}Chart config: ${JSON.stringify(chartConfig || {})}
Data (first 40 rows): ${preview}
${prompt ? `User question: ${prompt}` : ''}

Return ONLY JSON:
{ "summary": "<2-3 sentences, cite specific numbers>",
  "drivers": [{"label": "<dimension value>", "delta": "<+12% / -$3.4M etc>"}],
  "followUps": ["<short suggested next question>", "..."] }`;
  const text = await providers.complete({
    ...creds, system,
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 700,
  });
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* fall through */ }
  }
  return { summary: text.slice(0, 400), drivers: [], followUps: [] };
}

/**
 * AI-powered mapping suggestion — analyses column names on both sides and
 * returns structured { keys, measures, attributes } with reasoning.
 */
async function suggestReconMapping({ columnsA, columnsB, sampleA, sampleB, typesA, typesB }, user) {
  const creds = await resolveCreds(user);

  // Format a compact sample block — shows the AI actual values so it can reason about semantics
  const formatSample = (cols, sample, types) => {
    if (!sample || sample.length === 0) return '(no sample data available)';
    const typeHints = cols.map((c) => `${c}[${(types && types[c]) || '?'}]`).join(', ');
    const rows = sample.slice(0, 10).map((r) =>
      cols.map((c) => JSON.stringify(r[c] ?? null)).join(' | ')
    ).join('\n');
    return `Columns: ${typeHints}\n${cols.join(' | ')}\n${rows}`;
  };

  const userPrompt = `You are configuring a financial reconciliation between two datasets. Suggest a column mapping.

=== Side A ===
${formatSample(columnsA, sampleA, typesA)}

=== Side B ===
${formatSample(columnsB, sampleB, typesB)}

Rules:
- Keys: columns forming a unique row identifier on BOTH sides (e.g. transaction ID, reference, invoice number, date+counterparty). Only pair columns whose values actually overlap (same format, same kind of value).
- Measures: numeric amount/balance/quantity columns to compare numerically. For currency amounts set abs=0.01, pct=0.001. For integer counts set abs=0, pct=0.
- Attributes: non-numeric descriptive columns (currency code, status, entity name) compared for exact equality. Keep this list short — only include if clearly matching.
- ONLY suggest pairs with a clear semantic AND value-format match. Never invent columns not listed above.
- If a column has no clear match on the other side, omit it.

Return ONLY valid JSON (no prose, no fences):
{
  "keys": [{"a": "<colFromA>", "b": "<colFromB>", "transform": ""}],
  "measures": [{"a": "<colFromA>", "b": "<colFromB>", "transform": "", "tolerance": {"abs": 0.01, "pct": 0.001}}],
  "attributes": [{"a": "<colFromA>", "b": "<colFromB>", "transform": ""}],
  "reasoning": "<one concise sentence explaining the key mapping choices>"
}`;

  const text = await providers.complete({
    ...creds,
    system: 'You are a financial data integration specialist. You analyse column headers and sample data to suggest reconciliation mappings. Be precise and conservative — only match columns you are confident about.',
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 1200,
  });

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      // Validate: strip any pairs where the AI hallucinated column names
      const setA = new Set(columnsA);
      const setB = new Set(columnsB);
      const valid = (pair) => setA.has(pair.a) && setB.has(pair.b);
      return {
        keys: (parsed.keys || []).filter(valid),
        measures: (parsed.measures || []).filter(valid),
        attributes: (parsed.attributes || []).filter(valid),
        reasoning: parsed.reasoning || '',
      };
    } catch { /* fall through */ }
  }
  return { keys: [], measures: [], attributes: [], reasoning: 'Could not parse AI response — please map manually.' };
}

/**
 * AI-powered KPI target suggestion — proposes a numeric target based on
 * direction and KPI semantics.
 */
async function suggestKpiTarget({ name, description, direction }, user) {
  const creds = await resolveCreds(user);

  const text = await providers.complete({
    ...creds,
    system: 'You are a finance analytics assistant. Suggest realistic but ambitious KPI targets. Be concise.',
    messages: [{
      role: 'user',
      content: `Suggest a realistic but ambitious target value for this KPI.

KPI name: ${name}
${description ? `Description: ${description}` : ''}
Direction: ${direction === 'lowerBetter' ? 'Lower is better (e.g. cost, defect count, days overdue)' : 'Higher is better (e.g. revenue, profit, conversion rate)'}

Return ONLY valid JSON (no prose, no fences):
{
  "suggested": <number>,
  "reasoning": "<1-2 sentences explaining the suggestion>"
}`,
    }],
    maxTokens: 256,
  });

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(candidate.slice(start, end + 1)); } catch { /* fall through */ }
  }
  return { suggested: null, reasoning: text.slice(0, 300) };
}

/**
 * Build the system prompt for the SQL Lab assistant. Encodes EXACTLY what the
 * SQL Lab engine supports so the model can only produce valid, runnable queries:
 * read-only SELECT, DuckDB dialect, the live table/column catalog, and the
 * engine's quirks (case-insensitive identifiers, date handling, auto-paging).
 */
function buildSqlSystemPrompt(schemaContext) {
  const schemaBlock = schemaContext
    .map((c) => `Table: ${c.name}\n  Columns: ${c.fields.map((f) => `${f.name} (${f.type})`).join(', ') || '(unknown)'}`)
    .join('\n\n');

  return [
    'You are a SQL assistant embedded in "Prism", a READ-ONLY SQL workspace.',
    'Queries run in DuckDB over data sourced from MongoDB collections (exposed as tables).',
    '',
    'HARD RULES:',
    '- Produce EXACTLY ONE read-only SELECT statement. Never write INSERT, UPDATE, DELETE, MERGE, CREATE, DROP, ALTER, or any DDL/DML — they are rejected by the engine.',
    '- Use ONLY the tables and columns listed in the catalog below. Never invent table or column names.',
    '- If the request cannot be answered from the catalog, return the closest valid SELECT and nothing else.',
    '',
    'DIALECT & ENGINE NOTES:',
    '- DuckDB SQL (PostgreSQL-like). You MAY use JOINs, CTEs (WITH), CASE, UNION/UNION ALL, subqueries, and window functions (OVER / PARTITION BY).',
    '- Identifiers are case-insensitive, but prefer the exact casing shown in the catalog.',
    '- Date/timestamp columns are real TIMESTAMPs — compare them with ISO strings, e.g. WHERE postingDate >= \'2025-01-01\' AND postingDate < \'2025-02-01\'.',
    '- Results are paginated automatically; only add LIMIT when the user explicitly wants top-N / a fixed number of rows.',
    '- String comparisons are case-sensitive on values (e.g. status = \'OPEN\').',
    '',
    'WORKING CONTEXT:',
    '- The user is editing a worksheet that may already contain a query and a result grid. Both are provided below when present.',
    '- When a current query IS provided, assume the request is ABOUT that query — refine, fix, extend, filter, or build on it — unless the user clearly asks for something unrelated. Preserve their intent, table/column choices, and structure where it makes sense.',
    '- The result-grid columns tell you what the current query actually returns; use them to disambiguate the request.',
    '- When NO current query is provided, write a fresh query from the catalog that satisfies the request.',
    '',
    'OUTPUT FORMAT:',
    '- Return ONLY the SQL, wrapped in a ```sql code fence. No commentary, no explanation.',
    '',
    'AVAILABLE TABLES (catalog):',
    schemaBlock || '(no tables available)',
  ].join('\n');
}

/**
 * Assemble the user message for SQL generation, weaving in the worksheet's
 * current query and result-grid context so the model is aware of what the
 * user is actually looking at.
 */
function buildSqlUserMessage(naturalLanguage, ctx = {}) {
  const parts = [];
  const sql = String(ctx.currentSql || '').trim();
  const grid = ctx.gridContext || null;

  if (sql) {
    parts.push('The worksheet currently contains this query:');
    parts.push('```sql\n' + sql.slice(0, 4000) + '\n```');
  }
  if (grid && Array.isArray(grid.columns) && grid.columns.length) {
    const rc = (grid.rowCount != null) ? grid.rowCount.toLocaleString() : 'some';
    parts.push(`Its result grid currently returns ${rc} rows with columns: ${grid.columns.join(', ')}.`);
    if (Array.isArray(grid.sampleRows) && grid.sampleRows.length) {
      let sample = '';
      try { sample = JSON.stringify(grid.sampleRows.slice(0, 5)); } catch { /* ignore */ }
      if (sample) parts.push(`Sample rows from the grid: ${sample.slice(0, 2000)}`);
    }
  }
  parts.push(
    sql
      ? 'The user is most likely asking about or refining the query above — build on it unless they clearly want something unrelated.'
      : 'There is no existing query in the worksheet — write a fresh read-only SELECT from the catalog that satisfies the request.'
  );
  parts.push(`Request: ${String(naturalLanguage || '').slice(0, 4000)}`);
  return parts.join('\n\n');
}

/**
 * Natural language -> a single read-only DuckDB SELECT for SQL Lab.
 * `ctx` may carry { currentSql, gridContext } from the active worksheet so the
 * model can refine the user's own query and reason over what's in the grid.
 * Returns the model's raw text (SQL inside a ```sql fence); the caller extracts.
 */
async function generateSql(naturalLanguage, schemaContext, user, ctx = {}) {
  const creds = await resolveCreds(user);
  const system = buildSqlSystemPrompt(schemaContext);
  return providers.complete({
    ...creds,
    system,
    messages: [{ role: 'user', content: buildSqlUserMessage(naturalLanguage, ctx) }],
    maxTokens: 1024,
  });
}

module.exports = {
  streamChatResponse,
  generatePipeline,
  generateSql,
  streamInsight,
  getSuggestions,
  generatePlan,
  explainResult,
  suggestReconMapping,
  suggestKpiTarget,
  resolveCreds,
};
