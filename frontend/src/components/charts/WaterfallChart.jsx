import React, { useMemo } from 'react';
import { BarChart as XBarChart } from '@mui/x-charts/BarChart';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import { CHART_HEIGHT } from './_chartColors';

/**
 * Waterfall chart: shows running cumulative total with positive/negative deltas.
 * Encoded as stacked bars: a transparent base + a colored delta sized by |value|.
 * Colors per category come from the dataset (`__color`) so we can highlight
 * positives, negatives, and totals individually.
 */
export default function WaterfallChart({ data = [], xField, yFields = [], onPointClick, height }) {
  const valueField = yFields[0];

  const dataset = useMemo(() => {
    if (!xField || !valueField) return [];
    let cumulative = 0;
    return data.map((row, idx) => {
      const v = Number(row[valueField]) || 0;
      const start = cumulative;
      cumulative += v;
      const isTotal = idx === data.length - 1 && row.__total;
      const delta = Math.abs(v);
      return {
        [xField]: row[xField],
        base: isTotal ? 0 : (v >= 0 ? start : cumulative),
        // Split delta into three exclusive buckets so each bar group is
        // a single-color series (avoids falling back to the default theme
        // palette which renders the bars black/dark).
        deltaPos: !isTotal && v >= 0 ? delta : 0,
        deltaNeg: !isTotal && v < 0 ? delta : 0,
        deltaTotal: isTotal ? delta : 0,
        raw: v,
        cumulative,
        __isTotal: !!isTotal,
      };
    });
  }, [data, xField, valueField]);

  if (!dataset.length || !xField || !valueField) return null;

  const handleItemClick = (_event, item) => {
    const row = dataset[item?.dataIndex];
    if (row && onPointClick) onPointClick(row);
  };

  const fmt = (_v, ctx) => {
    const row = dataset[ctx?.dataIndex];
    return row ? row.raw.toLocaleString() : '';
  };

  return (
    <XBarChart
      dataset={dataset}
      xAxis={[{ dataKey: xField, scaleType: 'band', tickLabelStyle: { fontSize: 11, fill: '#64748b' } }]}
      yAxis={[{ tickLabelStyle: { fontSize: 11, fill: '#64748b' } }]}
      series={[
        { dataKey: 'base', stack: 'w', color: 'transparent', label: ' ' },
        { dataKey: 'deltaPos', stack: 'w', color: '#86efac', label: 'Increase', valueFormatter: fmt },
        { dataKey: 'deltaNeg', stack: 'w', color: '#fca5a5', label: 'Decrease', valueFormatter: fmt },
        { dataKey: 'deltaTotal', stack: 'w', color: '#a5b4fc', label: 'Total', valueFormatter: fmt },
      ]}
      height={height || CHART_HEIGHT}
      margin={{ top: 16, right: 16, bottom: 32, left: 56 }}
      grid={{ horizontal: true }}
      borderRadius={4}
      onItemClick={handleItemClick}
      slotProps={{ legend: { labelStyle: { fontSize: 11 } } }}
    >
      <ChartsReferenceLine y={0} lineStyle={{ stroke: '#cbd5e1' }} />
    </XBarChart>
  );
}
