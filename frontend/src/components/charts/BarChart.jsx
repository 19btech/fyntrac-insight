import React from 'react';
import { BarChart as XBarChart } from '@mui/x-charts/BarChart';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import useFilterStore from '../../store/filterStore';
import { CHART_HEIGHT } from './_chartColors';
import { paletteColors, legendSlot, stackProps, formatCompact, chartMargins } from './_displayHelpers';
import { axisValueFormatter, X_TICK_LABEL_STYLE } from './_axis';
import AxisTitleFrame from './AxisTitleFrame';

export default function BarChart({
  data = [], xField, yFields = [], goalLine, onPointClick, height,
  stacked, dualAxis, legend, dataLabels, axisTitles = {}, palette, referenceLines = [],
}) {
  const setFilter = useFilterStore((s) => s.setFilter);
  if (!data.length || !xField || !yFields.length) return null;

  const colors = paletteColors(palette);
  const stack = stackProps(stacked);
  const series = yFields.map((field, i) => ({
    dataKey: field,
    label: field,
    color: colors[i % colors.length],
    ...stack,
    // Dual axis: every measure after the first plots against the right Y axis.
    ...(dualAxis && i > 0 ? { yAxisId: 'right' } : {}),
  }));

  const yAxis = dualAxis
    ? [{ id: 'left', tickLabelStyle: { fontSize: 10, fill: '#64748b' } },
       { id: 'right', position: 'right', tickLabelStyle: { fontSize: 10, fill: '#64748b' } }]
    : [{ tickLabelStyle: { fontSize: 10, fill: '#64748b' } }];

  // Data labels only on single-measure bars — grouped (multi-series) bars are
  // too narrow and the labels collide.
  const showBarLabels = dataLabels && yFields.length === 1;
  const margin = chartMargins({ legend, dualAxis });
  const fullH = height || CHART_HEIGHT;
  const innerH = fullH - (axisTitles.x ? 20 : 0);

  const handleItemClick = (_event, item) => {
    const row = data[item?.dataIndex];
    if (!row) return;
    if (onPointClick) { onPointClick(row); return; }
    if (row[xField] != null && xField) setFilter(xField, row[xField]);
  };

  return (
    <AxisTitleFrame axisTitles={axisTitles} height={fullH} innerHeight={innerH}>
      <XBarChart
        dataset={data}
        xAxis={[{ dataKey: xField, scaleType: 'band', valueFormatter: axisValueFormatter(xField), tickLabelStyle: X_TICK_LABEL_STYLE }]}
        yAxis={yAxis}
        series={series}
        height={innerH}
        margin={margin}
        grid={{ horizontal: true }}
        borderRadius={4}
        barLabel={showBarLabels ? (item) => formatCompact(item.value) : undefined}
        onItemClick={handleItemClick}
        slotProps={{ legend: legendSlot(legend) }}
      >
        {goalLine !== undefined && (
          <ChartsReferenceLine y={goalLine} label="Goal" lineStyle={{ stroke: '#ef4444', strokeDasharray: '4 4' }} labelStyle={{ fontSize: 11 }} />
        )}
        {referenceLines.map((rl, i) => (
          <ChartsReferenceLine key={i} y={Number(rl.value)} label={rl.label || ''} lineStyle={{ stroke: '#94a3b8', strokeDasharray: '4 4' }} labelStyle={{ fontSize: 10 }} />
        ))}
      </XBarChart>
    </AxisTitleFrame>
  );
}
