import React from 'react';
import { LineChart as XLineChart } from '@mui/x-charts/LineChart';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import { CHART_COLORS, CHART_HEIGHT } from './_chartColors';

export default function LineChart({ data = [], xField, yFields = [], goalLine, height }) {
  if (!data.length || !xField || !yFields.length) return null;
  const series = yFields.map((field, i) => ({
    dataKey: field,
    label: field,
    color: CHART_COLORS[i % CHART_COLORS.length],
    showMark: false,
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
    >
      {goalLine !== undefined && (
        <ChartsReferenceLine
          y={goalLine}
          label="Goal"
          lineStyle={{ stroke: '#ef4444', strokeDasharray: '4 4' }}
          labelStyle={{ fontSize: 11 }}
        />
      )}
    </XLineChart>
  );
}
