import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Box, Chip, Stack, Typography, Autocomplete, TextField, Button, Checkbox } from '@mui/material';
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
import { isHiddenColumn, extractNumericWrapper } from './_columnRules';
import { transformForViz } from './_vizTransform';
import { typeFields } from './_chartConfig';

import { CHART_HEIGHT } from './_chartColors';
import SearchSelect from '../shared/SearchSelect';

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
  // An explicit array (even empty) means the user has chosen — respect it and
  // never auto-infer over the top. Only infer when yFields is unset (undefined).
  const explicitY = Array.isArray(yFields);
  if (!data || !data.length) return { x: xField || '', y: explicitY ? yFields : [] };
  const row = data[0] || {};
  const keys = Object.keys(row).filter((k) => k !== '_id');
  const isNum = (k) => {
    const v = row[k];
    return typeof v === 'number' || (v != null && !isNaN(Number(v)));
  };

  let y;
  if (explicitY) {
    y = yFields;
  } else {
    y = keys.filter((k) => METRIC_RX.test(k) && isNum(k));
    if (!y.length) y = keys.filter((k) => isNum(k));
  }

  let x = xField;
  if (!x) x = keys.find((k) => !y.includes(k));
  // if every column is numeric (e.g. yyyymmdd group + sum), promote the first non-metric to x
  if (!x) {
    const nonMetric = keys.find((k) => !METRIC_RX.test(k));
    if (nonMetric) {
      x = nonMetric;
      if (!explicitY) y = y.filter((k) => k !== nonMetric);
    }
  }
  if (!x && y.length > 1 && !explicitY) { x = y[0]; y = y.slice(1); }
  return { x: x || '', y };
}

