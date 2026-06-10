/**
 * Field-role config is stored PER chart type (under `config.byType[chartType]`)
 * so configuring fields for one type (e.g. removing X on a bar) never affects
 * another (e.g. pie). Display + format options remain shared across types.
 *
 * Backward compatible: when a type has no per-type entry, the legacy top-level
 * fields are used as the fallback, so existing saved reports keep working.
 */
const FIELD_KEYS = [
  'xField', 'yFields', 'series', 'sort', 'topN',
  'dimField', 'actualField', 'budgetField', 'goodWhen',
  'rowField', 'columnField', 'valueField', 'agg',
];

export function isFieldKey(k) {
  return FIELD_KEYS.includes(k);
}

/** Effective field config for a chart type (per-type override, else legacy top-level). */
export function typeFields(config = {}, chartType) {
  const t = (config.byType && config.byType[chartType]) || {};
  const out = {};
  for (const k of FIELD_KEYS) out[k] = t[k] !== undefined ? t[k] : config[k];
  return out;
}

/** Merge a config patch — field keys land under `byType[chartType]`, the rest top-level. */
export function applyConfigPatch(config = {}, chartType, patch = {}) {
  const fieldPatch = {};
  const topPatch = {};
  for (const [k, v] of Object.entries(patch)) {
    if (isFieldKey(k)) fieldPatch[k] = v;
    else topPatch[k] = v;
  }
  let next = { ...config, ...topPatch };
  if (Object.keys(fieldPatch).length && chartType) {
    const byType = { ...(next.byType || {}) };
    byType[chartType] = { ...(byType[chartType] || {}), ...fieldPatch };
    next = { ...next, byType };
  }
  return next;
}
