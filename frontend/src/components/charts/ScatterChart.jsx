import React from 'react';
import { ScatterChart as XScatterChart } from '@mui/x-charts/ScatterChart';
import { CHART_COLORS, CHART_HEIGHT } from './_chartColors';

export default function ScatterChart({ data = [], xField, yFields = [], height }) {
  const yField = yFields[0];
  if (!data.length || !xField || !yField) return null;

  const points = data
    .map((row, i) => {
      const x = Number(row[xField]);
      const y = Number(row[yField]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { id: i, x, y };
    })
    .filter(Boolean);

  return (
    <XScatterChart
      series={[{
        data: points,
        label: `${yField} vs ${xField}`,
        color: CHART_COLORS[0],
      }]}
      xAxis={[{ label: xField, tickLabelStyle: { fontSize: 10, fill: '#64748b' }, labelStyle: { fontSize: 11 } }]}
      yAxis={[{ label: yField, tickLabelStyle: { fontSize: 10, fill: '#64748b' }, labelStyle: { fontSize: 11 } }]}
      height={height || CHART_HEIGHT}
      margin={{ top: 16, right: 16, bottom: 48, left: 64 }}
      grid={{ horizontal: true, vertical: true }}
      slotProps={{ legend: { labelStyle: { fontSize: 11 } } }}
    />
  );
}
