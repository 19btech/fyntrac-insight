/**
 * Recon engine.
 *
 * High-level: materialize Side A and Side B as plain row arrays, normalize
 * mapped columns per the rules, optionally aggregate by key, full-outer-join
 * on the key, and bucket every row into Matched / Mismatched / OnlyA / OnlyB.
 *
 * Sides:
 *   - kind='dataset' → SavedModel.pipeline executed on its sourceCollection
 *   - kind='csv'     → ReconCsvFile.raw parsed into rows
 */

const SavedModel = require('../models/SavedModel.model');
const ReconCsvFile = require('../models/ReconCsvFile.model');
const mongoService = require('./mongo.service');
const duckdbService = require('./duckdb.service');

/**
 * Safety limit: throw before loading sides larger than this into memory.
 * Users should pre-aggregate datasets above this threshold.
 */
const MAX_DATASET_ROWS = 500_000;

/**
 * Maximum rows stored inline in a ReconRun document.
 * Keeps BSON size well below MongoDB's 16 MB document limit.
 */
const MAX_STORED_ROWS = 50_000;

// ─── CSV helpers ───────────────────────────────────────────────────────────

/**
 * Tiny RFC-4180-ish CSV parser. Handles:
 *   - quoted fields with embedded commas / newlines
 *   - escaped quotes ("")
 *   - \r\n and \n line endings
 * Returns { columns, rows } where rows are objects keyed by column name.
 */
function parseCsv(text) {
  const out = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, ''); // strip BOM
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(cell); out.push(row); row = []; cell = ''; }
      else cell += c;
    }
  }
  // flush last cell/row if file doesn't end with newline
  if (cell.length > 0 || row.length > 0) { row.push(cell); out.push(row); }

  if (out.length === 0) return { columns: [], rows: [] };
  const columns = out[0].map((c) => String(c).trim()).filter((_, i, arr) => arr[i] !== '');
  const rows = [];
  for (let r = 1; r < out.length; r++) {
    const arr = out[r];
    if (arr.length === 1 && arr[0] === '') continue;
    const obj = {};
    for (let c = 0; c < columns.length; c++) obj[columns[c]] = arr[c] != null ? arr[c] : '';
    rows.push(obj);
  }
  return { columns, rows };
}

const NUM_RX = /^-?\d+(\.\d+)?$/;
const ISO_DATE_RX = /^\d{4}-\d{2}-\d{2}/;

/** Infer a coarse type per column from sampled values. */
function inferTypes(columns, rows, sampleSize = 200) {
  const out = {};
  const sample = rows.slice(0, sampleSize);
  for (const col of columns) {
    let n = 0, num = 0, date = 0, bool = 0, total = 0;
    for (const r of sample) {
      const v = r[col];
      if (v == null || v === '') continue;
      total++;
      const s = String(v).trim().replace(/[, $]/g, '');
      if (NUM_RX.test(s)) { num++; continue; }
      if (ISO_DATE_RX.test(String(v).trim()) || !isNaN(Date.parse(v))) { date++; continue; }
      if (s === 'true' || s === 'false') { bool++; continue; }
      n++;
    }
    if (total === 0) { out[col] = 'string'; continue; }
    if (num / total > 0.8) out[col] = 'number';
    else if (date / total > 0.8) out[col] = 'date';
    else if (bool / total > 0.8) out[col] = 'boolean';
    else out[col] = 'string';
  }
  return out;
}

// ─── Transforms ────────────────────────────────────────────────────────────

