import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Box, FormControl, InputLabel, Select, MenuItem, Chip, Stack, Typography } from '@mui/material';
import LineChart from './LineChart';
import BarChart from './BarChart';
import AreaChart from './AreaChart';
import PieChart from './PieChart';
import ComboChart from './ComboChart';
import ScatterChart from './ScatterChart';
import FunnelChart from './FunnelChart';
import MetricCard from './MetricCard';
import DataTable from './DataTable';
import PivotTable from './PivotTable';
import WaterfallChart from './WaterfallChart';
import VarianceTable from './VarianceTable';
import ChartRecommender from './ChartRecommender';
import FormatStrip from './FormatStrip';
import { displayValue } from './_displayValue';
import { isHiddenColumn, extractNumericWrapper } from './_columnRules';

import { CHART_HEIGHT } from './_chartColors';

const SAMPLE_THRESHOLD = 500;

const CHART_TYPES = [
  { key: 'table', label: 'Table' },
  { key: 'pivot', label: 'Pivot' },
  { key: 'line', label: 'Line' },
  { key: 'bar', label: 'Bar' },
  { key: 'area', label: 'Area' },
  { key: 'pie', label: 'Pie' },
  { key: 'metric', label: 'Metric' },
  { key: 'scatter', label: 'Scatter' },
  { key: 'combo', label: 'Combo' },
  { key: 'funnel', label: 'Funnel' },
  { key: 'waterfall', label: 'Waterfall' },
  { key: 'variance', label: 'Variance' },
];

// Heuristic: keys whose names look like aggregation aliases produced by the builder.
const METRIC_RX = /^(count|sum_|avg_|min_|max_|total_)/i;

function inferAxes(data, xField, yFields) {
  if (!data || !data.length) return { x: xField || '', y: yFields || [] };
  const row = data[0] || {};
  const keys = Object.keys(row).filter((k) => k !== '_id');
  const isNum = (k) => {
    const v = row[k];
    return typeof v === 'number' || (v != null && !isNaN(Number(v)));
  };

  let y = (yFields && yFields.length) ? yFields : keys.filter((k) => METRIC_RX.test(k) && isNum(k));
  if (!y.length) y = keys.filter((k) => isNum(k));

  let x = xField;
  if (!x) x = keys.find((k) => !y.includes(k));
  // if every column is numeric (e.g. yyyymmdd group + sum), promote the first non-metric to x
  if (!x) {
    const nonMetric = keys.find((k) => !METRIC_RX.test(k));
    if (nonMetric) {
      x = nonMetric;
      y = y.filter((k) => k !== nonMetric);
    }
  }
  if (!x && y.length > 1) { x = y[0]; y = y.slice(1); }
  return { x: x || '', y };
}

