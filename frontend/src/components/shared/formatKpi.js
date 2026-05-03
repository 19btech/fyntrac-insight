// Shared KPI value formatter. Single source of truth for the way we display
// numeric metric values across the Metrics page, dashboards, and any other
// surface that renders a KPI tile.
export default function formatKpi(v, format, legacyFmt, prefix, suffix) {
  if (v == null || isNaN(Number(v))) return '—';
  const n = Number(v);
  const f = format || { kind: legacyFmt || 'number', prefix, suffix };
  const decimals = f.decimals ?? (f.kind === 'percent' ? 1 : 0);
  let abs = Math.abs(n);
  let unit = '';
  if (f.compact) {
    if (abs >= 1e9) { abs /= 1e9; unit = 'B'; }
    else if (abs >= 1e6) { abs /= 1e6; unit = 'M'; }
    else if (abs >= 1e3) { abs /= 1e3; unit = 'K'; }
  }
  let body = abs.toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
  if (n < 0) body = f.negatives === 'parens' ? `(${body})` : `-${body}`;
  if (f.kind === 'currency') body = `${f.prefix || '$'}${body}${unit}${f.suffix || ''}`;
  else if (f.kind === 'percent') body = `${body}${unit}%${f.suffix || ''}`;
  else body = `${f.prefix || ''}${body}${unit}${f.suffix || ''}`;
  return body;
}
