const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { Database } = require('duckdb-async');
const mongoService = require('./mongo.service');
const { parseAndValidate, buildLoadPlan } = require('./sql-pushdown.service');

// Interactive guard: if a single collection would be scanned unfiltered and it
// has more than this many rows, we ask the user to add a WHERE/LIMIT (or use
// Export, which has no such guard). Generous by default — tune via env.
const INTERACTIVE_SCAN_LIMIT = parseInt(process.env.SQL_INTERACTIVE_SCAN_LIMIT || '2000000', 10);
// Rows streamed to DuckDB per write batch (memory stays flat regardless).
const STREAM_BATCH = 5000;

/**
 * DuckDB identifiers (incl. JSON struct field names) are case-INSENSITIVE, so
 * when different documents in the same collection spell a field with different
 * casing — e.g. some rows have `postingDate` and others `PostingDate` —
 * read_json_auto unions them and fails with "Duplicate name ... in struct".
 *
 * We canonicalize every key to a single, stable spelling per lower-cased name,
 * shared across ALL rows of a load (`canonMap`). The first spelling seen wins;
 * later case-variants are remapped to it, so the file has one consistent name
 * and DuckDB ingests it cleanly. This matches DuckDB's own case-insensitive
 * semantics (it would treat the variants as the same column anyway). Recurses
 * into nested objects/arrays since STRUCT fields follow the same rule.
 */
function canonicalizeKeys(value, canonMap) {
  if (Array.isArray(value)) return value.map((v) => canonicalizeKeys(v, canonMap));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const lower = k.toLowerCase();
      let name = canonMap.get(lower);
      if (!name) { name = k; canonMap.set(lower, k); }
      const cv = canonicalizeKeys(v, canonMap);
      if (Object.prototype.hasOwnProperty.call(out, name)) {
        // Same row carried two case-variants of this key — keep the non-null one.
        if (out[name] == null && cv != null) out[name] = cv;
      } else {
        out[name] = cv;
      }
    }
    return out;
  }
  return typeof value === 'string' ? toDuckTimestamp(value) : value;
}

// `normalizeBson` emits dates as ISO-8601 with a `Z` suffix (e.g.
// "2025-01-31T00:00:00.000Z"). DuckDB's read_json_auto keeps that as VARCHAR,
// so `WHERE dateCol = '2025-01-31'` never matches. Rewriting it to a tz-naive
// "YYYY-MM-DD HH:MM:SS" string makes read_json_auto infer a real TIMESTAMP
// column, so date comparisons / ranges / equality work as users expect.
const ISO_TS_RX = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?Z?$/;
function toDuckTimestamp(s) {
  const m = ISO_TS_RX.exec(s);
  return m ? `${m[1]} ${m[2]}` : s;
}

/**
 * Rewrite the column names of a pushed-down `$match` to the real Mongo field
 * casing. Keys that don't resolve to a known field are DROPPED, which only ever
 * widens the filter (superset-safe, since DuckDB re-applies the full WHERE).
 * Returns the `{ $match }` stage, or null when nothing safely survives.
 */
function canonicalizeMatchStage(stage, fieldMap) {
  if (!stage || !stage.$match) return null;
  const expr = canonicalizeMatchExpr(stage.$match, fieldMap);
  return expr ? { $match: expr } : null;
}

