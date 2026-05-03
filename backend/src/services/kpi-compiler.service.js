/**
 * Compile a structured KPI `definition` into a MongoDB aggregation pipeline that
 * returns a single document `{ value }`.
 *
 * definition = {
 *   filters:     [{...}]                                                // top-level filters applied to BOTH sides
 *   numerator:   { agg: '$sum'|'$avg'|'$count'|'$min'|'$max', field, filters: [] },
 *   denominator: { agg, field, filters } | null,
 *   timeField, periodMatch (optional $match injected as the first stage)
 * }
 */
const { compileSavedFilter } = require('./saved-filter.service');

// Looks like an ISO date / datetime: 2025-03-31 or 2025-03-31T...
const ISO_DATE_RX = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
// YYYY-MM (e.g. accountingPeriodId typed as "2025-04")
const YYYY_MM_RX = /^(\d{4})-(\d{2})$/;

/**
 * Coerce a free-text filter value to the right BSON type. Numeric strings
 * become numbers, ISO date strings become `Date`s, and `YYYY-MM` becomes
 * the YYYYMM integer used by `accountingPeriodId`-style columns.
 * Anything else is returned as-is. (Operator `$regex` is handled separately upstream.)
 */
function coerceValue(raw) {
  if (raw == null || raw === '') return raw;
  if (typeof raw !== 'string') return raw;
  if (ISO_DATE_RX.test(raw)) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }
  const ymm = raw.match(YYYY_MM_RX);
  if (ymm) return parseInt(ymm[1] + ymm[2], 10);
  const n = parseFloat(raw);
  if (!isNaN(n) && String(n) === raw.trim()) return n;
  return raw;
}

function startOfDayUTC(d) { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; }
function endOfDayUTC(d) { const x = new Date(d); x.setUTCHours(23, 59, 59, 999); return x; }

function buildMatch(filters) {
  const ands = [];
  for (const f of filters || []) {
    if (f && f.kind) {
      const m = compileSavedFilter(f);
      if (Object.keys(m).length) ands.push(m);
      continue;
    }
    if (!f || !f.field || !f.operator) continue;
    if (f.operator === '$exists') ands.push({ [f.field]: { $exists: true } });
    else if (f.operator === '$in' || f.operator === '$nin') {
      const vals = (Array.isArray(f.value) ? f.value : String(f.value || '').split(','))
        .map((v) => (typeof v === 'string' ? v.trim() : v))
        .filter((v) => v !== '' && v != null)
        .map(coerceValue);
      ands.push({ [f.field]: { [f.operator]: vals } });
    } else if (f.operator === '$regex') {
      ands.push({ [f.field]: { $regex: f.value, $options: 'i' } });
    } else if (f.operator === '$eq'
        && typeof f.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.value)) {
      // Calendar-day equality: match the whole day instead of the exact midnight
      // instant. Fields are normalized to BSON Date by buildExpansionStages,
      // so a simple range works regardless of original storage form.
      const d = new Date(f.value);
      ands.push({ [f.field]: { $gte: startOfDayUTC(d), $lte: endOfDayUTC(d) } });
    } else {
      ands.push({ [f.field]: { [f.operator]: coerceValue(f.value) } });
    }
  }
  if (ands.length === 0) return null;
  if (ands.length === 1) return ands[0];
  return { $and: ands };
}

function aggExpr(agg, field) {
  if (agg === '$count') return { $sum: 1 };
  return { [agg]: `$${field}` };
}

function compileSide(side, periodMatch, topMatch) {
  const stages = [];
  const m = buildMatch(side.filters);
  if (periodMatch) stages.push({ $match: periodMatch });
  if (topMatch) stages.push({ $match: topMatch });
  if (m) stages.push({ $match: m });
  stages.push({ $group: { _id: null, value: aggExpr(side.agg || '$sum', side.field || '') } });
  return stages;
}

/**
 * Returns a pipeline producing `{ value }`. If denominator is set, uses $facet
 * to compute both sides then projects numerator/denominator as a ratio.
 */
function compileKpi(definition, periodMatch = null) {
  if (!definition || !definition.numerator) return [];
  const num = definition.numerator;
  const den = definition.denominator;
  const topMatch = buildMatch(definition.filters);
  // Skip denominator if it's absent, has no aggregation, or (for non-count
  // aggregations) has no target field — avoids `{ $sum: '$' }` errors.
  if (!den || !den.agg || (den.agg !== '$count' && !den.field)) {
    return compileSide(num, periodMatch, topMatch);
  }
  return [
    {
      $facet: {
        numerator: compileSide(num, periodMatch, topMatch),
        denominator: compileSide(den, periodMatch, topMatch),
      },
    },
    {
      $project: {
        value: {
          $cond: [
            { $gt: [{ $ifNull: [{ $arrayElemAt: ['$denominator.value', 0] }, 0] }, 0] },
            {
              $divide: [
                { $ifNull: [{ $arrayElemAt: ['$numerator.value', 0] }, 0] },
                { $arrayElemAt: ['$denominator.value', 0] },
              ],
            },
            null,
          ],
        },
      },
    },
  ];
}

/**
 * Build a $match for a comparison window, given a primary (current) period and
 * a comparison mode (lastPeriod / lastYear). Periods are expressed via the same
 * date saved-filter shape: { kind:'date', field, mode:'period'|'rolling'|'between', ... }
 */
function comparisonMatch(timeFilter, comparison) {
  if (!timeFilter || comparison === 'none' || !comparison) return null;
  // Rolling window N days → previous N days
  if (timeFilter.mode === 'rolling' && timeFilter.windowDays) {
    const w = Number(timeFilter.windowDays);
    const now = new Date();
    if (comparison === 'lastPeriod') {
      const to = new Date(now.getTime() - w * 86400000);
      const from = new Date(to.getTime() - w * 86400000);
      return { [timeFilter.field]: { $gte: from, $lte: to } };
    }
    if (comparison === 'lastYear') {
      const to = new Date(now);
      to.setFullYear(to.getFullYear() - 1);
      const from = new Date(to.getTime() - w * 86400000);
      return { [timeFilter.field]: { $gte: from, $lte: to } };
    }
  }
  return null;
}

module.exports = { compileKpi, buildMatch, compileSide, comparisonMatch, coerceValue };
