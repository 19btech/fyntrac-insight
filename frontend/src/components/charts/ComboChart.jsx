import React from 'react';
import { ResponsiveChartContainer } from '@mui/x-charts/ResponsiveChartContainer';
import { BarPlot } from '@mui/x-charts/BarChart';
import { LinePlot, MarkPlot } from '@mui/x-charts/LineChart';
import { ChartsXAxis } from '@mui/x-charts/ChartsXAxis';
import { ChartsYAxis } from '@mui/x-charts/ChartsYAxis';
import { ChartsGrid } from '@mui/x-charts/ChartsGrid';
import { ChartsTooltip } from '@mui/x-charts/ChartsTooltip';
import { ChartsLegend } from '@mui/x-charts/ChartsLegend';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import { Box } from '@mui/material';
import { CHART_HEIGHT } from './_chartColors';
import { paletteColors } from './_displayHelpers';
import AxisTitleFrame from './AxisTitleFrame';
import { axisValueFormatter, X_TICK_LABEL_STYLE, X_AXIS_BOTTOM_MARGIN } from './_axis';

export default function ComboChart({
  data = [], xField, yFields = [], height,
  legend, axisTitles = {}, palette, referenceLines = [],
}) {
  if (!data.length || !xField || !yFields.length) return null;
  const colors = paletteColors(palette);

  const series = yFields.map((field, i) => {
    const isFirst = i === 0;
    return {
      type: isFirst ? 'bar' : 'line',
      dataKey: field,
      label: field,
      color: colors[i % colors.length],
      ...(isFirst ? {} : { showMark: false, curve: 'monotoneX' }),
    };
  });

  const fullH = height || CHART_HEIGHT;
  const innerH = fullH - (axisTitles.x ? 20 : 0);
  return (
    <AxisTitleFrame axisTitles={axisTitles} height={fullH} innerHeight={innerH}>
    <Box sx={{ width: '100%', height: innerH }}>
      <ResponsiveChartContainer
        dataset={data}
        series={series}
        xAxis={[{ id: 'x', dataKey: xField, scaleType: 'band', valueFormatter: axisValueFormatter(xField), tickLabelStyle: X_TICK_LABEL_STYLE }]}
        yAxis={[{ id: 'y', tickLabelStyle: { fontSize: 10, fill: '#64748b' } }]}
        margin={{ top: 24, right: 16, bottom: X_AXIS_BOTTOM_MARGIN, left: 56 }}
      >
        <ChartsGrid horizontal />
        <BarPlot borderRadius={4} />
        <LinePlot />
        <MarkPlot />
        <ChartsXAxis axisId="x" />
        <ChartsYAxis axisId="y" />
        {referenceLines.map((rl, i) => (
          <ChartsReferenceLine key={i} y={Number(rl.value)} label={rl.label || ''} lineStyle={{ stroke: '#94a3b8', strokeDasharray: '4 4' }} labelStyle={{ fontSize: 10 }} />
        ))}
        {legend?.show !== false && <ChartsLegend slotProps={{ legend: { labelStyle: { fontSize: 11 } } }} />}
        <ChartsTooltip />
      </ResponsiveChartContainer>
    </Box>
    </AxisTitleFrame>
  );
}
