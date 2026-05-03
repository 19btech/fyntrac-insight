import React from 'react';
import { BarChart as XBarChart } from '@mui/x-charts/BarChart';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import useFilterStore from '../../store/filterStore';
import { CHART_COLORS, CHART_HEIGHT } from './_chartColors';

export default function BarChart({ data = [], xField, yFields = [], goalLine, onPointClick, height }) {
  const setFilter = useFilterStore((s) => s.setFilter);
  if (!data.length || !xField || !yFields.length) return null;

  const series = yFields.map((field, i) => ({
    dataKey: field,
    label: field,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const handleItemClick = (_event, item) => {
    const row = data[item?.dataIndex];
    if (!row) return;
    if (onPointClick) { onPointClick(row); return; }
    if (row[xField] != null && xField) setFilter(xField, row[xField]);
  };

  return (
    <XBarChart
      dataset={data}
      xAxis={[{ dataKey: xField, scaleType: 'band', tickLabelStyle: { fontSize: 10, fill: '#64748b' } }]}
      yAxis={[{ tickLabelStyle: { fontSize: 10, fill: '#64748b' } }]}
      series={series}
      height={height || CHART_HEIGHT}
      margin={{ top: 16, right: 16, bottom: 32, left: 56 }}
      grid={{ horizontal: true }}
      borderRadius={4}
      onItemClick={handleItemClick}
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
    </XBarChart>
  );
}