function normalizeNumber(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[, $€£]/g, '').replace(/[()]/g, (m) => (m === '(' ? '-' : ''));
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function bucketDate(v, granularity = 'day') {
  if (v == null || v === '') return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  if (granularity === 'year') return `${y}`;
  if (granularity === 'quarter') return `${y}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
  if (granularity === 'month') return `${y}-${m}`;
  return `${y}-${m}-${dd}`;
}

/**
 * Apply a transform string to a single value. Format:
 *   "trim" | "upper" | "lower" | "stripNonAlnum" | "number" | "abs" |
 *   "date:day|month|quarter|year" | "" (no-op)
 */
function applyTransform(value, transform, opts = {}) {
  if (value == null) return value;
  if (!transform) return value;
  const [name, arg] = transform.split(':');
  switch (name) {
    case 'trim': return String(value).trim();
    case 'upper': return String(value).trim().toUpperCase();
    case 'lower': return String(value).trim().toLowerCase();
    case 'stripNonAlnum': return String(value).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    case 'number': return normalizeNumber(value);
    case 'abs': return Math.abs(normalizeNumber(value));
    case 'date': return bucketDate(value, arg || opts.dateGranularity || 'day');
    default: return value;
  }
}

// ─── Source materialization ────────────────────────────────────────────────

/**
 * Materialize a Dataset's transformed output as { name, columns, rows }.
 *  - SQL (Prism) datasets define their columns in DuckDB, so run the saved
 *    query (the underlying collection alone has neither the columns nor the
 *    structure the user built).
 *  - Steps datasets carry a compiled Mongo pipeline we run over the source.
 * `limit > 0` caps rows for sampled previews; 0 means "all" (bounded by the
 * MAX_DATASET_ROWS guard enforced downstream).
 */
async function materializeDataset(ds, user, limit = 0) {
  if (ds.sourceMode === 'savedQuery' && ds.savedQuerySql) {
    const pageSize = limit > 0 ? limit : MAX_DATASET_ROWS;
    const res = await duckdbService.runQuery({ sql: ds.savedQuerySql, user, page: 0, pageSize });
    return { name: ds.name, columns: res.columns || [], rows: res.rows || [] };
  }
  const pipeline = limit > 0 ? [...(ds.pipeline || []), { $limit: limit }] : (ds.pipeline || []);
  const result = await mongoService.executePipeline(ds.sourceCollection, pipeline, user);
  return { name: ds.name, columns: result.columns || [], rows: result.data || [] };
}

async function materializeSide(side, user, limit = 0) {
  if (!side || !side.kind || !side.refId) throw new Error('Invalid source side');
  if (side.kind === 'dataset') {
    const ds = await user.getModel('SavedModel').findOne({ _id: side.refId, tenantId: user.tenantId });
    if (!ds) throw new Error(`Dataset not found: ${side.refId}`);
    return materializeDataset(ds, user, limit);
  }
  if (side.kind === 'csv') {
    const f = await user.getModel('ReconCsvFile').findOne({ _id: side.refId, tenantId: user.tenantId });
    if (!f) throw new Error(`CSV file not found: ${side.refId}`);
    // Prefer pre-parsed rows stored at upload time; fall back to re-parsing raw text
    if (f.parsedRows && f.parsedRows.length > 0) {
      const columns = f.columns && f.columns.length > 0 ? f.columns : Object.keys(f.parsedRows[0] || {});
      const rows = limit > 0 ? f.parsedRows.slice(0, limit) : f.parsedRows;
      return { name: f.filename || 'CSV', columns, rows };
    }
    const { columns, rows } = parseCsv(f.raw || '');
    return { name: f.filename || 'CSV', columns, rows: limit > 0 ? rows.slice(0, limit) : rows };
  }
  throw new Error(`Unknown source kind: ${side.kind}`);
}

// ─── Mapping suggester ─────────────────────────────────────────────────────

function nameSimilarity(a, b) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const A = norm(a); const B = norm(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.includes(B) || B.includes(A)) return 0.8;
  // tiny token Jaccard on character bigrams
  const grams = (s) => { const g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
  const ga = grams(A); const gb = grams(B);
  let inter = 0; for (const x of ga) if (gb.has(x)) inter++;
  return inter / (ga.size + gb.size - inter || 1);
}

function valueOverlap(rowsA, colA, rowsB, colB, sample = 200) {
  const setA = new Set();
  for (const r of rowsA.slice(0, sample)) {
    const v = r[colA]; if (v != null && v !== '') setA.add(String(v).toLowerCase());
  }
  if (setA.size === 0) return 0;
  let hits = 0; let total = 0;
  for (const r of rowsB.slice(0, sample)) {
    const v = r[colB]; if (v == null || v === '') continue;
    total++;
    if (setA.has(String(v).toLowerCase())) hits++;
  }
  return total === 0 ? 0 : hits / total;
}

function cardinality(rows, col, sample = 500) {
  const s = new Set(); let total = 0;
  for (const r of rows.slice(0, sample)) {
    const v = r[col]; if (v == null || v === '') continue;
    total++; s.add(String(v));
  }
  return total === 0 ? 0 : s.size / total; // 1.0 = unique-ish (key candidate)
}

/**
 * Suggest a mapping between two row-tables. Returns a draft mapping object the
 * UI can present and the user can accept / tweak.
 */
function suggestMapping(sideA, sideB) {
  const typesA = inferTypes(sideA.columns, sideA.rows);
  const typesB = inferTypes(sideB.columns, sideB.rows);

  // For each B column find the best A match
  const pairs = [];
  for (const cb of sideB.columns) {
    let best = null;
    for (const ca of sideA.columns) {
      if (typesA[ca] !== typesB[cb] && !(typesA[ca] === 'number' && typesB[cb] === 'number')) {
        // allow type mismatch but penalize
      }
      const nameScore = nameSimilarity(ca, cb);
      const overlap = (typesA[ca] === 'string' || typesA[ca] === 'number') ? valueOverlap(sideA.rows, ca, sideB.rows, cb) : 0;
      const typeBonus = typesA[ca] === typesB[cb] ? 0.2 : 0;
      const score = nameScore * 0.5 + overlap * 0.4 + typeBonus;
      if (!best || score > best.score) best = { a: ca, b: cb, score, typeA: typesA[ca], typeB: typesB[cb] };
    }
    if (best && best.score > 0.15) pairs.push(best);
  }

  // Bucket into keys / measures / attributes by type + cardinality
  const keys = [], measures = [], attributes = [];
  for (const p of pairs) {
    const cardA = cardinality(sideA.rows, p.a);
    if (p.typeA === 'number' && p.typeB === 'number' && cardA < 0.6) {
      measures.push({ a: p.a, b: p.b, transform: 'number', tolerance: { abs: 0.01, pct: 0.001 } });
    } else if (cardA > 0.6 || p.typeA === 'date') {
      keys.push({ a: p.a, b: p.b, transform: p.typeA === 'date' ? 'date:month' : 'trim' });
    } else {
      attributes.push({ a: p.a, b: p.b, transform: 'trim' });
    }
  }

  return { keys, measures, attributes, _typesA: typesA, _typesB: typesB };
}

// ─── Matching engine ───────────────────────────────────────────────────────

/**
 * Collapse a bare date/timestamp value to a YYYY-MM-DD string so keys never
 * carry a time component. Handles Date objects, ISO strings, space-separated
 * timestamps, and JS `Date.toString()` output. Leaves non-date values alone.
 */
function dateOnly(v) {
  if (v == null) return v;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? v : v.toISOString().slice(0, 10);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;                       // already plain date
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ][\d:.]/);              // ISO / space-separated
  if (m) return m[1];
  // JS Date.toString() ("Wed Mar 31 2025 00:00:00 GMT+0000 …") and similar —
  // only convert when it clearly looks like a timestamp (has a time / GMT token).
  if (/\d{4}/.test(s) && /(GMT|\dT\d\d|\d:\d\d)/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return v;
}

function buildKey(row, cols, side, opts) {
  const parts = [];
  for (const c of cols) {
    const field = side === 'a' ? c.a : c.b;
    const transform = c.transform || 'trim';
    let v = applyTransform(row[field], transform, { dateGranularity: opts.dateGranularity });
    // When no explicit date bucket was chosen, still render dates as YYYY-MM-DD
    // (not raw timestamps) in the key.
    if (!String(transform).startsWith('date')) v = dateOnly(v);
    if (!opts.caseSensitive && typeof v === 'string') v = v.toLowerCase();
    parts.push(v == null ? '' : String(v));
  }
  return parts.join('||');
}

function aggregateBy(rows, keyFn, measureCols, side) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    let agg = map.get(k);
    if (!agg) { agg = { __key: k, __count: 0, __sample: r, ...Object.fromEntries(measureCols.map((m) => [m[side === 'a' ? 'a' : 'b'], 0])) }; map.set(k, agg); }
    agg.__count++;
    for (const m of measureCols) {
      const field = side === 'a' ? m.a : m.b;
      agg[field] = (agg[field] || 0) + normalizeNumber(r[field]);
    }
  }
  return map;
}

function withinTolerance(va, vb, tol = { abs: 0.01, pct: 0.001 }) {
  const diff = Math.abs((Number(va) || 0) - (Number(vb) || 0));
  const base = Math.max(Math.abs(Number(va) || 0), Math.abs(Number(vb) || 0));
  const allowed = Math.max(tol.abs || 0, (tol.pct || 0) * base);
  return diff <= allowed;
}

/**
 * Returns true when EVERY measure delta on a (would-be-mismatched) row is
 * within the recon-level materiality threshold. abs=0 AND pct=0 → never
 * immaterial (i.e. feature disabled). attrIssues alone do not make a row
 * material — the caller decides how to weight that.
 */
function isImmaterial(deltasMap, materiality) {
  const abs = Number(materiality?.abs) || 0;
  const pct = Number(materiality?.pct) || 0;
  if (abs === 0 && pct === 0) return false;
  for (const k of Object.keys(deltasMap || {})) {
    const d = deltasMap[k];
    if (!d || d.ok) continue;
    const rawDiff = Math.abs(Number(d.diff) || 0);
    const base = Math.max(Math.abs(Number(d.a) || 0), Math.abs(Number(d.b) || 0));
    const allowed = Math.max(abs, pct * base);
    if (rawDiff > allowed) return false;
  }
  return true;
}

/**
 * Read FX rate for a row. fxRates is a Map (or plain object); base currency
 * is treated as 1. Missing currency or missing rate → 1 (no conversion, safe
 * default that doesn't break existing recons).
 */
function fxRateFor(row, currencyField, fxRates, baseCurrency) {
  if (!currencyField) return 1;
  const ccy = String(row?.[currencyField] ?? '').trim().toUpperCase();
  if (!ccy) return 1;
  if (baseCurrency && ccy === String(baseCurrency).toUpperCase()) return 1;
  if (!fxRates) return 1;
  // Mongoose Map vs plain object
  const rate = typeof fxRates.get === 'function' ? fxRates.get(ccy) : fxRates[ccy];
  const n = Number(rate);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Run the recon. Returns { summary, rows } where rows are bucketed and tagged.
 *
 * @param recon       — Recon document (or plain config object)
 * @param user        — req.user (used for tenant-scoped data access)
 * @param previousRun — optional prior ReconRun document used to compute
 *                      `age` on persistent breaks and `newBreaksVsPrior`.
 *                      Pass `null` to skip aging (safe default).
 * @param opts        — { preview, limitPerSide }
 *                      preview=true  → skip the heavy per-row bookkeeping
 *                                      (full records, annotation roll-forward)
 *                                      and return summary only. Used by the
 *                                      live "would this match?" dry-run.
 *                      limitPerSide  → cap rows materialized per side (preview
 *                                      responsiveness on very large sources).
 */
async function runRecon(recon, user, previousRun = null, runOpts = {}) {
  const preview = !!runOpts.preview;
  const limitPerSide = Number(runOpts.limitPerSide) || 0;
  const start = Date.now();
  const opts = recon.options || {};
  const mapping = recon.mapping || {};
  const keyCols = mapping.keys || [];
  const measureCols = mapping.measures || [];
  const attrCols = mapping.attributes || [];
  const materiality = opts.materiality || { abs: 0, pct: 0 };
  const fx = opts.currency || { enabled: false };
  const fxEnabled = !!fx.enabled;
  const fxRates = fx.fxRates;
  const baseCcy = fx.baseCurrency || 'USD';

  if (keyCols.length === 0) throw new Error('At least one key mapping is required');

  // For sampled previews, cap at the source (push $limit / slice CSV) so we
  // never materialize the full dataset just to estimate a match rate.
  const matLimit = preview && limitPerSide > 0 ? limitPerSide : 0;
  const [sideA, sideB] = await Promise.all([
    materializeSide(recon.sourceA, user, matLimit),
    materializeSide(recon.sourceB, user, matLimit),
  ]);

  let aRows = sideA.rows;
  let bRows = sideB.rows;

  // Belt-and-braces: also cap in memory (covers the non-preview safety limit).
  if (limitPerSide > 0) {
    if (aRows.length > limitPerSide) aRows = aRows.slice(0, limitPerSide);
    if (bRows.length > limitPerSide) bRows = bRows.slice(0, limitPerSide);
  }

  if (aRows.length > MAX_DATASET_ROWS || bRows.length > MAX_DATASET_ROWS) {
    throw new Error(
      `Source exceeds ${MAX_DATASET_ROWS.toLocaleString()} row limit. ` +
      `Side A: ${aRows.length.toLocaleString()}, Side B: ${bRows.length.toLocaleString()}. ` +
      'Use a pre-aggregated dataset to reduce row count before reconciling.'
    );
  }

  const keyA = (r) => buildKey(r, keyCols, 'a', opts);
  const keyB = (r) => buildKey(r, keyCols, 'b', opts);

  let mapA, mapB;
  if (opts.aggregateBeforeMatch !== false) {
    mapA = aggregateBy(aRows, keyA, measureCols, 'a');
    mapB = aggregateBy(bRows, keyB, measureCols, 'b');
  } else {
    mapA = new Map(); mapB = new Map();
    for (const r of aRows) mapA.set(keyA(r), { __key: keyA(r), __count: 1, __sample: r, ...r });
    for (const r of bRows) mapB.set(keyB(r), { __key: keyB(r), __count: 1, __sample: r, ...r });
  }

  // Build a quick lookup of prior-run break keys → prior annotation, so the
  // analyst's work (category, note, owner, status, due date) rolls forward to
  // the next run instead of being lost. Any non-matched prior row qualifies.
  const priorByKey = new Map();
  if (!preview && previousRun && Array.isArray(previousRun.rows)) {
    for (const pr of previousRun.rows) {
      if (pr.status && pr.status !== 'matched') {
        priorByKey.set(pr.key, {
          age: Math.max(1, Number(pr.age) || 1),
          category: pr.category || '',
          note: pr.note || '',
          noteBy: pr.noteBy || '',
          noteAt: pr.noteAt || null,
          assignee: pr.assignee || '',
          breakStatus: pr.breakStatus || '',
          dueDate: pr.dueDate || null,
        });
      }
    }
  }

  // Avoid spread operator on potentially millions of keys
  const allKeys = new Set(mapA.keys());
  for (const k of mapB.keys()) allKeys.add(k);
  const rows = [];
  const tot = { perMeasure: {} };
  for (const m of measureCols) tot.perMeasure[m.a] = { sumA: 0, sumB: 0, diff: 0 };

  let matched = 0, mismatched = 0, onlyA = 0, onlyB = 0, immaterial = 0, persistent = 0;
  let newBreaksVsPrior = 0;

  for (const k of allKeys) {
    const a = mapA.get(k);
    const b = mapB.get(k);
    const out = { key: k, status: 'matched', a: null, b: null, deltas: {}, attrIssues: [] };

    if (!a) {
      out.status = 'only_b';
      out.b = pickValues(b, measureCols, attrCols, 'b');
      onlyB++;
    } else if (!b) {
      out.status = 'only_a';
      out.a = pickValues(a, measureCols, attrCols, 'a');
      onlyA++;
    } else {
      out.a = pickValues(a, measureCols, attrCols, 'a');
      out.b = pickValues(b, measureCols, attrCols, 'b');
      // FX rates are computed once per row (per side) using the row's
      // currency field — same rate applies to every measure on that row.
      const rateA = fxEnabled ? fxRateFor(a, fx.currencyFieldA, fxRates, baseCcy) : 1;
      const rateB = fxEnabled ? fxRateFor(b, fx.currencyFieldB, fxRates, baseCcy) : 1;
      let allOk = true;
      for (const m of measureCols) {
        const va = normalizeNumber(a[m.a]) * rateA;
        const vb = normalizeNumber(b[m.b]) * rateB;
        const ok = withinTolerance(va, vb, m.tolerance);
        out.deltas[m.a] = { a: va, b: vb, diff: vb - va, ok };
        tot.perMeasure[m.a].sumA += va;
        tot.perMeasure[m.a].sumB += vb;
        tot.perMeasure[m.a].diff += (vb - va);
        if (!ok) allOk = false;
      }
      // attribute equality (case-insensitive when caseSensitive=false)
      for (const ac of attrCols) {
        const va = a[ac.a]; const vb = b[ac.b];
        const eq = opts.caseSensitive
          ? String(va ?? '') === String(vb ?? '')
          : String(va ?? '').toLowerCase() === String(vb ?? '').toLowerCase();
        if (!eq) { out.attrIssues.push({ field: ac.a, a: va, b: vb }); allOk = false; }
      }
      if (allOk) {
        out.status = 'matched';
        matched++;
      } else if (isImmaterial(out.deltas, materiality) && out.attrIssues.length === 0) {
        out.status = 'immaterial';
        immaterial++;
      } else {
        out.status = 'mismatched';
        mismatched++;
      }
    }

    // Aging + roll-forward — only meaningful for breaks (mismatched /
    // immaterial / onlyA / onlyB). Carry the analyst's prior annotations
    // forward so investigation work isn't lost between runs.
    if (out.status !== 'matched' && !preview) {
      const prior = priorByKey.get(k);
      if (prior) {
        out.age = prior.age + 1;
        // Roll forward analyst metadata.
        if (prior.category) out.category = prior.category;
        if (prior.note) { out.note = prior.note; out.noteBy = prior.noteBy; out.noteAt = prior.noteAt; }
        if (prior.assignee) out.assignee = prior.assignee;
        if (prior.breakStatus) out.breakStatus = prior.breakStatus;
        if (prior.dueDate) out.dueDate = prior.dueDate;
        if (out.status === 'mismatched') persistent++;
      } else if (previousRun) {
        out.age = 1;
        if (out.status === 'mismatched') newBreaksVsPrior++;
      }
      // Capture the full representative record from each side so the results
      // UI can show a field-by-field A-vs-B inspector for this break.
      if (a) out.aFull = fullRecord(a);
      if (b) out.bFull = fullRecord(b);
    }

    rows.push(out);
  }

  const total = matched + mismatched + onlyA + onlyB + immaterial;
  const summary = {
    rowCounts: { a: aRows.length, b: bRows.length, matched, mismatched, onlyA, onlyB, immaterial, persistent },
    totals: tot.perMeasure,
    matchRate: total === 0 ? 0 : matched / total,
    coverageA: mapA.size === 0 ? 0 : matched / mapA.size,
    coverageB: mapB.size === 0 ? 0 : matched / mapB.size,
    newBreaksVsPrior,
    previousRunId: previousRun ? String(previousRun._id || '') : '',
  };

  const totalRows = rows.length;
  const rowsTruncated = rows.length > MAX_STORED_ROWS;
  return {
    summary,
    rows: rows.slice(0, MAX_STORED_ROWS),
    totalRows,
    rowsTruncated,
    durationMs: Date.now() - start,
    sideAName: sideA.name,
    sideBName: sideB.name,
  };
}

/**
 * Strip a stored/aggregated row down to a plain display record for the
 * break inspector. Prefers the representative raw sample row captured during
 * aggregation; falls back to the row itself. Internal bookkeeping keys are
 * removed.
 */
function fullRecord(aggRow) {
  if (!aggRow) return null;
  const src = aggRow.__sample && typeof aggRow.__sample === 'object' ? aggRow.__sample : aggRow;
  const out = {};
  for (const k of Object.keys(src)) {
    if (k.startsWith('__')) continue;
    if (k === '_id') continue;
    const v = src[k];
    if (v == null) { out[k] = v; continue; }
    if (typeof v === 'object') {
      // Dates → ISO; everything else → best-effort string to keep BSON small.
      out[k] = v instanceof Date ? v.toISOString() : String(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function pickValues(aggRow, measureCols, attrCols, side) {
  const out = {};
  for (const m of measureCols) {
    const field = side === 'a' ? m.a : m.b;
    out[m.a] = normalizeNumber(aggRow[field]); // always alias to A's column name for display
  }
  for (const a of attrCols) {
    const field = side === 'a' ? a.a : a.b;
    out[a.a] = aggRow[field];
  }
  out.__count = aggRow.__count;
  return out;
}

/**
 * Materialize only enough data to infer column names and types.
 * For datasets, limits to 200 rows to avoid full-pipeline cost.
 */
async function materializeColumnsOnly(side, user) {
  if (!side || !side.kind || !side.refId) throw new Error('Invalid source side');
  if (side.kind === 'dataset') {
    const ds = await user.getModel('SavedModel').findOne({ _id: side.refId, tenantId: user.tenantId });
    if (!ds) throw new Error(`Dataset not found: ${side.refId}`);
    return materializeDataset(ds, user, 200);
  }
  // For CSV, parsedRows already stored or raw is parsed; full materialize is acceptable
  return materializeSide(side, user);
}

/**
 * Lightweight dry-run used by the live "would this match?" preview in the
 * mapping step. Runs the real matching engine (so counts are exact for the
 * materialized rows) but never persists a ReconRun and skips the heavy
 * per-row bookkeeping. Returns the summary only.
 *
 * @param recon — a config object: { sourceA, sourceB, mapping, options }
 */
async function previewMatch(recon, user, { limitPerSide = 0 } = {}) {
  const result = await runRecon(recon, user, null, { preview: true, limitPerSide });
  return {
    summary: result.summary,
    durationMs: result.durationMs,
    rowsConsidered: { a: result.summary?.rowCounts?.a ?? 0, b: result.summary?.rowCounts?.b ?? 0 },
    limited: limitPerSide > 0,
    sampleSize: limitPerSide || 0,
  };
}

module.exports = {
  parseCsv,
  inferTypes,
  applyTransform,
  materializeSide,
  materializeColumnsOnly,
  suggestMapping,
  runRecon,
  previewMatch,
};
