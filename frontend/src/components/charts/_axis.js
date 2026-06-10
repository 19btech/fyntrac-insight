import { formatByColumn } from './_columnRules';

/**
 * x-axis tick/tooltip formatter. Applies domain column rules so e.g. an
 * accounting period `202202` renders as "2022-02", and — crucially — never
 * comma-formats a raw number (202202 stays "202202", not "202,202").
 */
export function axisValueFormatter(field) {
  return (value) => {
    const ruled = formatByColumn(field, value);
    if (ruled !== undefined && ruled !== '') return ruled;
    return value == null ? '' : String(value);
  };
}

// Angled, compact x-axis tick labels to reduce overlap on dense category axes.
export const X_TICK_LABEL_STYLE = { fontSize: 10, fill: '#64748b', angle: -35, textAnchor: 'end' };

// Extra bottom margin to give the angled labels room without clipping.
export const X_AXIS_BOTTOM_MARGIN = 64;
