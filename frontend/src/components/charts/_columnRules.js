/**
 * Domain-aware column display rules for Fyntrac data.
 *
 * Centralizes:
 *   - Which columns should never be shown to users (system / wrapper fields)
 *   - How specific columns should be formatted (e.g. periodId is YYYYMM,
 *     not a number with thousand separators)
 *
 * Used by:
 *   - DataTable / DatasetEditor preview render + CSV export
 *   - ChartRenderer (drops hidden columns from chart-bound data)
 *   - Backend schema endpoints filter hidden fields server-side
 *     (mirrored in backend/src/services/mongo.service.js HIDDEN_FIELDS)
 *
 * Names are matched case-insensitively against the leaf column key, so both
 * `accountingPeriod` and `ACCOUNTINGPERIOD` are caught, and nested keys like
 * `header.accountingPeriod` also match on the trailing segment.
 */

const HIDDEN_FIELDS = new Set([
  // Wrapper objects we never want to dump as JSON in a cell
  'accountingperiod',
  'attributes',
  // System / internal identifiers
  'batchid',
  'sourceid',
  '_class',
  'tenantid',
  // ActivityLog internal upload tracking — never useful to end users
  'jobid',
  'uploadid',
  'uploadfilepath',
  // Model collection internal config / file pointers
  'modelconfig',
  'modelfileid',
]);

/**
 * Format hints applied to specific column names. Each entry is one of:
 *   - 'date-yyyymm'   integer like 202202 (rendered "2022-02")
 *   - 'date-yyyymmdd' integer like 20220131 (rendered "2022-01-31")
 *   - 'date-iso'      ISO string / Date object (rendered "2022-01-31")
 *   - 'string'        force string render (no number formatting / commas)
 */
const COLUMN_FORMATS = {
  // Long numeric IDs that overflow JS Number precision and must stay as strings
  attributeid: 'string',
  instrumentid: 'string',
  instrumentattributeversionid: 'string',
  // InstrumentAttribute end/close dates are stored as YYYYMMDD ints
  enddate: 'date-yyyymmdd',
  closedate: 'date-yyyymmdd',
  // AccountingPeriod year is a plain 4-digit integer — render without commas
  year: 'string',
};

// Name-pattern fallbacks evaluated when a leaf name isn't in COLUMN_FORMATS.
// Keep period detection BEFORE date detection so `accountingPeriodId` /
// `originalPeriodId` / `previousAccountingPeriodId` are treated as YYYYMM
// (not YYYYMMDD).
function inferFormatByName(leaf) {
  if (!leaf) return null;
  // YYYYMM period fields: any leaf name ending in "period" or "periodid"
  // — covers periodId, originalPeriodId, accountingPeriodId,
  // previousAccountingPeriodId, fiscalPeriod, postingPeriod, effectivePeriod
  // (all lowercased before matching).
  if (/period(id)?$/.test(leaf)) return 'date-yyyymm';
  // Any other column whose name implies a date / time / timestamp.
  if (/(date|datetime|timestamp|time|_at|signedup|expires|expiry|due|posted|posting|effective|capture|maturity|created|updated|modified)$/.test(leaf)) {
    return 'date-any';
  }
  return null;
}

/**
 * Columns whose raw value is a wrapper object holding a single numeric
 * measurement (e.g. `beginningBalance: { amount: 1234.56, currency: 'USD' }`).
 * Across instrumentLevelLtd / attributeLevelLtd / metricLevelLtd these always
 * appear as objects and the user wants to see them as plain number columns.
 * The unwrapper picks the first numeric value found in the object so it works
 * for any of `amount`, `value`, `quantity`, etc.
 */
const NUMERIC_WRAPPER_FIELDS = new Set([
  'beginningbalance',
  'endingbalance',
  'activityamount',
  'activity',
  'amount',
  'balance',
  'debitamount',
  'creditamount',
]);

function leafName(name) {
  if (!name) return '';
  const s = String(name);
  const leaf = s.includes('.') ? s.slice(s.lastIndexOf('.') + 1) : s;
  return leaf.toLowerCase();
}

export function isHiddenColumn(name) {
  return HIDDEN_FIELDS.has(leafName(name));
}

