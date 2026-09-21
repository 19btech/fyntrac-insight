const queryRunner = require('./query-runner.service');

/**
 * Instrument Browser query construction.
 *
 * Everything here exists to keep the browser's filter index-friendly. The
 * obvious implementation — a catch-all $or that tries every possible storage
 * shape, built on the client — cannot use an index: $expr is evaluated per
 * document and a case-insensitive $regex forces a scan. On a large collection
 * that is the difference between a keyed lookup and a full scan.
 *
 * Instead the field's BSON type is detected once, when the source is
 * registered, and the match is built from that.
 */

// Column-name heuristics used to decide whether a source can be browsed at all
// and to pre-select the mappings in the config dialog.
const INSTRUMENT_PATTERNS = [
  /^instrument_?id$/i, /instrument.*id/i, /^isin$/i, /^cusip$/i, /^sedol$/i,
  /^security_?id$/i, /security.*id/i, /instrument/i,
];
const POSTING_DATE_PATTERNS = [
  /^posting_?date$/i, /posting.*date/i, /post.*date/i,
  /^accounting_?date$/i, /^effective_?date$/i, /^as_?of_?date$/i, /_?date$/i,
];
const PERIOD_PATTERNS = [
  /^accounting_?period_?id$/i, /accounting.*period/i, /^period_?id$/i,
  /_?period_?id$/i, /period/i,
];

function matchAll(columns, patterns) {
  const out = [];
  for (const p of patterns) {
    for (const c of columns) {
      if (p.test(c) && !out.includes(c)) out.push(c);
    }
  }
  return out;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}|$)/;

/**
 * Type of a sample value, as the match builder cares about it.
 *
 * Note the probe reads a source's OUTPUT, and executePipeline normalises BSON
 * dates to ISO strings on the way out. So an ISO-looking string is ambiguous:
 * the column may be a real BSON date or genuinely a string. That case is
 * reported as 'isoDate' and the match covers both — guessing either way would
 * silently return zero rows, which reads as "no data" rather than a bug.
 */
function detectType(value) {
  if (value === null || value === undefined) return 'unknown';
  if (value instanceof Date) return 'date';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return ISO_DATE_RE.test(value) ? 'isoDate' : 'string';
  if (typeof value === 'object') {
    if (value.$date !== undefined) return 'date';
    if (value.$numberDecimal !== undefined || value.$numberLong !== undefined) return 'number';
  }
  return 'unknown';
}

/**
 * Map a SQL dataset's OUTPUT column back to the source column it came from.
 *
 * A Prism dataset routinely renames things (`Instrumentid AS SalesOrderID`).
 * The browser filters on output names, but pushing that filter down to Mongo
 * needs the source name, so resolve the alias here.
 *
 * Deliberately conservative: only a bare `column AS alias` is resolved, never
 * an expression like `SUM(x) AS total`, which has no single source column.
 * Returning null just means no push-down — never a wrong filter.
 */
function resolveSqlAlias(sql, outputColumn) {
  if (!sql || !outputColumn) return null;
  const target = String(outputColumn).toLowerCase();

  // `src AS "Output Name"` / `src AS output_name`, src being a plain
  // (optionally table-qualified, optionally quoted) column reference.
  const re = /(?:^|[,\s(])(?:"([A-Za-z_][\w$]*)"|([A-Za-z_][\w$]*))(?:\.(?:"([A-Za-z_][\w$]*)"|([A-Za-z_][\w$]*)))?\s+AS\s+(?:"([^"]+)"|([A-Za-z_][\w$]*))/gi;

  let m;
  while ((m = re.exec(sql)) !== null) {
    const alias = m[5] ?? m[6];
    if (!alias || alias.toLowerCase() !== target) continue;
    // With a table qualifier the column is the part after the dot.
    const qualified = m[3] ?? m[4];
    const bare = m[1] ?? m[2];
    const source = qualified || bare;
    if (source && source.toLowerCase() !== target) return source;
    return source || null;
  }
  return null;
}

