import React, { useMemo } from 'react';
import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography } from '@mui/material';
import { displayString } from './_displayValue';

/**
 * Metabase v60 pivot table.
 * config: { rowField, columnField, valueField, agg ('sum'|'avg'|'count'|'min'|'max'),
 *           conditionalFormat: [{ op: '>'|'<'|'=', value, color, bgColor }] }
 */
function aggregate(values, agg) {
  if (!values || values.length === 0) return null;
  const nums = values.map((v) => Number(v)).filter((v) => !Number.isNaN(v));
  switch (agg) {
    case 'count': return values.length;
    case 'avg': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    case 'min': return nums.length ? Math.min(...nums) : 0;
    case 'max': return nums.length ? Math.max(...nums) : 0;
    case 'sum':
    default: return nums.reduce((a, b) => a + b, 0);
  }
}

function applyConditionalFormat(value, rules = []) {
  if (value == null) return {};
  for (const rule of rules) {
    const num = Number(value);
    if (Number.isNaN(num)) continue;
    const target = Number(rule.value);
    let match = false;
    if (rule.op === '>' && num > target) match = true;
    else if (rule.op === '<' && num < target) match = true;
    else if (rule.op === '=' && num === target) match = true;
    else if (rule.op === '>=' && num >= target) match = true;
    else if (rule.op === '<=' && num <= target) match = true;
    if (match) return { color: rule.color, backgroundColor: rule.bgColor };
  }
  return {};
}

export default function PivotTable({ data = [], rowField, columnField, valueField, agg = 'sum', conditionalFormat = [], height }) {
  const { rows, columns, matrix, rowTotals, colTotals, grandTotal, tooLarge, rowCount, colCount } = useMemo(() => {
    if (!rowField || !columnField || !valueField || !data.length) {
      return { rows: [], columns: [], matrix: {}, rowTotals: {}, colTotals: {}, grandTotal: 0, tooLarge: false, rowCount: 0, colCount: 0 };
    }
    const rowSet = new Set();
    const colSet = new Set();
    const grouped = {};
    for (const r of data) {
      const rk = displayString(r[rowField]) || '—';
      const ck = displayString(r[columnField]) || '—';
      rowSet.add(rk);
      colSet.add(ck);
      const key = `${rk}\u0000${ck}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r[valueField]);
    }
    const rows = Array.from(rowSet).sort();
    const columns = Array.from(colSet).sort();
    if (rowSet.size * colSet.size > 10000) {
      return { rows: [], columns: [], matrix: {}, rowTotals: {}, colTotals: {}, grandTotal: 0, tooLarge: true, rowCount: rowSet.size, colCount: colSet.size };
    }
    const matrix = {};
    const rowTotals = {};
    const colTotals = {};
    let grandTotal = 0;
    for (const rk of rows) {
      matrix[rk] = {};
      for (const ck of columns) {
        const v = aggregate(grouped[`${rk}\u0000${ck}`] || [], agg);
        matrix[rk][ck] = v;
        rowTotals[rk] = (rowTotals[rk] || 0) + (Number(v) || 0);
        colTotals[ck] = (colTotals[ck] || 0) + (Number(v) || 0);
        grandTotal += Number(v) || 0;
      }
    }
    return { rows, columns, matrix, rowTotals, colTotals, grandTotal, tooLarge: false, rowCount: 0, colCount: 0 };
  }, [data, rowField, columnField, valueField, agg]);

  if (!rowField || !columnField || !valueField) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Pivot table requires rowField, columnField, and valueField.
        </Typography>
      </Box>
    );
  }

  if (tooLarge) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="error.main">
          Pivot table is too large to render ({rowCount.toLocaleString()} rows × {colCount.toLocaleString()} columns
          = {(rowCount * colCount).toLocaleString()} cells). Reduce your data using pipeline filters.
        </Typography>
      </Box>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: height || 500, height: height || undefined }}>
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            <TableCell>{rowField}</TableCell>
            {columns.map((c) => <TableCell key={c} align="right">{c}</TableCell>)}
            <TableCell align="right" sx={{ fontWeight: 700 }}>Total</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((rk) => (
            <TableRow key={rk}>
              <TableCell sx={{ fontWeight: 700 }}>{rk}</TableCell>
              {columns.map((ck) => {
                const v = matrix[rk][ck];
                const cf = applyConditionalFormat(v, conditionalFormat);
                return (
                  <TableCell key={ck} align="right" sx={cf}>
                    {v == null ? '' : (typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : v)}
                  </TableCell>
                );
              })}
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                {rowTotals[rk]?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell sx={{ fontWeight: 700, bgcolor: 'action.hover' }}>Total</TableCell>
            {columns.map((c) => (
              <TableCell key={c} align="right" sx={{ fontWeight: 700, bgcolor: 'action.hover' }}>
                {colTotals[c]?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </TableCell>
            ))}
            <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'action.hover' }}>
              {grandTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  );
}
