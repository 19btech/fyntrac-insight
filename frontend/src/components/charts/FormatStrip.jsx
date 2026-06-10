import React, { useMemo, useState } from 'react';
import {
  Box, Stack, Chip, Popover, Typography, TextField, Switch, FormControlLabel, Divider, Button,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import { displayValue } from './_displayValue';
import { formatByColumn } from './_columnRules';
import SearchSelect from '../shared/SearchSelect';

const KIND_LABELS = { number: '#', currency: '$', percent: '%', date: '📅', text: 'A' };

/**
 * Apply a column format spec to a value. Exported so charts/tables/KPI cards
 * can render numbers consistently.
 */
export function formatValue(v, spec, columnName) {
  // Domain rules (e.g. periodId is YYYYMM, not a number with commas) win
  // over the generic spec — they encode meaning the user can't see otherwise.
  if (columnName) {
    const ruled = formatByColumn(columnName, displayValue(v));
    if (ruled !== undefined) return ruled;
  }
  // Unwrap single-key wrapper objects (e.g. { periodId: 202202 } -> 202202)
  // before any formatting so KPI cards / chart axes never show JSON blobs.
  v = displayValue(v);
  if (v == null || v === '') return '';
  if (!spec || spec.kind === 'text') return String(v);
  if (spec.kind === 'date') {
    try { return new Date(v).toLocaleDateString(); } catch { return String(v); }
  }
  const num = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(num)) return String(v);
  const decimals = spec.decimals ?? (spec.kind === 'currency' ? 2 : 0);
  let n = num;
  let suffix = spec.suffix || '';
  let prefix = spec.prefix || '';
  if (spec.kind === 'percent') {
    n = num * (spec.alreadyPercent ? 1 : 100);
    suffix = '%' + suffix;
  }
  if (spec.compact) {
    const abs = Math.abs(n);
    if (abs >= 1e9) { n = n / 1e9; suffix = 'B' + suffix; }
    else if (abs >= 1e6) { n = n / 1e6; suffix = 'M' + suffix; }
    else if (abs >= 1e3) { n = n / 1e3; suffix = 'K' + suffix; }
  }
  const formatted = n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (spec.kind === 'currency') prefix = (spec.currencySymbol || '$') + prefix;
  return prefix + formatted + suffix;
}

function inferKind(col, sample) {
  if (sample == null) return 'number';
  if (typeof sample === 'string' && /\d{4}-\d{2}-\d{2}/.test(sample)) return 'date';
  if (typeof sample === 'number' || !Number.isNaN(Number(sample))) {
    if (/(amount|amt|revenue|cost|price|cash|spend|balance|usd|net|gross|total)/i.test(col)) return 'currency';
    if (/(rate|pct|percent|ratio|margin)/i.test(col)) return 'percent';
    return 'number';
  }
  return 'text';
}

/**
 * Per-column format strip. Renders a chip per (numeric) column; click to edit.
 * Persists into `chartConfig.columnFormats[colName] = { kind, decimals, compact, prefix, suffix, currencySymbol, alreadyPercent }`.
 */
