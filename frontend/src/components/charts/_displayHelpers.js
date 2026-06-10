import { CHART_COLORS } from './_chartColors';
import { X_AXIS_BOTTOM_MARGIN } from './_axis';

/**
 * Color palettes — all use soft TINT (pastel) tones rather than solid/saturated
 * colors, so charts stay light and on-brand.
 */
const PALETTES = {
  default: CHART_COLORS,
  cool: ['#93c5fd', '#67e8f9', '#5eead4', '#a5b4fc', '#c4b5fd', '#7dd3fc', '#bfdbfe'],
  warm: ['#fdba74', '#fca5a5', '#fcd34d', '#f9a8d4', '#fda4af', '#fbcfe8', '#fde68a'],
  vibrant: ['#a5b4fc', '#f9a8d4', '#6ee7b7', '#fcd34d', '#fca5a5', '#67e8f9', '#c4b5fd'],
  mono: ['#cbd5e1', '#94a3b8', '#e2e8f0', '#a8b3c4', '#b8c2d0', '#d8e0ea', '#9aa7b8'],
};

export function paletteColors(key) {
  return PALETTES[key] || CHART_COLORS;
}

/**
 * Compute chart margins so nothing overlaps — reserves room for the legend
 * (per position) and a right Y axis when dual-axis is on. Axis titles are
 * rendered outside the SVG (AxisTitleFrame), so they need no margin here.
 */
export function chartMargins({ legend, dualAxis } = {}) {
  let top = 16;
  let right = 16;
  let bottom = X_AXIS_BOTTOM_MARGIN; // room for angled tick labels
  let left = 56;

  if (dualAxis) right += 44;

  if (legend?.show !== false) {
    const pos = legend?.position || 'bottom';
    if (pos === 'bottom') bottom += 44;
    else if (pos === 'top') top += 40;
    else if (pos === 'right') right += 104;
  }
  return { top, right, bottom, left };
}

/** Compact, readable number formatting for chart data labels. */
export function formatCompact(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  if (abs >= 1e4) return n.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Map a `legend` config ({ show, position }) to x-charts legend slotProps.
 */
export function legendSlot(legend) {
  if (legend?.show === false) return { hidden: true };
  const pos = legend?.position || 'bottom';
  const POS = {
    top: { vertical: 'top', horizontal: 'middle' },
    bottom: { vertical: 'bottom', horizontal: 'middle' },
    right: { vertical: 'middle', horizontal: 'right' },
  };
  return {
    hidden: false,
    direction: pos === 'right' ? 'column' : 'row',
    position: POS[pos] || POS.bottom,
    labelStyle: { fontSize: 11 },
  };
}

/** Per-series x-charts `stack`/`stackOffset` for a stacking mode. */
export function stackProps(stacked) {
  if (stacked === 'stacked') return { stack: 'total' };
  if (stacked === 'normalized') return { stack: 'total', stackOffset: 'expand' };
  return {};
}
