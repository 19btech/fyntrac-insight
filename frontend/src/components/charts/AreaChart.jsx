import React from 'react';
import { LineChart as XLineChart } from '@mui/x-charts/LineChart';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import { CHART_HEIGHT } from './_chartColors';
import { paletteColors, legendSlot, chartMargins } from './_displayHelpers';
import LineDataLabels from './LineDataLabels';
import AxisTitleFrame from './AxisTitleFrame';
import { axisValueFormatter, X_TICK_LABEL_STYLE } from './_axis';

export default function AreaChart({
  data = [], xField, yFields = [], height,
  stacked, legend, axisTitles = {}, palette, smooth = true, referenceLines = [], dataLabels,
}) {
  if (!data.length || !xField || !yFields.length) return null;
  const colors = paletteColors(palette);
  const stackId = stacked && stacked !== 'none' ? 'total' : undefined;
  const series = yFields.map((field, i) => ({
    dataKey: field,
    label: field,
    color: colors[i % colors.length],
    showMark: false,
    area: true,
    curve: smooth ? 'monotoneX' : 'linear',
    ...(stackId ? { stack: stackId, ...(stacked === 'normalized' ? { stackOffset: 'expand' } : {}) } : {}),
  }));
  const fullH = height || CHART_HEIGHT;
  const innerH = fullH - (axisTitles.x ? 20 : 0);
  return (
    <AxisTitleFrame axisTitles={axisTitles} height={fullH} innerHeight={innerH}>
      <XLineChart
        dataset={data}
        xAxis={[{ dataKey: xField, scaleType: 'point', valueFormatter: axisValueFormatter(xField), tickLabelStyle: X_TICK_LABEL_STYLE }]}
        yAxis={[{ tickLabelStyle: { fontSize: 10, fill: '#64748b' } }]}
        series={series}
        height={innerH}
        margin={chartMargins({ legend })}
        grid={{ horizontal: true }}
        slotProps={{ legend: legendSlot(legend) }}
        sx={{ '& .MuiAreaElement-root': { fillOpacity: 0.2 } }}
      >
        {referenceLines.map((rl, i) => (
          <ChartsReferenceLine key={i} y={Number(rl.value)} label={rl.label || ''} lineStyle={{ stroke: '#94a3b8', strokeDasharray: '4 4' }} labelStyle={{ fontSize: 10 }} />
        ))}
        {dataLabels && <LineDataLabels rows={data} xField={xField} yFields={yFields} />}
      </XLineChart>
    </AxisTitleFrame>
  );
}
