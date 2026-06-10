import React from 'react';
import { ScatterChart as XScatterChart } from '@mui/x-charts/ScatterChart';
import { CHART_HEIGHT } from './_chartColors';
import { paletteColors, legendSlot } from './_displayHelpers';
import { axisValueFormatter, X_TICK_LABEL_STYLE, X_AXIS_BOTTOM_MARGIN } from './_axis';

export default function ScatterChart({ data = [], xField, yFields = [], height, palette, legend, axisTitles = {} }) {
  const yField = yFields[0];
  if (!data.length || !xField || !yField) return null;
  const colors = paletteColors(palette);

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
        color: colors[0],
      }]}
      xAxis={[{ label: axisTitles.x || xField, valueFormatter: axisValueFormatter(xField), tickLabelStyle: X_TICK_LABEL_STYLE, labelStyle: { fontSize: 11 } }]}
      yAxis={[{ label: axisTitles.y || yField, tickLabelStyle: { fontSize: 10, fill: '#64748b' }, labelStyle: { fontSize: 11 } }]}
      height={height || CHART_HEIGHT}
      margin={{ top: 16, right: 16, bottom: X_AXIS_BOTTOM_MARGIN, left: 64 }}
      grid={{ horizontal: true, vertical: true }}
      slotProps={{ legend: legendSlot(legend) }}
    />
  );
}