export function getColumnFormat(name) {
  const leaf = leafName(name);
  return COLUMN_FORMATS[leaf] || inferFormatByName(leaf);
}

/**
 * If `name` is a known numeric-wrapper column and `value` is an object,
 * return the inner numeric value (the first finite number found). Otherwise
 * return `value` unchanged. Lets balance/amount columns flow through the rest
 * of the pipeline as plain numbers regardless of the wrapper shape.
 */
export function extractNumericWrapper(name, value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return value;
  if (!NUMERIC_WRAPPER_FIELDS.has(leafName(name))) return value;
  // Common fields first for predictable behaviour, then any numeric value.
  const preferred = ['amount', 'value', 'balance', 'quantity'];
  for (const k of preferred) {
    if (value[k] != null) {
      const n = Number(value[k]);
      if (Number.isFinite(n)) return n;
    }
  }
  for (const k of Object.keys(value)) {
    const n = Number(value[k]);
    if (Number.isFinite(n)) return n;
  }
  return value;
}

/**
 * Format a raw value according to the column-specific rule. Returns the
 * formatted string, or `undefined` if no rule applies (caller should fall
 * back to its default rendering).
 */
export function formatByColumn(name, value) {
  if (value == null || value === '') return '';
  // Date objects and ISO-8601 strings always render as YYYY-MM-DD regardless
  // of column name — keeps unknown date columns (e.g. user-defined attributes
  // typed DATE) consistent across the UI.
  const iso = toIsoDay(value);
  if (iso) return iso;
  // Numeric wrappers like beginningBalance/{amount: 1234} get unwrapped
  // so they format like a plain number column.
  const unwrapped = extractNumericWrapper(name, value);
  const fmt = getColumnFormat(name);
  if (!fmt) {
    if (unwrapped !== value && typeof unwrapped === 'number') {
      return unwrapped.toLocaleString(undefined, { maximumFractionDigits: 4 });
    }
    return undefined;
  }
  if (fmt === 'string') return String(unwrapped);
  if (fmt === 'date-iso' || fmt === 'date-any') {
    const i2 = toIsoDay(unwrapped);
    if (i2) return i2;
    // Fall through to numeric handling for date-any (might be YYYYMMDD int).
  }
  if (fmt === 'date-any') {
    const day = numericDay(unwrapped);
    if (day) return day;
    return String(unwrapped);
  }
  const n = Number(unwrapped);
  if (!Number.isFinite(n)) return String(unwrapped);
  if (fmt === 'date-yyyymm') {
    // Accept 202202 or 20220201 and render YYYY-MM
    const i = Math.trunc(n);
    if (i >= 190001 && i <= 210012) {
      const y = Math.floor(i / 100);
      const m = i % 100;
      if (m >= 1 && m <= 12) return `${y}-${String(m).padStart(2, '0')}`;
    }
    if (i >= 19000101 && i <= 21001231) {
      const y = Math.floor(i / 10000);
      const m = Math.floor((i % 10000) / 100);
      if (m >= 1 && m <= 12) return `${y}-${String(m).padStart(2, '0')}`;
    }
    return String(value);
  }
  if (fmt === 'date-yyyymmdd') {
    return numericDay(unwrapped) || String(value);
  }
  return undefined;
}

// Return YYYY-MM-DD for a Date / ISO-8601 string, otherwise null.
function toIsoDay(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'string') {
    // BSON extended JSON wrapper
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  }
  if (v && typeof v === 'object' && typeof v.$date === 'string') {
    return v.$date.slice(0, 10);
  }
  return null;
}

// Return YYYY-MM-DD for a YYYYMMDD integer, otherwise null.
function numericDay(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i >= 19000101 && i <= 21001231) {
    const y = Math.floor(i / 10000);
    const m = Math.floor((i % 10000) / 100);
    const d = i % 100;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return null;
}

/**
 * Filter a list of column names to drop hidden ones. Pure helper for
 * preview tables and the data table component.
 */
export function visibleColumns(columns) {
  if (!Array.isArray(columns)) return [];
  return columns.filter((c) => !isHiddenColumn(c));
}
