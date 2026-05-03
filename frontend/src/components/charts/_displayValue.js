/**
 * Humanize a camelCase / PascalCase identifier into spaced Title Case.
 * "MeasurementType" → "Measurement Type", "SYSTEM" → "System".
 */
function humanizeLabel(s) {
  if (!s) return '';
  // Already all-caps abbreviation (e.g. "CF", "SYSTEM") → Title-case it.
  if (/^[A-Z0-9_]+$/.test(s)) return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Flatten an EventHistory `eventDetail` object into a readable comma-separated
 * string showing every field and its value — no JSON blobs, no tooltips.
 *
 * Top-level scalar fields (sourceTable, sourceKey, eventType, …) are emitted
 * first as "Field Name: value".  Then every entry inside `values` contributes
 * its own scalar fields, de-duplicated across entries so repeated values only
 * appear once.
 *
 * Example output:
 *   "Source Table: Measurement Type, Instrument: LN-1001, LN-1002,
 *    Measurement Type: CF, Fair Value, Posting Date: 2024-01-15, Amount: 500"
 */
/** Convert any recognisable date string/number to YYYYMMDD (e.g. "2024-01-15" → "20240115"). */
function toYYYYMMDD(val) {
  // Handle numeric Unix epoch (ms) directly.
  if (typeof val === 'number' || (typeof val === 'string' && /^\d{10,13}$/.test(val.trim()))) {
    const ms = Number(val);
    // 10-digit = seconds, 13-digit = milliseconds
    const d = new Date(String(val).length <= 10 ? ms * 1000 : ms);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dy = String(d.getUTCDate()).padStart(2, '0');
      return `${y}${mo}${dy}`;
    }
  }
  const s = String(val).trim();
  // Already YYYYMMDD (8 digits)
  if (/^\d{8}$/.test(s)) return s;
  // ISO / YYYY-MM-DD — extract date part directly to avoid timezone shifts
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  // Last resort: try JS Date via UTC methods
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dy = String(d.getUTCDate()).padStart(2, '0');
    return `${y}${mo}${dy}`;
  }
  return s; // unchanged if unparseable
}

const DATE_KEY_RX = /date|Date/;

function formatEventDetail(v) {
  if (!v || typeof v !== 'object') return '';

  const SKIP_KEYS = new Set(['_id', '__v', '_metadata', 'values']);
  const parts = [];

  // Top-level scalar fields first.
  for (const [k, val] of Object.entries(v)) {
    if (SKIP_KEYS.has(k)) continue;
    if (val == null || typeof val === 'object') continue;
    const display = DATE_KEY_RX.test(k) ? toYYYYMMDD(val) : val;
    parts.push(`${humanizeLabel(k)}: ${display}`);
  }

  // Collect all scalar fields from every entry in `values`, de-duplicating values per key.
  const valuesObj = v.values || {};
  const entries = Object.values(valuesObj);
  const byKey = {}; // key → Set of unique values

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    for (const [k, val] of Object.entries(entry)) {
      if (/^_/.test(k)) continue; // skip internal fields
      if (val == null || typeof val === 'object') continue;
      if (!byKey[k]) byKey[k] = new Set();
      byKey[k].add(DATE_KEY_RX.test(k) ? toYYYYMMDD(val) : String(val));
    }
  }

  for (const [k, valSet] of Object.entries(byKey)) {
    parts.push(`${humanizeLabel(k)}: ${[...valSet].join(', ')}`);
  }

  if (entries.length > 0) {
    parts.push(`Records: ${entries.length}`);
  }

  return parts.join(', ');
}

/**
 * Coerce a raw cell value into something safe to render in a table or CSV.
 *
 * Many MongoDB documents store small wrapper objects around a single scalar
 * — e.g. `accountingPeriod: { periodId: 202202 }` or `_id: { $oid: '...' }`.
 * In a tabular view those wrappers add no information and look like
 * `{"periodId":202202}` to the user. This helper unwraps single-key
 * objects whose value is a primitive so the table shows `202202` instead.
 *
 * Pass an optional `colName` for domain-specific formatting of well-known
 * complex fields (e.g. EventHistory.eventDetail).
 *
 * Behavior:
 *   - null / undefined  -> ''
 *   - primitives        -> returned as-is (so number formatting still works)
 *   - { onlyKey: prim } -> the primitive
 *   - other objects     -> compact JSON (existing fallback)
 */
export function displayValue(v, colName) {
  if (v == null) return '';
  if (typeof v !== 'object') return v;

  // Domain-specific formatting for complex nested fields.
  if (colName && typeof v === 'object' && !Array.isArray(v)) {
    const leaf = String(colName).split('.').pop().toLowerCase();
    if (leaf === 'eventdetail' || leaf === 'eventdetails') {
      return formatEventDetail(v);
    }
  }

  if (Array.isArray(v)) {
    if (v.length === 0) return '';
    // Arrays of primitives → comma-joined (e.g. tags, scalar lookups)
    if (v.every((x) => x == null || typeof x !== 'object')) return v.join(', ');
    // Arrays of objects — extract meaningful scalar values instead of JSON.
    // Find keys that appear in the first item, excluding _id and __v.
    const first = v.find((x) => x && typeof x === 'object') || {};
    const candidateKeys = Object.keys(first).filter((k) => k !== '_id' && k !== '__v');
    if (candidateKeys.length === 1) {
      // Single-value objects (typical hoisted lookups): show all values joined.
      const k = candidateKeys[0];
      return v.map((obj) => (obj && obj[k] != null ? obj[k] : '')).filter(Boolean).join(', ');
    }
    if (candidateKeys.length > 1) {
      // Multi-key objects: show a compact summary — avoids a raw JSON blob.
      return `[${v.length} item${v.length === 1 ? '' : 's'}]`;
    }
    return JSON.stringify(v);
  }
  const keys = Object.keys(v);
  if (keys.length === 1) {
    const inner = v[keys[0]];
    if (inner == null || typeof inner !== 'object') return inner;
  }
  return JSON.stringify(v);
}

/**
 * Same as displayValue but always coerces to a string. Use for keys / headers
 * where downstream code expects a String.
 */
export function displayString(v) {
  const out = displayValue(v);
  return out == null ? '' : String(out);
}