function canonicalizeMatchExpr(expr, fieldMap) {
  if (!expr || typeof expr !== 'object') return expr;
  if (Array.isArray(expr.$and)) {
    const parts = expr.$and.map((e) => canonicalizeMatchExpr(e, fieldMap)).filter((p) => p != null);
    return parts.length ? { $and: parts } : null;
  }
  if (Array.isArray(expr.$or)) {
    const parts = expr.$or.map((e) => canonicalizeMatchExpr(e, fieldMap));
    if (parts.some((p) => p == null)) return null; // dropping an OR branch would narrow -> unsound
    return { $or: parts };
  }
  const out = {};
  for (const [k, v] of Object.entries(expr)) {
    if (k.startsWith('$')) { out[k] = v; continue; }
    const real = fieldMap.get(k.toLowerCase());
    if (real) out[real] = v; // unknown field -> drop (widen)
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Rewrite a pushed-down `$project` to the real field casing. If any referenced
 * column can't be resolved, drop the projection entirely (fetch all) so we
 * never accidentally omit a column the query needs.
 */
function canonicalizeProjectStage(stage, fieldMap) {
  if (!stage || !stage.$project) return null;
  const remapped = {};
  for (const k of Object.keys(stage.$project)) {
    const real = fieldMap.get(k.toLowerCase());
    if (!real) return null; // can't resolve a needed column -> fetch all
    remapped[real] = 1;
  }
  return Object.keys(remapped).length ? { $project: remapped } : null;
}

/**
 * Open a fresh in-memory DuckDB, run `fn`, and always close it. One database
 * per request keeps tenants isolated and sidesteps cross-query concurrency.
 */
async function withDatabase(fn) {
  const db = await Database.create(':memory:');
  try {
    return await fn(db);
  } finally {
    await db.close().catch(() => {});
  }
}

/**
 * Stream one secured Mongo collection into a newline-delimited JSON temp file
 * and load it into DuckDB via the native `read_json_auto` reader (C++ ingest —
 * no per-row JS overhead, handles millions of rows). Returns the row count.
 */
async function loadCollection(db, realName, planStage, user, { enforceScanGuard }) {
  // Rewrite pushed-down predicate/projection columns to the real Mongo field
  // casing. Mongo field names are case-sensitive, so `WHERE eventid = ...` must
  // become `{ eventId: ... }` or it silently matches nothing. Unresolvable
  // columns are dropped from the $match (DuckDB still applies the full WHERE,
  // case-insensitively) — keeping pushdown a strict superset.
  const fieldMap = await mongoService.getFieldNameMap(realName, user);
  const matchStage = canonicalizeMatchStage(planStage.match, fieldMap);
  const projectStage = canonicalizeProjectStage(planStage.project, fieldMap);
  const extraStages = [];
  if (matchStage) extraStages.push(matchStage);
  if (projectStage) extraStages.push(projectStage);

  if (enforceScanGuard && !matchStage) {
    const total = await mongoService.countSecured(realName, null, user);
    if (total > INTERACTIVE_SCAN_LIMIT) {
      throw new Error(
        `"${realName}" has ${total.toLocaleString()} rows. Add a WHERE clause (or a LIMIT) to narrow it, ` +
          `or use Export to download the full result set.`
      );
    }
  }

  const tmpFile = path.join(os.tmpdir(), `sqllab-${randomUUID()}.ndjson`);
  const out = fs.createWriteStream(tmpFile, { encoding: 'utf8' });
  let rowCount = 0;
  const cursor = await mongoService.getSecuredCursor(realName, extraStages, user);
  // Shared across every row so case-variant field names resolve to one spelling.
  const canonMap = new Map();

  try {
    let buf = '';
    let inBatch = 0;
    for await (const doc of cursor) {
      const clean = canonicalizeKeys(mongoService.cleanDoc(realName, mongoService.normalizeBson(doc)), canonMap);
      buf += JSON.stringify(clean) + '\n';
      rowCount += 1;
      if (++inBatch >= STREAM_BATCH) {
        if (!out.write(buf)) await new Promise((r) => out.once('drain', r));
        buf = '';
        inBatch = 0;
      }
    }
    if (buf) out.write(buf);
    await new Promise((resolve, reject) => {
      out.end((err) => (err ? reject(err) : resolve()));
    });

    const quoted = realName.replace(/"/g, '""');
    if (rowCount === 0) {
      // read_json_auto can't infer a schema from an empty file — build a typed
      // empty table from the inferred schema so `SELECT col` still resolves.
      await createEmptyTable(db, realName, quoted, user);
    } else {
      const safePath = tmpFile.replace(/'/g, "''");
      await db.run(
        `CREATE TABLE "${quoted}" AS ` +
          `SELECT * FROM read_json_auto('${safePath}', format='newline_delimited', sample_size=-1)`
      );
    }
    return rowCount;
  } finally {
    fs.promises.unlink(tmpFile).catch(() => {});
  }
}

async function createEmptyTable(db, realName, quoted, user) {
  let fields = [];
  try {
    fields = await mongoService.inferSchema(realName, user);
  } catch {
    fields = [];
  }
  const typeOf = (t) =>
    t === 'number' ? 'DOUBLE' : t === 'date' ? 'TIMESTAMP' : t === 'boolean' ? 'BOOLEAN' : 'VARCHAR';
  // Drop case-insensitive duplicate column names (same DuckDB rule as above).
  const usedNames = new Set();
  const cols = [];
  for (const f of fields) {
    if (/[.$"]/.test(f.name)) continue;
    const lower = f.name.toLowerCase();
    if (usedNames.has(lower)) continue;
    usedNames.add(lower);
    cols.push(`"${f.name}" ${typeOf(f.type)}`);
  }
  const colDdl = cols.length ? cols.join(', ') : '"_empty" VARCHAR';
  await db.run(`CREATE TABLE "${quoted}" (${colDdl})`);
}

/** Resolve + load every collection a query references. */
async function loadTables(db, plan, user, { enforceScanGuard }) {
  const counts = {};
  for (const stage of plan) {
    const real = await mongoService.resolveCollection(stage.table, user);
    if (!real) {
      throw new Error(`Unknown collection "${stage.table}". Check the name in the left sidebar.`);
    }
    counts[real] = await loadCollection(db, real, stage, user, { enforceScanGuard });
  }
  return counts;
}

function stripTrailingSemicolons(sql) {
  return String(sql).trim().replace(/;+\s*$/, '');
}

/**
 * Build an ORDER BY clause from a grid sort model, accepting only fields that
 * exist in the query's result columns (DESCRIBE whitelist). Returns '' when
 * there's nothing valid to sort by.
 */
function buildOrderBy(sort, columns) {
  if (!Array.isArray(sort) || sort.length === 0) return '';
  const allowed = new Set(columns);
  const parts = [];
  for (const s of sort) {
    if (!s || !allowed.has(s.field)) continue;
    const dir = String(s.sort).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    parts.push(`"${s.field.replace(/"/g, '""')}" ${dir} NULLS LAST`);
  }
  return parts.length ? ` ORDER BY ${parts.join(', ')}` : '';
}

// DuckDB returns BIGINT/HUGEINT as JS BigInt and dates as Date objects; make
// every value JSON-serializable for the API response. Recurses into STRUCT /
// LIST columns (e.g. EventHistory.eventDetail) so nested BigInts don't escape
// into res.json and throw "Do not know how to serialize a BigInt".
function serializeValue(v) {
  if (typeof v === 'bigint') {
    return v >= -9007199254740991n && v <= 9007199254740991n ? Number(v) : v.toString();
  }
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(serializeValue);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = serializeValue(val);
    return out;
  }
  return v;
}
function serializeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = serializeValue(v);
  return out;
}

/**
 * Interactive query: load referenced collections, then run the user's SELECT
 * inside DuckDB and return one page of rows plus the total row count and the
 * dynamically-derived column list.
 */
async function runQuery({ sql, user, page = 0, pageSize = 100, sort = [] }) {
  const start = Date.now();
  const { ast, tables, sql: effectiveSql } = parseAndValidate(sql);
  if (tables.length === 0) {
    // Tableless SELECT (e.g. `SELECT 1`) — run it directly.
    return withDatabase(async (db) => {
      const inner = stripTrailingSemicolons(effectiveSql);
      const rows = await db.all(inner);
      return {
        rows: rows.map(serializeRow),
        columns: rows.length ? Object.keys(rows[0]) : [],
        rowCount: rows.length,
        page,
        pageSize,
        executionTime: Date.now() - start,
      };
    });
  }

  const plan = buildLoadPlan(ast, tables);

  return withDatabase(async (db) => {
    const counts = await loadTables(db, plan, user, { enforceScanGuard: true });
    const inner = stripTrailingSemicolons(effectiveSql);

    const describe = await db.all(`DESCRIBE SELECT * FROM (${inner}) AS _q`);
    const columns = describe.map((d) => d.column_name);

    const totalRow = await db.all(`SELECT COUNT(*) AS n FROM (${inner}) AS _q`);
    const rowCount = Number(totalRow[0]?.n ?? 0);

    // Server-side sort: only allow columns that actually exist in the result
    // (whitelist against DESCRIBE), then quote them — no SQL injection surface.
    const orderBy = buildOrderBy(sort, columns);
    const off = Math.max(0, page) * pageSize;
    const rows = await db.all(`SELECT * FROM (${inner}) AS _q${orderBy} LIMIT ${pageSize} OFFSET ${off}`);

    return {
      rows: rows.map(serializeRow),
      columns,
      rowCount,
      page,
      pageSize,
      scanned: counts,
      executionTime: Date.now() - start,
    };
  });
}

/**
 * Export path: load referenced collections (NO scan guard — full result by
 * design) and have DuckDB write the entire result to a CSV file natively.
 * Returns { rowCount }.
 */
async function exportToCsv({ sql, user, filePath }) {
  const { ast, tables, sql: effectiveSql } = parseAndValidate(sql);
  const inner = stripTrailingSemicolons(effectiveSql);

  return withDatabase(async (db) => {
    if (tables.length > 0) {
      const plan = buildLoadPlan(ast, tables);
      await loadTables(db, plan, user, { enforceScanGuard: false });
    }
    const totalRow = await db.all(`SELECT COUNT(*) AS n FROM (${inner}) AS _q`);
    const rowCount = Number(totalRow[0]?.n ?? 0);
    const safePath = filePath.replace(/'/g, "''");
    await db.run(`COPY (${inner}) TO '${safePath}' (HEADER, FORMAT CSV)`);
    return { rowCount };
  });
}

/**
 * Cheap up-front estimate of how many rows an export will produce, shown in
 * the "CSV is being generated (~N rows)" toast. For a single filtered
 * collection we use the pushed-down count; otherwise we fall back to the
 * largest referenced collection's size as a rough upper bound.
 */
async function estimateRows({ sql, user }) {
  const { ast, tables } = parseAndValidate(sql);
  if (tables.length === 0) return null;
  const plan = buildLoadPlan(ast, tables);
  let est = 0;
  for (const stage of plan) {
    const real = await mongoService.resolveCollection(stage.table, user);
    if (!real) continue;
    const fieldMap = await mongoService.getFieldNameMap(real, user);
    const match = canonicalizeMatchStage(stage.match, fieldMap);
    const n = await mongoService.countSecured(real, match, user);
    est = Math.max(est, n);
  }
  return est;
}

module.exports = { runQuery, exportToCsv, estimateRows };
