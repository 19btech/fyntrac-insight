/**
 * Chart-agnostic data transforms driven by chartConfig. Applied in ChartRenderer
 * before axis inference / rendering, so sort, top-N and series breakout work for
 * every chart type without per-chart code.
 */

/** Sort rows by `{ field, dir }` (numeric-aware). No-op when unset. */
export function applySort(data, sort) {
  if (!Array.isArray(data) || !sort || !sort.field) return data;
  const { field, dir = 'desc' } = sort;
  const mult = dir === 'asc' ? 1 : -1;
  return [...data].sort((a, b) => {
    const av = a?.[field];
    const bv = b?.[field];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const an = typeof av === 'number' ? av : Number(av);
    const bn = typeof bv === 'number' ? bv : Number(bv);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * mult;
    return String(av).localeCompare(String(bv)) * mult;
  });
}

/** Keep only the first N rows (apply after sort). No-op when unset / <= 0. */
export function applyTopN(data, topN) {
  if (!Array.isArray(data)) return data;
  const n = parseInt(topN, 10);
  if (!n || n <= 0) return data;
  return data.slice(0, n);
}

/**
 * Series breakout. Pivots long-form rows `[xField, seriesField, valueField]`
 * into one row per X with a numeric column per distinct series value, summing
 * collisions. Returns `{ data, yFields }` where `yFields` is the list of series
 * columns to plot (so existing multi-series rendering handles it).
 *
 * Returns `{ data, yFields: null }` when not applicable (caller keeps its data).
 */
export function applySeriesPivot(data, { xField, seriesField, valueField }) {
  if (!Array.isArray(data) || !seriesField || !xField || !valueField) {
    return { data, yFields: null };
  }
  const byX = new Map();
  const order = []; // preserve X appearance order
  const seriesVals = [];
  for (const row of data) {
    if (!row) continue;
    const xv = row[xField];
    const key = String(xv);
    if (!byX.has(key)) { byX.set(key, { [xField]: xv }); order.push(key); }
    const sKey = row[seriesField] == null ? '—' : String(row[seriesField]);
    const n = Number(row[valueField]);
    byX.get(key)[sKey] = (byX.get(key)[sKey] ?? 0) + (Number.isNaN(n) ? 0 : n);
    if (!seriesVals.includes(sKey)) seriesVals.push(sKey);
  }
  return { data: order.map((k) => byX.get(k)), yFields: seriesVals };
}

/**
 * Apply the full transform chain for a chart. `inferredX` is the resolved X
 * field (so series pivot knows the dimension). Returns the transformed data and
 * an optional `yFieldsOverride` (series columns) the renderer should plot.
 */
export function transformForViz(data, config = {}, inferredX, inferredY = []) {
  let out = data;
  out = applySort(out, config.sort);
  out = applyTopN(out, config.topN);

  let yFieldsOverride = null;
  if (config.series && inferredX) {
    const valueField = (Array.isArray(inferredY) && inferredY[0]) || config.valueField;
    if (valueField && config.series !== inferredX) {
      const piv = applySeriesPivot(out, { xField: inferredX, seriesField: config.series, valueField });
      if (piv.yFields && piv.yFields.length) { out = piv.data; yFieldsOverride = piv.yFields; }
    }
  }
  return { data: out, yFieldsOverride };
}
