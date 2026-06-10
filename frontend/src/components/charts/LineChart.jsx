import React from 'react';
import { LineChart as XLineChart } from '@mui/x-charts/LineChart';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import { CHART_HEIGHT } from './_chartColors';
import { paletteColors, legendSlot, chartMargins } from './_displayHelpers';
import LineDataLabels from './LineDataLabels';
import AxisTitleFrame from './AxisTitleFrame';
import { axisValueFormatter, X_TICK_LABEL_STYLE } from './_axis';

export default function LineChart({
  data = [], xField, yFields = [], goalLine, height,
  dualAxis, legend, dataLabels, axisTitles = {}, palette, smooth = true, referenceLines = [],
}) {
  if (!data.length || !xField || !yFields.length) return null;
  const colors = paletteColors(palette);
  const series = yFields.map((field, i) => ({
    dataKey: field,
    label: field,
    color: colors[i % colors.length],
    showMark: false,
    curve: smooth ? 'monotoneX' : 'linear',
    ...(dataLabels ? { } : {}),
    ...(dualAxis && i > 0 ? { yAxisId: 'right' } : {}),
  }));

  const yAxis = dualAxis
    ? [{ id: 'left', tickLabelStyle: { fontSize: 10, fill: '#64748b' } },
       { id: 'right', position: 'right', tickLabelStyle: { fontSize: 10, fill: '#64748b' } }]
    : [{ tickLabelStyle: { fontSize: 10, fill: '#64748b' } }];

  const fullH = height || CHART_HEIGHT;
  const innerH = fullH - (axisTitles.x ? 20 : 0);

  return (
    <AxisTitleFrame axisTitles={axisTitles} height={fullH} innerHeight={innerH}>
      <XLineChart
        dataset={data}
        xAxis={[{ dataKey: xField, scaleType: 'point', valueFormatter: axisValueFormatter(xField), tickLabelStyle: X_TICK_LABEL_STYLE }]}
        yAxis={yAxis}
        series={series}
        height={innerH}
        margin={chartMargins({ legend, dualAxis })}
        grid={{ horizontal: true }}
        slotProps={{ legend: legendSlot(legend) }}
      >
        {goalLine !== undefined && (
          <ChartsReferenceLine y={goalLine} label="Goal" lineStyle={{ stroke: '#ef4444', strokeDasharray: '4 4' }} labelStyle={{ fontSize: 11 }} />
        )}
        {referenceLines.map((rl, i) => (
          <ChartsReferenceLine key={i} y={Number(rl.value)} label={rl.label || ''} lineStyle={{ stroke: '#94a3b8', strokeDasharray: '4 4' }} labelStyle={{ fontSize: 10 }} />
        ))}
        {dataLabels && <LineDataLabels rows={data} xField={xField} yFields={yFields} />}
      </XLineChart>
    </AxisTitleFrame>
  );
}
