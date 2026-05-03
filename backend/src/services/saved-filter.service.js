/**
 * Compile a "Saved Filter" definition into a MongoDB $match expression.
 *
 * Definition shapes:
 *
 *  Date:
 *   { kind: 'date', field, mode: 'rolling', windowDays }      // last N days
 *   { kind: 'date', field, mode: 'period', period: 'thisMonth'|'lastMonth'|'thisQuarter'|'lastQuarter'|'thisYear'|'lastYear'|'ytd' }
 *   { kind: 'date', field, mode: 'between', from, to }        // ISO date strings
 *
 *  Category:
 *   { kind: 'category', field, op: 'in'|'notIn', values: [] }
 *
 *  Numeric:
 *   { kind: 'numeric', field, op: '$gt'|'$gte'|'$lt'|'$lte'|'$eq'|'between', value, value2? }
 */

function startOf(d) { d.setHours(0, 0, 0, 0); return d; }
function endOf(d) { d.setHours(23, 59, 59, 999); return d; }

function dateRangeForPeriod(period, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = Math.floor(m / 3);
  if (period === 'thisMonth') return [startOf(new Date(y, m, 1)), endOf(new Date(y, m + 1, 0))];
  if (period === 'lastMonth') return [startOf(new Date(y, m - 1, 1)), endOf(new Date(y, m, 0))];
  if (period === 'thisQuarter') return [startOf(new Date(y, q * 3, 1)), endOf(new Date(y, q * 3 + 3, 0))];
  if (period === 'lastQuarter') return [startOf(new Date(y, q * 3 - 3, 1)), endOf(new Date(y, q * 3, 0))];
  if (period === 'thisYear') return [startOf(new Date(y, 0, 1)), endOf(new Date(y, 11, 31))];
  if (period === 'lastYear') return [startOf(new Date(y - 1, 0, 1)), endOf(new Date(y - 1, 11, 31))];
  if (period === 'ytd') return [startOf(new Date(y, 0, 1)), endOf(now)];
  return [null, null];
}

function compileSavedFilter(def) {
  if (!def || !def.kind) return {};
  if (def.kind === 'date') {
    if (!def.field) return {};
    let from, to;
    if (def.mode === 'rolling' && def.windowDays > 0) {
      const now = new Date();
      from = new Date(now.getTime() - Number(def.windowDays) * 86400000);
      to = now;
    } else if (def.mode === 'period') {
      [from, to] = dateRangeForPeriod(def.period);
    } else if (def.mode === 'between') {
      from = def.from ? new Date(def.from) : null;
      to = def.to ? new Date(def.to) : null;
    }
    const expr = {};
    if (from) expr.$gte = from;
    if (to) expr.$lte = to;
    return Object.keys(expr).length ? { [def.field]: expr } : {};
  }
  if (def.kind === 'category') {
    if (!def.field || !Array.isArray(def.values) || !def.values.length) return {};
    const op = def.op === 'notIn' ? '$nin' : '$in';
    return { [def.field]: { [op]: def.values } };
  }
  if (def.kind === 'numeric') {
    if (!def.field || !def.op) return {};
    if (def.op === 'between') {
      const expr = {};
      if (def.value != null && def.value !== '') expr.$gte = Number(def.value);
      if (def.value2 != null && def.value2 !== '') expr.$lte = Number(def.value2);
      return Object.keys(expr).length ? { [def.field]: expr } : {};
    }
    return { [def.field]: { [def.op]: Number(def.value) } };
  }
  return {};
}

function describeSavedFilter(def) {
  if (!def) return '';
  if (def.kind === 'date') {
    if (def.mode === 'rolling') return `${def.field}: last ${def.windowDays} days`;
    if (def.mode === 'period') return `${def.field}: ${def.period}`;
    if (def.mode === 'between') return `${def.field}: ${def.from || '…'} → ${def.to || '…'}`;
  }
  if (def.kind === 'category') {
    const verb = def.op === 'notIn' ? 'not in' : 'in';
    return `${def.field} ${verb} [${(def.values || []).join(', ')}]`;
  }
  if (def.kind === 'numeric') {
    if (def.op === 'between') return `${def.field} between ${def.value}–${def.value2}`;
    const sym = { $gt: '>', $gte: '≥', $lt: '<', $lte: '≤', $eq: '=' }[def.op] || def.op;
    return `${def.field} ${sym} ${def.value}`;
  }
  return '';
}

module.exports = { compileSavedFilter, describeSavedFilter, dateRangeForPeriod };