export default function FormatStrip({ data = [], columns, columnFormats = {}, onChange }) {
  const cols = useMemo(() => {
    if (columns && columns.length) return columns;
    if (!data.length) return [];
    return Object.keys(data[0]).filter((k) => k !== '_id');
  }, [data, columns]);

  const [anchor, setAnchor] = useState(null);
  const [activeCol, setActiveCol] = useState(null);

  const open = (e, col) => { setAnchor(e.currentTarget); setActiveCol(col); };
  const close = () => { setAnchor(null); setActiveCol(null); };

  const specFor = (col) => columnFormats[col] || { kind: inferKind(col, data[0]?.[col]) };

  const update = (col, patch) => {
    const next = { ...columnFormats, [col]: { ...specFor(col), ...patch } };
    onChange?.(next);
  };

  const reset = (col) => {
    const next = { ...columnFormats };
    delete next[col];
    onChange?.(next);
  };

  if (!cols.length) return null;

  const spec = activeCol ? specFor(activeCol) : null;

  return (
    <Box sx={{ mb: 2.5 }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mr: 1 }}>
          <TuneIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Format
          </Typography>
        </Stack>
        {cols.map((c) => {
          const s = specFor(c);
          const active = !!columnFormats[c];
          return (
            <Box
              key={c}
              onClick={(e) => open(e, c)}
              sx={{
                display: 'inline-flex', alignItems: 'center', gap: 0.5,
                px: 1.25, py: 0.3,
                borderRadius: 999,
                border: '1px solid',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: active ? 700 : 500,
                lineHeight: 1.6,
                userSelect: 'none',
                transition: 'all .12s ease',
                borderColor: active ? '#bfdbfe' : '#e2e8f0',
                bgcolor: active ? '#eff6ff' : '#f8fafc',
                color: active ? '#1e40af' : '#475569',
                '&:hover': {
                  borderColor: active ? '#93c5fd' : '#cbd5e1',
                  bgcolor: active ? '#dbeafe' : '#f1f5f9',
                },
              }}
            >
              <Box component="span" sx={{ fontFamily: 'monospace', opacity: 0.7, fontSize: '0.72rem' }}>
                {KIND_LABELS[s.kind] || '?'}
              </Box>
              <Box component="span">{c}</Box>
            </Box>
          );
        })}
      </Stack>

      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { borderRadius: 3, mt: 0.75, boxShadow: '0 12px 32px rgba(15,23,42,0.16)' } } }}
      >
        {activeCol && spec && (
          <Box sx={{ p: 2.5, width: 300 }}>
            <Stack spacing={2} useFlexGap>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
                  Format column
                </Typography>
                <Typography variant="subtitle2" noWrap title={activeCol} sx={{ fontWeight: 700 }}>
                  {activeCol}
                </Typography>
              </Box>

              <SearchSelect
                value={spec.kind}
                onChange={(val) => update(activeCol, { kind: val })}
                options={[
                  { value: 'number', label: 'Number' },
                  { value: 'currency', label: 'Currency' },
                  { value: 'percent', label: 'Percent' },
                  { value: 'date', label: 'Date' },
                  { value: 'text', label: 'Text (raw)' },
                ]}
                label="Format as"
                fullWidth
              />

              {(spec.kind === 'number' || spec.kind === 'currency' || spec.kind === 'percent') && (
                <TextField
                  type="number"
                  label="Decimals"
                  size="small"
                  fullWidth
                  value={spec.decimals ?? (spec.kind === 'currency' ? 2 : 0)}
                  onChange={(e) => update(activeCol, { decimals: Math.max(0, Math.min(6, Number(e.target.value) || 0)) })}
                />
              )}

              {(spec.kind === 'number' || spec.kind === 'currency' || spec.kind === 'percent') && (
                <FormControlLabel
                  sx={{ m: 0 }}
                  control={<Switch size="small" checked={!!spec.compact} onChange={(e) => update(activeCol, { compact: e.target.checked })} />}
                  label={<Typography variant="body2">Compact (1.2K, 3.4M)</Typography>}
                />
              )}

              {spec.kind === 'currency' && (
                <TextField
                  label="Currency symbol"
                  size="small"
                  fullWidth
                  value={spec.currencySymbol || '$'}
                  onChange={(e) => update(activeCol, { currencySymbol: e.target.value })}
                />
              )}

              {spec.kind === 'percent' && (
                <FormControlLabel
                  sx={{ m: 0 }}
                  control={<Switch size="small" checked={!!spec.alreadyPercent} onChange={(e) => update(activeCol, { alreadyPercent: e.target.checked })} />}
                  label={<Typography variant="body2">Value is already a percent (don't ×100)</Typography>}
                />
              )}

              <Divider />

              <Stack direction="row" spacing={1.5}>
                <TextField label="Prefix" size="small" fullWidth value={spec.prefix || ''} onChange={(e) => update(activeCol, { prefix: e.target.value })} />
                <TextField label="Suffix" size="small" fullWidth value={spec.suffix || ''} onChange={(e) => update(activeCol, { suffix: e.target.value })} />
              </Stack>

              <Box sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <Typography variant="caption" color="text.secondary">
                  Preview: <strong style={{ color: '#1e293b' }}>{formatValue(data[0]?.[activeCol], { ...spec })}</strong>
                </Typography>
              </Box>

              <Stack direction="row" justifyContent="space-between">
                <Button
                  size="small"
                  onClick={() => { reset(activeCol); close(); }}
                  sx={{
                    borderRadius: 2, fontWeight: 600, textTransform: 'none',
                    color: '#64748b', border: '1px solid #e2e8f0', bgcolor: '#f8fafc',
                    '&:hover': { bgcolor: '#f1f5f9', borderColor: '#cbd5e1' },
                  }}
                >
                  Reset
                </Button>
                <Button
                  size="small"
                  onClick={close}
                  sx={{
                    borderRadius: 2, fontWeight: 700, textTransform: 'none',
                    bgcolor: '#14213d', color: '#fff', boxShadow: 'none',
                    '&:hover': { bgcolor: '#0a1628', boxShadow: 'none' },
                  }}
                >
                  Done
                </Button>
              </Stack>
            </Stack>
          </Box>
        )}
      </Popover>
    </Box>
  );
}