/**
 * Blank out balanced parenthesised groups, so the checks below see only the
 * OUTER query. A derived table doing its own `SUM(...) ... GROUP BY` says
 * nothing about whether the outer SELECT aggregates — without this, any query
 * containing a subquery fails the aggregation test and loses its push-down.
 *
 * Spaces replace the removed text so word boundaries elsewhere still hold.
 */
function stripSubqueries(sql) {
  let depth = 0;
  let out = '';
  for (const ch of String(sql)) {
    if (ch === '(') { depth += 1; out += ' '; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); out += ' '; continue; }
    out += depth > 0 ? (ch === '\n' ? '\n' : ' ') : ch;
  }
  return out;
}

/**
 * Whether a predicate on `sourceCol` can be pushed into the Mongo read that
 * feeds a SQL dataset, without changing the rows the SQL would have produced.
 *
 * Safe when the outer query does not aggregate: filtering the input filters the
 * output one-for-one. When it DOES aggregate, it is only safe if the column is
 * a grouping key — then each group is built from exactly the rows that survive
 * the filter, so the surviving groups keep identical values. Filtering on a
 * non-key column would silently change every SUM.
 *
 * Fails closed: anything it cannot prove returns false, costing speed only.
 */
function canPushdownToSql(sql, sourceCol) {
  if (!sql || !sourceCol) return false;
  const text = stripSubqueries(sql);

  const groupBy = /\bGROUP\s+BY\b([\s\S]*?)(?:\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|;|$)/i.exec(text);
  if (!groupBy) {
    // No GROUP BY — but a bare aggregate (or a window function) still collapses
    // rows, and filtering the input would change the result.
    const collapses = /\b(SUM|AVG|COUNT|MIN|MAX|STDDEV|VARIANCE|ARRAY_AGG|STRING_AGG|LIST)\s*\(/i.test(text)
      || /\bOVER\s*\(/i.test(text)
      || /\bDISTINCT\b/i.test(text);
    return !collapses;
  }

  // Ordinals (GROUP BY 1,2) refer to select-list positions we are not parsing;
  // require the column to be named outright.
  const keys = groupBy[1];
  const re = new RegExp(`(?:^|[,\\s("])"?${escapeRegex(sourceCol)}"?(?:$|[,\\s)"])`, 'i');
  return re.test(keys);
}

/**
 * Runs one row of a source to learn its output columns and their types.
 * Returns { columns, types, error }.
 */
const PROBE_TIMEOUT_MS = parseInt(process.env.INSTRUMENT_PROBE_TIMEOUT_MS || '30000', 10);
const PROBE_PRELIMIT = parseInt(process.env.INSTRUMENT_PROBE_PRELIMIT || '500', 10);

async function probeSource(exec, user, { timeoutMs = PROBE_TIMEOUT_MS, prelimit = PROBE_PRELIMIT } = {}) {
  const run = queryRunner.runQuery({
    collection: exec.collection || '',
    pipeline: [...(exec.pipeline || []), { $limit: 1 }],
    sourceModelId: exec.sourceModelId,
    user,
    audit: false,
    // For a SQL dataset the whole source collection would otherwise be streamed
    // into DuckDB just to look at one row. Sampling is enough to learn the
    // column names and types.
    prelimit,
  });

  // A dataset that aggregates a huge collection can take a long time even for
  // a single row. Time out rather than hanging the config dialog.
  let timer;
  const timeout = new Promise((_res, rej) => {
    timer = setTimeout(() => rej(new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s reading this source`)), timeoutMs);
  });

  try {
    const { payload } = await Promise.race([run, timeout]);
    const columns = payload.columns || [];
    const row = (payload.data || [])[0] || {};
    const types = {};
    for (const c of columns) types[c] = detectType(row[c]);
    return { columns, types, error: null };
  } catch (err) {
    return { columns: [], types: {}, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether a source can be browsed: it needs an instrument column AND at least
 * one column to filter the period by (a posting date or an accounting period).
 */
function analyseColumns(columns, types, aliasOf = null) {
  // A SQL dataset renames its columns, so a perfectly browsable source can
  // surface `SalesOrderID` rather than `instrumentId`. When the output name
  // resolves back to a source column, test that name too — otherwise the
  // source looks ineligible purely because of an alias.
  const match = (patterns) => {
    const direct = matchAll(columns, patterns);
    if (!aliasOf) return direct;
    const viaAlias = columns.filter((c) => {
      const src = aliasOf(c);
      return src && patterns.some((p) => p.test(src));
    });
    return [...direct, ...viaAlias].filter((c, i, a) => a.indexOf(c) === i);
  };

  const instrument = match(INSTRUMENT_PATTERNS);

  // A date-typed column is a posting-date candidate even if its name does not
  // look like one; a period is usually numeric (202607) so it is name-driven.
  const postingDate = match(POSTING_DATE_PATTERNS)
    .concat(columns.filter((c) => types[c] === 'date'))
    .filter((c, i, a) => a.indexOf(c) === i);
  const period = match(PERIOD_PATTERNS);

  return {
    instrument,
    postingDate,
    period,
    // A source only needs an instrument column. Some have no time dimension at
    // all — current open records, one row per product — and are browsed by
    // instrument alone.
    eligible: instrument.length > 0,
  };
}

/* ─── Match construction ──────────────────────────────────────────────── */

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The spellings of a typed value worth trying, most likely first.
 *
 * Instrument ids are conventionally stored upper-cased, but someone typing one
 * in (or pasting it from an email) rarely matches that exactly. A
 * case-insensitive regex would find them and defeat every index on the column —
 * the single most expensive thing this file can do. Enumerating the few
 * plausible spellings instead keeps the lookup keyed: $in on an indexed field
 * is one index seek per value, so this costs at most two extra seeks and never
 * a scan.
 *
 * Deliberately NOT a blanket case-fold: the value is tried as typed first, so a
 * source whose ids genuinely carry mixed case still matches exactly.
 */
function caseVariants(value) {
  return [...new Set([value, value.toUpperCase(), value.toLowerCase()])];
}

/**
 * Instrument equality. Exact match on one of a few case spellings — never a
 * case-insensitive regex, which would defeat any index on the column.
 */
function instrumentClause(field, rawValue, fieldType) {
  const value = String(rawValue).trim();
  const numeric = /^-?\d+$/.test(value) ? Number(value) : null;

  if (fieldType === 'number' && numeric !== null) return { [field]: numeric };

  const variants = caseVariants(value);
  if (fieldType === 'string') {
    return variants.length === 1 ? { [field]: value } : { [field]: { $in: variants } };
  }

  // Type unknown: accept the numeric reading too, still index-friendly ($in on
  // an indexed field is a keyed lookup per value).
  const all = numeric === null ? variants : [...variants, numeric];
  return all.length === 1 ? { [field]: all[0] } : { [field]: { $in: all } };
}

/**
 * Posting-date match for a single calendar day.
 *
 * `ymd` is "YYYY-MM-DD". For a real date column this becomes a half-open range
 * over Date objects, which is what an index on that column can serve. Note
 * these Date objects are built HERE, on the server — a Date sent from the
 * browser would arrive as a JSON string and silently fail to match.
 */
function postingDateClause(field, ymd, fieldType) {
  const start = new Date(`${ymd}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 86400000);
  // Covers both "2026-07-31" and "2026-07-31T00:00:00.000Z". A prefix range on
  // a string column is index-friendly, unlike a regex with $options:'i'.
  const stringRange = { [field]: { $gte: ymd, $lt: `${ymd}￿` } };

  if (fieldType === 'date') return { [field]: { $gte: start, $lt: end } };
  if (fieldType === 'string') return stringRange;

  // Ambiguous: the probe saw an ISO string, which is what a real BSON date
  // also looks like once normalised. Try both — each branch is a range that
  // an index on the column can still serve.
  if (fieldType === 'isoDate') {
    return { $or: [{ [field]: { $gte: start, $lt: end } }, stringRange] };
  }

  if (fieldType === 'number') {
    // Packed stamp (20260731) or epoch milliseconds.
    const compact = Number(ymd.replace(/-/g, ''));
    return { [field]: { $in: [compact, start.getTime()] } };
  }

  // Unknown type — fall back to the tolerant form. Slower, but correct.
  return {
    $or: [
      { [field]: { $gte: start, $lt: end } },
      { [field]: { $gte: ymd, $lt: `${ymd}￿` } },
      { [field]: Number(ymd.replace(/-/g, '')) },
      { [field]: { $regex: `^${escapeRegex(ymd)}` } },
    ],
  };
}

/**
 * Accounting-period match.
 *
 * The browser offers periods as execution dates from ExecutionState; a period
 * id is the same month packed as YYYYMM (2026-07-31 -> 202607), which is how
 * the instrument collections store it. Which of the two a source wants depends
 * on the type of its mapped column.
 */
function accountingPeriodClause(field, ymd, fieldType) {
  const periodId = Number(ymd.slice(0, 4)) * 100 + Number(ymd.slice(5, 7));

  const start = new Date(`${ymd}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 86400000);

  if (fieldType === 'number') return { [field]: periodId };
  // The column holds the period date itself.
  if (fieldType === 'date') return { [field]: { $gte: start, $lt: end } };
  if (fieldType === 'isoDate') {
    return { $or: [{ [field]: { $gte: start, $lt: end } }, { [field]: { $gte: ymd, $lt: `${ymd}￿` } }] };
  }
  if (fieldType === 'string') return { [field]: { $in: [String(periodId), ymd] } };

  return { $or: [{ [field]: periodId }, { [field]: String(periodId) }, { [field]: ymd }] };
}

/**
 * The $match stage for one source, or null when there is nothing to narrow by.
 * `period` is "YYYY-MM-DD" — a posting date, or the execution date standing in
 * for an accounting period. Blank means every period.
 */
function buildMatch(source, { instrumentId, period }) {
  const clauses = [];

  if (instrumentId && String(instrumentId).trim()) {
    clauses.push(instrumentClause(source.instrumentField, instrumentId, source.instrumentFieldType));
  }
  if (period && source.dateField) {
    clauses.push(
      source.dateMode === 'accountingPeriod'
        ? accountingPeriodClause(source.dateField, period, source.dateFieldType)
        : postingDateClause(source.dateField, period, source.dateFieldType)
    );
  }

  if (!clauses.length) return null;
  return { $match: clauses.length === 1 ? clauses[0] : { $and: clauses } };
}

/**
 * Stages that leave the document's field names intact. If a source's pipeline
 * only contains these, the instrument field still has its original name at the
 * start of the pipeline, so the filter can be PREPENDED — letting the match
 * run against the collection (and any index on it) instead of against the
 * pipeline's output. That is the single biggest win for a large source.
 */
// $limit/$skip are deliberately NOT here. They do not rename anything, but they
// decide WHICH rows survive: filtering before "the first 500 rows" yields a
// different 500. Only stages that change neither naming nor row membership
// qualify.
const NON_RESHAPING = new Set(['$match', '$sort']);

function canPrepend(pipeline) {
  if (!Array.isArray(pipeline)) return true;
  return pipeline.every((stage) => {
    const keys = Object.keys(stage || {});
    return keys.length > 0 && keys.every((k) => NON_RESHAPING.has(k));
  });
}

/**
 * Split trailing $limit/$skip stages off the end of a pipeline.
 *
 * The report editor saves a row cap ($limit) with a report. Left in place, the
 * browser's instrument filter runs AFTER it — so it filters "the first N rows
 * of the report" rather than "the report, filtered to this instrument". For a
 * report capped at 100 rows that means most instruments return nothing, and the
 * ones that do return only the periods that happened to fall inside the window.
 *
 * Returns { head, tail } so the caller can slot the filter between them.
 */
function splitTrailingLimits(pipeline) {
  const stages = Array.isArray(pipeline) ? pipeline : [];
  let cut = stages.length;
  while (cut > 0) {
    const keys = Object.keys(stages[cut - 1] || {});
    if (keys.length === 1 && (keys[0] === '$limit' || keys[0] === '$skip')) cut -= 1;
    else break;
  }
  return { head: stages.slice(0, cut), tail: stages.slice(cut) };
}

/**
 * Whether a trailing cap is a plain row cap rather than a ranking.
 *
 * "$sort then $limit" means "the top N", and filtering before it changes WHICH
 * N — the result would no longer be the report. With no sort the surviving rows
 * are in arbitrary order, so the cap only bounds output size and the filter can
 * safely move above it.
 */
function isPlainRowCap(stagesBeforeTail) {
  return !stagesBeforeTail.some((stage) => Object.keys(stage || {})[0] === '$sort');
}

/**
 * Trace one OUTPUT column of a Mongo pipeline back to the source-collection
 * field it came from, and say whether pre-filtering on it is sound.
 *
 * This is the Mongo counterpart of resolveSqlAlias + canPushdownToSql. Without
 * it, any dataset that groups or projects — which is most useful ones — has to
 * run over the whole collection before the instrument filter is applied.
 *
 * Walks backwards from the output name. Filtering the input is equivalent to
 * filtering the output when every stage either preserves the field's identity
 * or groups BY it: a group keyed on the instrument is built from exactly the
 * rows that survive the filter, so surviving groups keep identical values.
 *
 * Fails closed — anything it cannot prove returns { safe: false }, which costs
 * speed and never correctness.
 */
function resolveMongoLineage(pipeline, outputField) {
  if (!Array.isArray(pipeline) || pipeline.length === 0) {
    return { field: outputField, safe: true };
  }

  let name = outputField;

  for (let i = pipeline.length - 1; i >= 0; i--) {
    const stage = pipeline[i] || {};
    const op = Object.keys(stage)[0];
    if (!op) continue;
    const body = stage[op];

    if (op === '$match' || op === '$sort') continue; // identity

    if (op === '$addFields' || op === '$set' || op === '$project') {
      if (body && Object.prototype.hasOwnProperty.call(body, name)) {
        const v = body[name];
        if (typeof v === 'string' && v.startsWith('$')) {
          name = v.slice(1);            // renamed from another field
        } else if (v === 1 || v === true) {
          // included as-is — name unchanged
        } else {
          return { field: null, safe: false }; // computed from an expression
        }
      }
      continue;
    }

    if (op === '$group') {
      const id = body ? body._id : null;
      // Only the grouping key can be pre-filtered; an accumulator cannot.
      if (name === '_id') {
        if (typeof id === 'string' && id.startsWith('$')) { name = id.slice(1); continue; }
        return { field: null, safe: false };
      }
      if (name.startsWith('_id.')) {
        const key = name.slice(4);
        const v = id && typeof id === 'object' ? id[key] : null;
        if (typeof v === 'string' && v.startsWith('$')) { name = v.slice(1); continue; }
        return { field: null, safe: false };
      }
      return { field: null, safe: false };
    }

    // $limit/$skip change which rows survive; $lookup/$unwind/$facet/$bucket/
    // $replaceRoot/$replaceWith/$graphLookup/$setWindowFields change shape or
    // row multiplicity. None can be safely pre-filtered.
    return { field: null, safe: false };
  }

  return { field: name, safe: true };
}

module.exports = {
  probeSource,
  caseVariants,
  resolveSqlAlias,
  canPushdownToSql,
  stripSubqueries,
  analyseColumns,
  buildMatch,
  canPrepend,
  resolveMongoLineage,
  splitTrailingLimits,
  isPlainRowCap,
  detectType,
  INSTRUMENT_PATTERNS,
  POSTING_DATE_PATTERNS,
  PERIOD_PATTERNS,
  matchAll,
};
