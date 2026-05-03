import React, { useMemo } from 'react';
import { Table, TableHead, TableRow, TableCell, TableBody, Box, Stack, Typography, Tooltip } from '@mui/material';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { formatValue } from './FormatStrip';
import { formatByColumn } from './_columnRules';

const POS = '#16a34a';
const NEG = '#dc2626';
const NEUTRAL = '#64748b';

function pickField(row, candidates) {
  const keys = Object.keys(row || {});
  for (const cand of candidates) {
    const hit = keys.find((k) => k.toLowerCase() === cand.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

/**
 * Variance vs Target — finance-first first-class layout.
 * Renders a colored Actual/Target/Δ$/Δ% table grouped by `dimField`.
 *
 * Field resolution order:
 *   actualField/budgetField from `config` → aliases 'actual'/'budget'/'target' →
 *   first two numeric columns.
 */
export default function VarianceTable({ data = [], xField, dimField, actualField, budgetField, columnFormats = {}, goodWhen = 'higher', height }) {
  const rows = data || [];
  const sample = rows[0] || {};

  const dim = dimField || xField || pickField(sample, ['account','category','region','customer','product','dimension','name']) ||
    Object.keys(sample).find((k) => k !== '_id' && typeof sample[k] !== 'number');

  const actual = actualField || pickField(sample, ['actual','actuals','net','value','amount']) ||
    Object.keys(sample).find((k) => k !== dim && typeof sample[k] === 'number');
  const budget = budgetField || pickField(sample, ['budget','target','plan','forecast']) ||
    Object.keys(sample).filter((k) => k !== dim && k !== actual && typeof sample[k] === 'number')[0];

  const fmt = (col, v) => formatValue(v, columnFormats[col] || { kind: 'number' }, col);
  const fmtDim = (col, v) => {
    if (v == null) return '—';
    const ruled = formatByColumn(col, v);
    if (ruled !== undefined && ruled !== '') return ruled;
    return String(v);
  };
  const moneyFmt = columnFormats[actual] || { kind: 'currency', decimals: 0 };
  const pctFmt = { kind: 'percent', decimals: 1, alreadyPercent: true };

  const totals = useMemo(() => {
    let a = 0, b = 0;
    rows.forEach((r) => { a += Number(r[actual]) || 0; b += Number(r[budget]) || 0; });
    return { a, b };
  }, [rows, actual, budget]);

  if (!actual || !budget) {
    return (
      <Box sx={{ p: 3, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'grey.50' }}>
        <Typography variant="body2" color="text.secondary">
          Variance layout needs at least two numeric columns (e.g. <strong>actual</strong> and <strong>budget</strong>).
          Add two metrics in the Summarize step and we'll color the deltas for you.
        </Typography>
      </Box>
    );
  }

  const renderDelta = (a, b) => {
    const da = (Number(a) || 0) - (Number(b) || 0);
    const dp = b ? da / Math.abs(Number(b)) * 100 : 0;
    const isGood = goodWhen === 'higher' ? da >= 0 : da <= 0;
    const color = da === 0 ? NEUTRAL : (isGood ? POS : NEG);
    const Icon = da === 0 ? null : (da > 0 ? ArrowDropUpIcon : ArrowDropDownIcon);
    return (
      <Stack direction="row" alignItems="center" spacing={0.5} justifyContent="flex-end" sx={{ color }}>
        {Icon && <Icon sx={{ fontSize: 18 }} />}
        <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>{formatValue(da, moneyFmt)}</Typography>
        <Typography variant="caption" sx={{ opacity: 0.8 }}>({formatValue(dp, pctFmt)})</Typography>
      </Stack>
    );
  };

  return (
    <Box sx={{ overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1, height: height || 'auto', maxHeight: height || undefined }}>
      <Table size="small">
        <TableHead sx={{ bgcolor: 'grey.50' }}>
          <TableRow>
            <TableCell>{dim || 'Group'}</TableCell>
            <TableCell align="right">{actual}</TableCell>
            <TableCell align="right">{budget}</TableCell>
            <TableCell align="right">Δ vs target</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i} hover>
              <TableCell>{fmtDim(dim, r[dim])}</TableCell>
              <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{fmt(actual, r[actual])}</TableCell>
              <TableCell align="right" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{fmt(budget, r[budget])}</TableCell>
              <TableCell align="right">
                <Tooltip title={`${actual} vs ${budget}`}>
                  <span>{renderDelta(r[actual], r[budget])}</span>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
          <TableRow sx={{ bgcolor: 'grey.50' }}>
            <TableCell sx={{ fontWeight: 700 }}>Total</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>{fmt(actual, totals.a)}</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>{fmt(budget, totals.b)}</TableCell>
            <TableCell align="right">{renderDelta(totals.a, totals.b)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Box>
  );
}
