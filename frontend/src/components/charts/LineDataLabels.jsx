import React from 'react';
import { useXScale, useYScale } from '@mui/x-charts/hooks/useScale';

// Beyond this many points labels overlap into noise — skip rendering then.
const MAX_LABELS = 80;

function fmtLabel(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  if (abs >= 1e4) return n.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Renders value labels at each line/area point. Used as a child of x-charts'
 * LineChart so it can read the chart's X/Y scales via hooks. x-charts has no
 * native line data labels, so this is our custom overlay layer.
 */
export default function LineDataLabels({ rows = [], xField, yFields = [] }) {
  const xScale = useXScale();
  const yScale = useYScale();
  // Skip when there'd be too many labels (points × series) — they'd overlap.
  const total = rows.length * Math.max(1, yFields.length);
  if (!xScale || !yScale || !xField || rows.length === 0 || total > MAX_LABELS) return null;

  const nodes = [];
  yFields.forEach((field, si) => {
    rows.forEach((row, i) => {
      const yv = Number(row?.[field]);
      if (!Number.isFinite(yv)) return;
      const cx = xScale(row[xField]);
      const cy = yScale(yv);
      if (cx == null || cy == null || Number.isNaN(cx) || Number.isNaN(cy)) return;
      nodes.push(
        <text
          key={`${si}-${i}`}
          x={cx}
          y={cy - 7}
          textAnchor="middle"
          fontSize={10}
          fontWeight={600}
          fill="#334155"
          stroke="#fff"
          strokeWidth={3}
          paintOrder="stroke"
          style={{ pointerEvents: 'none' }}
        >
          {fmtLabel(yv)}
        </text>
      );
    });
  });
  return <g>{nodes}</g>;
}
