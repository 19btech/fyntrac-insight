import React from 'react';
import { LineChart as XLineChart } from '@mui/x-charts/LineChart';
import { CHART_COLORS, CHART_HEIGHT } from './_chartColors';

export default function AreaChart({ data = [], xField, yFields = [], height }) {
  if (!data.length || !xField || !yFields.length) return null;
  const series = yFields.map((field, i) => ({
    dataKey: field,
    label: field,
    color: CHART_COLORS[i % CHART_COLORS.length],
    showMark: false,
    area: true,
    curve: 'monotoneX',
  }));
  return (
    <XLineChart
      dataset={data}
      xAxis={[{ dataKey: xField, scaleType: 'point', tickLabelStyle: { fontSize: 8, fill: '#64748b' } }]}
      yAxis={[{ tickLabelStyle: { fontSize: 10, fill: '#64748b' } }]}
      series={series}
      height={height || CHART_HEIGHT}
      margin={{ top: 16, right: 72, bottom: 32, left: 56 }}
      grid={{ horizontal: true }}
      slotProps={{ legend: { labelStyle: { fontSize: 11 } } }}
      sx={{ '& .MuiAreaElement-root': { fillOpacity: 0.2 } }}
    />
  );
}
