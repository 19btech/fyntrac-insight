import React, { useMemo, useState } from 'react';
import {
  Box, Tabs, Tab, Typography, Stack, Chip, IconButton, TextField, MenuItem,
  ToggleButtonGroup, ToggleButton, Switch, FormControlLabel, Tooltip, Divider, Button,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import TagIcon from '@mui/icons-material/Tag';
import AbcIcon from '@mui/icons-material/Abc';
import { typeFields, applyConfigPatch } from './_chartConfig';

const DND_MIME = 'application/x-fyntrac-field';
const CARTESIAN = ['bar', 'line', 'area', 'combo', 'scatter'];
const STACKABLE = ['bar', 'area', 'combo'];
const SMOOTHABLE = ['line', 'area'];

const PALETTES = [
  { key: 'default', label: 'Default' },
  { key: 'cool', label: 'Cool' },
  { key: 'warm', label: 'Warm' },
  { key: 'vibrant', label: 'Vibrant' },
  { key: 'mono', label: 'Monochrome' },
];

function fieldType(data, name) {
  const v = data?.[0]?.[name];
  if (typeof v === 'number') return 'number';
  if (v != null && v !== '' && !Number.isNaN(Number(v))) return 'number';
  return 'string';
}

// Draggable field chip (native HTML5 DnD).
function FieldChip({ name, type, onDragStart }) {
  return (
    <Chip
      size="small"
      draggable
      onDragStart={(e) => { e.dataTransfer.setData(DND_MIME, name); e.dataTransfer.effectAllowed = 'copy'; onDragStart?.(name); }}
      icon={type === 'number' ? <TagIcon sx={{ fontSize: 14 }} /> : <AbcIcon sx={{ fontSize: 16 }} />}
      label={name}
      sx={{
        cursor: 'grab', borderRadius: 1.5, bgcolor: '#fff', border: '1px solid #e2e8f0',
        fontWeight: 500, '& .MuiChip-icon': { color: type === 'number' ? '#2563eb' : '#7c3aed' },
        '&:active': { cursor: 'grabbing' },
      }}
    />
  );
}

// A drop target shelf. `items` are the assigned field names.
function Shelf({ label, hint, items, single, onDrop, onRemove }) {
  const [over, setOver] = useState(false);
  return (
    <Box>
      <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.4, mb: 0.5 }}>
        {label}{single ? '' : ''}
      </Typography>
      <Box
        onDragOver={(e) => { if (e.dataTransfer.types.includes(DND_MIME)) { e.preventDefault(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.getData(DND_MIME); if (f) onDrop(f); }}
        sx={{
          minHeight: 40, borderRadius: 2, p: 0.75, display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center',
          border: '1.5px dashed', transition: 'all 120ms ease',
          borderColor: over ? '#6366f1' : '#cbd5e1', bgcolor: over ? '#eef2ff' : '#f8fafc',
        }}
      >
        {items.length === 0 ? (
          <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8', px: 0.5 }}>{hint || 'Drop a field here'}</Typography>
        ) : (
          items.map((name) => (
            <Chip
              key={name}
              size="small"
              icon={<DragIndicatorIcon sx={{ fontSize: 15 }} />}
              label={name}
              onDelete={() => onRemove(name)}
              deleteIcon={<CloseIcon sx={{ fontSize: 14 }} />}
              sx={{ borderRadius: 1.5, bgcolor: '#eef2ff', color: '#4338ca', fontWeight: 600, '& .MuiChip-icon': { color: '#818cf8' } }}
            />
          ))
        )}
      </Box>
    </Box>
  );
}

/**
 * Metabase-style visualization settings rail. Data tab assigns fields to
 * X / Values / Series via drag-and-drop (+ sort & top-N); Display tab exposes
 * stacking, dual-axis, legend, labels, axis titles, palette, smoothing and
 * reference lines. Everything reads/writes the chartConfig.
 */
export default function VizSettingsRail({ config = {}, onChange, data = [], columns = [], chartType, inferred = {} }) {
  const [tab, setTab] = useState('data');
  // Field-role edits are namespaced per chart type; display/format are shared.
  const set = (patch) => onChange?.(applyConfigPatch(config, chartType, patch));
  // Per-type field assignments (falls back to legacy top-level fields).
  const tf = typeFields(config, chartType);

  const fields = useMemo(() => {
    const keys = columns?.length ? columns : (data?.[0] ? Object.keys(data[0]) : []);
    return keys.filter((k) => k && k !== '_id').map((name) => ({ name, type: fieldType(data, name) }));
  }, [columns, data]);

  // Autofill the shelves with whatever the system inferred until the user
  // edits it. `undefined` = never touched (show inferred); '' = explicitly
  // cleared (show empty), so the remove/cancel button actually clears.
  const xField = tf.xField !== undefined ? tf.xField : (inferred.x || '');
  const yFields = Array.isArray(tf.yFields) ? tf.yFields : (inferred.y || []);
  const series = tf.series || '';
  // Pivot field effective values (same undefined-vs-cleared rule).
  const rowField = tf.rowField !== undefined ? tf.rowField : (inferred.x || '');
  const valueField = tf.valueField !== undefined ? tf.valueField : (yFields[0] || '');
  const legend = config.legend || { show: true, position: 'bottom' };
  const axisTitles = config.axisTitles || {};
  const refLines = Array.isArray(config.referenceLines) ? config.referenceLines : [];

  const isCartesian = CARTESIAN.includes(chartType);
  const canStack = STACKABLE.includes(chartType);
  const canSmooth = SMOOTHABLE.includes(chartType);
  const canDual = ['bar', 'line', 'area', 'combo'].includes(chartType) && yFields.length >= 2;
  const hasLegend = ['bar', 'line', 'area', 'combo', 'scatter', 'pie'].includes(chartType);
  const hasPalette = hasLegend;
  const canDataLabels = ['bar', 'combo', 'pie', 'line', 'area'].includes(chartType);
  const hasAnyDisplay = hasLegend || hasPalette || canStack || canDual || canSmooth || canDataLabels || isCartesian;

  // The Data + Display tabs only apply to field-mapped charts. For table /
  // pivot / metric / variance / funnel / waterfall they're disabled (Format
  // still applies to every chart type), so fall back to Format there.
  const isPivot = chartType === 'pivot';
  const isVariance = chartType === 'variance';
  const vizApplicable = ['bar', 'line', 'area', 'combo', 'pie', 'scatter', 'pivot', 'variance'].includes(chartType);
  const activeTab = tab === 'format' ? 'data' : tab; // Format tab removed

  // Variance "Compare" field effective values (undefined = infer, '' = cleared).
  const dimField = tf.dimField !== undefined ? tf.dimField : (inferred.x || '');
  const actualField = tf.actualField !== undefined ? tf.actualField : (inferred.y?.[0] || '');
  const budgetField = tf.budgetField !== undefined ? tf.budgetField : (inferred.y?.[1] || '');

  // Per-chart-type field shelves — the Data tab is tailored to each chart.
  const SHAPES = {
    bar:     { x: 'X axis', xHint: 'Dimension (e.g. period)', y: 'Values (Y)', yHint: 'One or more measures', yMulti: true, series: true },
    line:    { x: 'X axis', xHint: 'Dimension (e.g. period)', y: 'Values (Y)', yHint: 'One or more measures', yMulti: true, series: true },
    area:    { x: 'X axis', xHint: 'Dimension (e.g. period)', y: 'Values (Y)', yHint: 'One or more measures', yMulti: true, series: true },
    combo:   { x: 'X axis', xHint: 'Dimension (e.g. period)', y: 'Values (Y)', yHint: 'First = bar, rest = lines', yMulti: true, series: true },
    pie:     { x: 'Category', xHint: 'The slice category', y: 'Value', yHint: 'A single measure', yMulti: false, series: false },
    scatter: { x: 'X axis', xHint: 'Numeric X', y: 'Y axis', yHint: 'Numeric Y', yMulti: false, series: false },
  };
  const shape = SHAPES[chartType] || SHAPES.bar;

  // ── shelf mutations ──
  const addX = (f) => set({ xField: f });
  const addY = (f) => { if (shape.yMulti) { if (!yFields.includes(f)) set({ yFields: [...yFields, f] }); } else set({ yFields: [f] }); };
  const removeY = (f) => set({ yFields: shape.yMulti ? yFields.filter((x) => x !== f) : [] });
  const addSeries = (f) => set({ series: f });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#fff' }}>
      <Tabs
        value={vizApplicable ? activeTab : false}
        onChange={(_, v) => setTab(v)}
        variant="fullWidth"
        sx={{ minHeight: 40, borderBottom: '1px solid #e2e8f0',
          '& .MuiTab-root': { minHeight: 40, textTransform: 'none', fontWeight: 600, fontSize: '0.8rem', color: '#64748b' },
          '& .Mui-selected': { color: '#4f46e5' }, '& .MuiTabs-indicator': { backgroundColor: '#4f46e5' } }}
      >
        <Tab value="data" label="Data" disabled={!vizApplicable} />
        <Tab value="display" label="Display" disabled={!vizApplicable} />
      </Tabs>

      <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
        {!vizApplicable ? (
          <Typography sx={{ fontSize: '0.78rem', color: '#94a3b8', p: 0.5 }}>
            No visualization settings for this chart type.
          </Typography>
        ) : activeTab === 'data' ? (
          <Stack spacing={1.75}>
            {/* Available fields */}
            <Box>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.4, mb: 0.5 }}>
                Fields
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {fields.length === 0 ? (
                  <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8' }}>Run the query to see fields.</Typography>
                ) : fields.map((f) => <FieldChip key={f.name} name={f.name} type={f.type} />)}
              </Box>
            </Box>

            <Divider />

            {isPivot ? (
              <>
                <Shelf label="Rows" single hint="Row dimension" items={rowField ? [rowField] : []} onDrop={(f) => set({ rowField: f })} onRemove={() => set({ rowField: '' })} />
                <Shelf label="Columns" single hint="Column dimension — pivots across" items={tf.columnField ? [tf.columnField] : []} onDrop={(f) => set({ columnField: f })} onRemove={() => set({ columnField: '' })} />
                <Shelf label="Value" single hint="Measure to aggregate" items={valueField ? [valueField] : []} onDrop={(f) => set({ valueField: f })} onRemove={() => set({ valueField: '' })} />
                <TextField
                  select size="small" label="Aggregation"
                  value={tf.agg || 'sum'}
                  onChange={(e) => set({ agg: e.target.value })}
                >
                  {['sum', 'avg', 'count', 'min', 'max'].map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
                </TextField>
              </>
            ) : isVariance ? (
              <>
                <Shelf label="Group by" single hint="The dimension to compare" items={dimField ? [dimField] : []} onDrop={(f) => set({ dimField: f })} onRemove={() => set({ dimField: '' })} />
                <Shelf label="Actual" single hint="Actual measure" items={actualField ? [actualField] : []} onDrop={(f) => set({ actualField: f })} onRemove={() => set({ actualField: '' })} />
                <Shelf label="Target / Budget" single hint="Target measure to compare against" items={budgetField ? [budgetField] : []} onDrop={(f) => set({ budgetField: f })} onRemove={() => set({ budgetField: '' })} />
                <TextField
                  select size="small" label="Good when"
                  value={tf.goodWhen || 'higher'}
                  onChange={(e) => set({ goodWhen: e.target.value })}
                >
                  <MenuItem value="higher">Actual ≥ target</MenuItem>
                  <MenuItem value="lower">Actual ≤ target</MenuItem>
                </TextField>
              </>
            ) : (
              <>
                <Shelf label={shape.x} single hint={shape.xHint} items={xField ? [xField] : []} onDrop={addX} onRemove={() => set({ xField: '' })} />
                <Shelf
                  label={shape.y}
                  single={!shape.yMulti}
                  hint={shape.yHint}
                  items={shape.yMulti ? yFields : (yFields[0] != null ? [yFields[0]] : [])}
                  onDrop={addY}
                  onRemove={removeY}
                />
                {shape.series && (
                  <Shelf label="Series / color" single hint="Optional — split into colored series" items={series ? [series] : []} onDrop={addSeries} onRemove={() => set({ series: '' })} />
                )}
              </>
            )}

            <Divider />

            {/* Sort + Top-N */}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                select size="small" fullWidth label="Sort by"
                value={tf.sort?.field || ''}
                onChange={(e) => set({ sort: e.target.value ? { field: e.target.value, dir: tf.sort?.dir || 'desc' } : undefined })}
              >
                <MenuItem value="">(none)</MenuItem>
                {fields.map((f) => <MenuItem key={f.name} value={f.name}>{f.name}</MenuItem>)}
              </TextField>
              <ToggleButtonGroup
                exclusive size="small"
                value={tf.sort?.dir || 'desc'}
                onChange={(_, v) => v && tf.sort?.field && set({ sort: { ...tf.sort, dir: v } })}
                sx={{ '& .MuiToggleButton-root': { px: 1, fontSize: '0.7rem', textTransform: 'none' } }}
              >
                <ToggleButton value="asc">Asc</ToggleButton>
                <ToggleButton value="desc">Desc</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <TextField
              size="small" type="number" label="Top N (limit)"
              value={tf.topN ?? ''}
              onChange={(e) => set({ topN: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="All"
              inputProps={{ min: 1 }}
            />
          </Stack>
        ) : (
          <Stack spacing={1.75}>
            {!hasAnyDisplay && (
              <Typography sx={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                No display options for this chart type — try the Data and Format tabs.
              </Typography>
            )}

            {canStack && (
              <Box>
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', mb: 0.5 }}>Stacking</Typography>
                <ToggleButtonGroup
                  exclusive size="small" fullWidth
                  value={config.stacked || 'none'}
                  onChange={(_, v) => v && set({ stacked: v })}
                  sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontSize: '0.72rem' } }}
                >
                  <ToggleButton value="none">None</ToggleButton>
                  <ToggleButton value="stacked">Stacked</ToggleButton>
                  <ToggleButton value="normalized">100%</ToggleButton>
                </ToggleButtonGroup>
              </Box>
            )}

            {canDual && (
              <FormControlLabel
                control={<Switch size="small" checked={!!config.dualAxis} onChange={(e) => set({ dualAxis: e.target.checked })} />}
                label={<Typography sx={{ fontSize: '0.8rem' }}>Dual Y axis (2nd measure on right)</Typography>}
              />
            )}

            {canSmooth && (
              <FormControlLabel
                control={<Switch size="small" checked={!!config.smooth} onChange={(e) => set({ smooth: e.target.checked })} />}
                label={<Typography sx={{ fontSize: '0.8rem' }}>Smooth lines</Typography>}
              />
            )}

            {canDataLabels && (
              <FormControlLabel
                control={<Switch size="small" checked={!!config.dataLabels} onChange={(e) => set({ dataLabels: e.target.checked })} />}
                label={<Typography sx={{ fontSize: '0.8rem' }}>Show data labels</Typography>}
              />
            )}

            {hasLegend && (
            <Box>
              <FormControlLabel
                control={<Switch size="small" checked={legend.show !== false} onChange={(e) => set({ legend: { ...legend, show: e.target.checked } })} />}
                label={<Typography sx={{ fontSize: '0.8rem' }}>Legend</Typography>}
              />
              {legend.show !== false && (
                <ToggleButtonGroup
                  exclusive size="small"
                  value={legend.position || 'bottom'}
                  onChange={(_, v) => v && set({ legend: { ...legend, position: v } })}
                  sx={{ ml: 1, '& .MuiToggleButton-root': { px: 1, fontSize: '0.68rem', textTransform: 'none' } }}
                >
                  <ToggleButton value="top">Top</ToggleButton>
                  <ToggleButton value="bottom">Bottom</ToggleButton>
                  <ToggleButton value="right">Right</ToggleButton>
                </ToggleButtonGroup>
              )}
            </Box>
            )}

            {isCartesian && (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField size="small" fullWidth label="X axis title" value={axisTitles.x || ''} onChange={(e) => set({ axisTitles: { ...axisTitles, x: e.target.value } })} />
                <TextField size="small" fullWidth label="Y axis title" value={axisTitles.y || ''} onChange={(e) => set({ axisTitles: { ...axisTitles, y: e.target.value } })} />
              </Box>
            )}

            {hasPalette && (
              <TextField
                select size="small" label="Color palette"
                value={config.palette || 'default'}
                onChange={(e) => set({ palette: e.target.value })}
              >
                {PALETTES.map((p) => <MenuItem key={p.key} value={p.key}>{p.label}</MenuItem>)}
              </TextField>
            )}

            {['bar', 'line', 'area', 'combo'].includes(chartType) && (
              <Box>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Reference lines</Typography>
                  <Button size="small" startIcon={<AddIcon />} onClick={() => set({ referenceLines: [...refLines, { value: 0, label: '' }] })} sx={{ textTransform: 'none', fontSize: '0.72rem' }}>Add</Button>
                </Stack>
                <Stack spacing={0.75}>
                  {refLines.map((rl, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
                      <TextField size="small" type="number" label="Value" value={rl.value} onChange={(e) => { const next = [...refLines]; next[i] = { ...rl, value: Number(e.target.value) }; set({ referenceLines: next }); }} sx={{ width: 110 }} />
                      <TextField size="small" label="Label" value={rl.label || ''} onChange={(e) => { const next = [...refLines]; next[i] = { ...rl, label: e.target.value }; set({ referenceLines: next }); }} fullWidth />
                      <Tooltip title="Remove"><IconButton size="small" onClick={() => set({ referenceLines: refLines.filter((_, idx) => idx !== i) })}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