export default function ChartRenderer({ data: rawData = [], columns = [], config = {}, onConfigChange, onPointClick, exportFilename, height: heightHint, compact = false }) {
  // Self-measure the container so all chart types fill it precisely without
  // relying on an upstream prop that may lag during grid drag-resize.
  const containerRef = useRef(null);
  const [measuredHeight, setMeasuredHeight] = useState(0);
  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect?.height;
      if (h > 1) setMeasuredHeight(Math.floor(h));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // In embedded / dashboard mode (no config toolbar) fill the container.
  // In standalone editor, use the hint or CHART_HEIGHT default.
  const isEmbedded = !onConfigChange;
  const chartHeight = isEmbedded
    ? (measuredHeight || heightHint || CHART_HEIGHT)
    : (heightHint || CHART_HEIGHT);
  const { chartType = 'table', xField, yFields = [], goalLine, columnFormats = {} } = config;

  // Drop wrapper-object columns (e.g. `accountingPeriod: { periodId: 202202 }`)
  // and any column flagged as hidden by the domain rules (batchId, sourceId,
  // attributes, accountingPeriod, ...). Their scalar children are surfaced
  // separately by the backend schema / projection layer; keeping them here
  // would either show JSON blobs or misleading single values.
  const data = useMemo(() => {
    if (!rawData || !rawData.length) return rawData;
    return rawData.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const out = {};
      for (const k of Object.keys(row)) {
        if (isHiddenColumn(k)) continue;
        let v = row[k];
        // Promote known numeric-wrapper columns (beginningBalance, etc.) to
        // their inner number so charts can plot them on a Y axis directly.
        v = extractNumericWrapper(k, v);
        if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) continue;
        out[k] = v;
      }
      return out;
    });
  }, [rawData]);

  const allKeys = useMemo(
    () => (data && data[0] ? Object.keys(data[0]).filter((k) => k !== '_id') : []),
    [data]
  );
  const inferred = useMemo(() => inferAxes(data, xField, yFields), [data, xField, yFields]);

  const sampledData = useMemo(() => {
    if (!['line', 'area', 'scatter'].includes(chartType) || data.length <= SAMPLE_THRESHOLD) return data;
    const step = Math.ceil(data.length / SAMPLE_THRESHOLD);
    return data.filter((_, i) => i % step === 0);
  }, [data, chartType]);
  const isSampled = sampledData !== data;

  const isChart = !['table', 'pivot', 'metric', 'variance'].includes(chartType);
  const props = {
    data,
    xField: inferred.x,
    yFields: inferred.y,
    goalLine,
    columnFormats,
    onPointClick,
    height: chartHeight,
    compact,
  };

  const renderChart = () => {
    switch (chartType) {
      case 'line': return <LineChart {...props} data={sampledData} />;
      case 'bar': return <BarChart {...props} />;
      case 'area': return <AreaChart {...props} data={sampledData} />;
      case 'pie': return <PieChart {...props} />;
      case 'combo': return <ComboChart {...props} />;
      case 'scatter': return <ScatterChart {...props} data={sampledData} />;
      case 'funnel': return <FunnelChart {...props} />;
      case 'waterfall': return <WaterfallChart {...props} />;
      case 'metric': return <MetricCard data={data} yFields={inferred.y} goalValue={goalLine} columnFormats={columnFormats} height={chartHeight} />;
      case 'variance': return (
        <VarianceTable
          data={data}
          xField={inferred.x}
          dimField={config.dimField}
          actualField={config.actualField || inferred.y[0]}
          budgetField={config.budgetField || inferred.y[1]}
          columnFormats={columnFormats}
          goodWhen={config.goodWhen}
          height={chartHeight}
        />
      );
      case 'pivot': return (
        <PivotTable
          data={data}
          rowField={config.rowField || xField}
          columnField={config.columnField}
          valueField={config.valueField || yFields[0]}
          agg={config.agg || 'sum'}
          conditionalFormat={config.conditionalFormat || []}
          columnFormats={columnFormats}
          height={chartHeight}
        />
      );
      default: return (
        <DataTable
          data={data}
          columns={columns}
          conditionalFormat={config.conditionalFormat}
          columnFormats={columnFormats}
          filename={exportFilename || 'report.csv'}
          columnOrder={config.columnOrder}
          onColumnOrderChange={onConfigChange ? (next) => onConfigChange({ ...config, columnOrder: next }) : undefined}
          height={chartHeight}
        />
      );
    }
  };

  return (
    <Box
      ref={containerRef}
      sx={isEmbedded
        ? { height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }
        : undefined
      }
    >
      {onConfigChange && (
        <ChartRecommender
          data={data}
          inferred={inferred}
          allKeys={allKeys}
          current={chartType}
          onPick={(type) => onConfigChange({ ...config, chartType: type })}
        />
      )}

      {/* Per-column formatting strip — front-and-center for finance users */}
      {onConfigChange && data.length > 0 && (
        <FormatStrip
          data={data}
          columns={allKeys}
          columnFormats={columnFormats}
          onChange={(next) => onConfigChange({ ...config, columnFormats: next })}
        />
      )}

      {/* Variance picker — explicit Actual/Budget selectors */}
      {chartType === 'variance' && onConfigChange && allKeys.length > 0 && (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">Compare:</Typography>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Group by</InputLabel>
            <Select label="Group by" value={config.dimField || inferred.x || ''} onChange={(e) => onConfigChange({ ...config, dimField: e.target.value })}>
              {allKeys.map((k) => <MenuItem key={k} value={k}>{k}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Actual</InputLabel>
            <Select label="Actual" value={config.actualField || inferred.y[0] || ''} onChange={(e) => onConfigChange({ ...config, actualField: e.target.value })}>
              {allKeys.map((k) => <MenuItem key={k} value={k}>{k}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Target / Budget</InputLabel>
            <Select label="Target / Budget" value={config.budgetField || inferred.y[1] || ''} onChange={(e) => onConfigChange({ ...config, budgetField: e.target.value })}>
              {allKeys.map((k) => <MenuItem key={k} value={k}>{k}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Good when</InputLabel>
            <Select label="Good when" value={config.goodWhen || 'higher'} onChange={(e) => onConfigChange({ ...config, goodWhen: e.target.value })}>
              <MenuItem value="higher">Actual ≥ target</MenuItem>
              <MenuItem value="lower">Actual ≤ target</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      )}

      {/* Axis picker — only for X/Y charts */}
      {isChart && onConfigChange && allKeys.length > 0 && (
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 2.5, mb: 2.5, flexWrap: 'wrap', rowGap: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>Display:</Typography>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>X axis</InputLabel>
            <Select
              label="X axis"
              value={inferred.x || ''}
              onChange={(e) => onConfigChange({ ...config, xField: e.target.value })}
            >
              {allKeys.map((k) => <MenuItem key={k} value={k}>{k}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 240 }}>
            <InputLabel>Y values</InputLabel>
            <Select
              label="Y values"
              multiple
              value={inferred.y}
              onChange={(e) => onConfigChange({ ...config, yFields: typeof e.target.value === 'string' ? [e.target.value] : e.target.value })}
              renderValue={(sel) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {sel.map((v) => <Chip key={v} label={v} size="small" sx={{ height: 20 }} />)}
                </Box>
              )}
            >
              {allKeys.filter((k) => k !== inferred.x).map((k) => <MenuItem key={k} value={k}>{k}</MenuItem>)}
            </Select>
          </FormControl>
        </Stack>
      )}

      {isSampled && (
        <Chip
          label={`Showing ${sampledData.length.toLocaleString()} of ${data.length.toLocaleString()} points (sampled)`}
          size="small"
          variant="outlined"
          sx={{ mb: 1, alignSelf: 'flex-start' }}
        />
      )}
      {renderChart()}
    </Box>
  );
}

export { CHART_TYPES };