export default function ChartRenderer({ data: rawData = [], columns = [], config = {}, onConfigChange, onPointClick, exportFilename, height: heightHint, compact = false, controls = 'builtin' }) {
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
  const { chartType = 'table', goalLine, columnFormats = {} } = config;
  // Field-role assignments are per chart type (display/format stay shared).
  const tf = useMemo(() => typeFields(config, chartType), [config, chartType]);
  const { xField, yFields } = tf;

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
  const inferredBase = useMemo(() => inferAxes(data, xField, yFields), [data, xField, yFields]);

  // Apply config-driven transforms (sort / top-N / series breakout). When a
  // series breakout pivots the data, the resulting series columns become the Y
  // fields to plot.
  const { data: vizData, yFieldsOverride } = useMemo(
    () => transformForViz(data, { ...config, ...tf }, inferredBase.x, inferredBase.y),
    [data, config, tf, inferredBase.x, inferredBase.y]
  );
  const inferred = useMemo(
    () => (yFieldsOverride ? { x: inferredBase.x, y: yFieldsOverride } : inferredBase),
    [inferredBase, yFieldsOverride]
  );

  const sampledData = useMemo(() => {
    if (!['line', 'area', 'scatter'].includes(chartType) || vizData.length <= SAMPLE_THRESHOLD) return vizData;
    const step = Math.ceil(vizData.length / SAMPLE_THRESHOLD);
    return vizData.filter((_, i) => i % step === 0);
  }, [vizData, chartType]);
  const isSampled = sampledData !== vizData;

  const isChart = !['table', 'pivot', 'metric', 'variance'].includes(chartType);
  const props = {
    data: vizData,
    xField: inferred.x,
    yFields: inferred.y,
    goalLine,
    columnFormats,
    onPointClick,
    height: chartHeight,
    compact,
    // Display options — each chart consumes what it supports.
    stacked: config.stacked,
    dualAxis: config.dualAxis,
    legend: config.legend,
    dataLabels: config.dataLabels,
    axisTitles: config.axisTitles,
    palette: config.palette,
    smooth: config.smooth,
    referenceLines: config.referenceLines,
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
      case 'metric': return <MetricCard data={vizData} yFields={inferred.y} goalValue={goalLine} columnFormats={columnFormats} height={chartHeight} />;
      case 'variance': return (
        <VarianceTable
          data={vizData}
          xField={inferred.x}
          dimField={tf.dimField || inferred.x}
          actualField={tf.actualField || inferred.y[0]}
          budgetField={tf.budgetField || inferred.y[1]}
          columnFormats={columnFormats}
          goodWhen={tf.goodWhen}
          height={chartHeight}
        />
      );
      case 'pivot': return (
        <PivotTable
          data={vizData}
          rowField={tf.rowField || inferred.x}
          columnField={tf.columnField}
          valueField={tf.valueField || inferred.y[0]}
          agg={tf.agg || 'sum'}
          conditionalFormat={config.conditionalFormat || []}
          columnFormats={columnFormats}
          sort={tf.sort}
          height={chartHeight}
        />
      );
      default: return (
        <DataTable
          data={vizData}
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
      {onConfigChange && controls !== 'external' && (
        <ChartRecommender
          data={data}
          inferred={inferred}
          allKeys={allKeys}
          current={chartType}
          onPick={(type) => onConfigChange({ ...config, chartType: type })}
        />
      )}

      {/* Per-column formatting strip — front-and-center for finance users.
          In external-controls mode this lives in the settings rail's Format tab. */}
      {onConfigChange && controls !== 'external' && data.length > 0 && (
        <FormatStrip
          data={data}
          columns={allKeys}
          columnFormats={columnFormats}
          onChange={(next) => onConfigChange({ ...config, columnFormats: next })}
        />
      )}

      {/* Variance picker — explicit Actual/Budget selectors (in external mode
          these live in the rail's Data tab instead). */}
      {chartType === 'variance' && onConfigChange && controls !== 'external' && allKeys.length > 0 && (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">Compare:</Typography>
          <SearchSelect
            value={config.dimField || inferred.x || ''}
            onChange={(val) => onConfigChange({ ...config, dimField: val })}
            options={allKeys.map((k) => ({ value: k, label: k }))}
            label="Group by"
            width={160}
          />
          <SearchSelect
            value={config.actualField || inferred.y[0] || ''}
            onChange={(val) => onConfigChange({ ...config, actualField: val })}
            options={allKeys.map((k) => ({ value: k, label: k }))}
            label="Actual"
            width={160}
          />
          <SearchSelect
            value={config.budgetField || inferred.y[1] || ''}
            onChange={(val) => onConfigChange({ ...config, budgetField: val })}
            options={allKeys.map((k) => ({ value: k, label: k }))}
            label="Target / Budget"
            width={160}
          />
          <SearchSelect
            value={config.goodWhen || 'higher'}
            onChange={(val) => onConfigChange({ ...config, goodWhen: val })}
            options={[
              { value: 'higher', label: 'Actual ≥ target' },
              { value: 'lower', label: 'Actual ≤ target' },
            ]}
            label="Good when"
            width={140}
          />
        </Stack>
      )}

      {/* Axis picker — only for X/Y charts (replaced by the rail in external mode) */}
      {isChart && onConfigChange && controls !== 'external' && allKeys.length > 0 && (
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 2.5, mb: 2.5, flexWrap: 'wrap', rowGap: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>Display:</Typography>
          <SearchSelect
            value={inferred.x || ''}
            onChange={(val) => onConfigChange({ ...config, xField: val })}
            options={allKeys.map((k) => ({ value: k, label: k }))}
            label="X axis"
            width={180}
          />
          {(() => {
            const yOptions = allKeys.filter((k) => k !== inferred.x);
            const selectedY = (inferred.y || []).filter((k) => yOptions.includes(k));
            const allSelected = yOptions.length > 0 && selectedY.length === yOptions.length;
            return (
              <Stack direction="row" spacing={1} alignItems="center">
                <Autocomplete
                  multiple
                  size="small"
                  disableCloseOnSelect
                  options={yOptions}
                  value={selectedY}
                  isOptionEqualToValue={(o, v) => o === v}
                  onChange={(_, val) => onConfigChange({ ...config, yFields: val })}
                  sx={{ minWidth: 240, maxWidth: 380 }}
                  renderOption={(props, option, { selected }) => {
                    const { key, ...liProps } = props;
                    return (
                      <li key={key} {...liProps}>
                        <Checkbox size="small" checked={selected} sx={{ mr: 1, p: 0.5 }} />
                        {option}
                      </li>
                    );
                  }}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => {
                      const { key, ...tagProps } = getTagProps({ index });
                      return <Chip key={key} label={option} size="small" sx={{ height: 20 }} {...tagProps} />;
                    })
                  }
                  renderInput={(params) => (
                    <TextField {...params} label="Y values" size="small" placeholder={selectedY.length ? 'Search…' : 'Search & select…'} />
                  )}
                />
                <Button
                  size="small"
                  onClick={() => onConfigChange({ ...config, yFields: allSelected ? [] : yOptions })}
                  sx={{ textTransform: 'none', fontWeight: 600, color: '#475569', minWidth: 0, whiteSpace: 'nowrap' }}
                >
                  {allSelected ? 'Clear all' : 'Select all'}
                </Button>
              </Stack>
            );
          })()}
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

export { CHART_TYPES, inferAxes };
