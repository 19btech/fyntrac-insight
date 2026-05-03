import React from 'react';
import { ResponsiveChartContainer } from '@mui/x-charts/ResponsiveChartContainer';
import { BarPlot } from '@mui/x-charts/BarChart';
import { LinePlot, MarkPlot } from '@mui/x-charts/LineChart';
import { ChartsXAxis } from '@mui/x-charts/ChartsXAxis';
import { ChartsYAxis } from '@mui/x-charts/ChartsYAxis';
import { ChartsGrid } from '@mui/x-charts/ChartsGrid';
import { ChartsTooltip } from '@mui/x-charts/ChartsTooltip';
import { ChartsLegend } from '@mui/x-charts/ChartsLegend';
import { Box } from '@mui/material';
import { CHART_COLORS, CHART_HEIGHT } from './_chartColors';

export default function ComboChart({ data = [], xField, yFields = [], height }) {
  if (!data.length || !xField || !yFields.length) return null;

  const series = yFields.map((field, i) => {
    const isFirst = i === 0;
    return {
      type: isFirst ? 'bar' : 'line',
      dataKey: field,
      label: field,
      color: CHART_COLORS[i % CHART_COLORS.length],
      ...(isFirst ? {} : { showMark: false, curve: 'monotoneX' }),
    };
  });

  return (
    <Box sx={{ width: '100%', height: height || CHART_HEIGHT }}>
      <ResponsiveChartContainer
        dataset={data}
        series={series}
        xAxis={[{ id: 'x', dataKey: xField, scaleType: 'band', tickLabelStyle: { fontSize: 10, fill: '#64748b' } }]}
        yAxis={[{ id: 'y', tickLabelStyle: { fontSize: 10, fill: '#64748b' } }]}
        margin={{ top: 24, right: 16, bottom: 32, left: 56 }}
      >
        <ChartsGrid horizontal />
        <BarPlot borderRadius={4} />
        <LinePlot />
        <MarkPlot />
        <ChartsXAxis axisId="x" />
        <ChartsYAxis axisId="y" />
        <ChartsLegend slotProps={{ legend: { labelStyle: { fontSize: 11 } } }} />
        <ChartsTooltip />
      </ResponsiveChartContainer>
    </Box>
  );
}
