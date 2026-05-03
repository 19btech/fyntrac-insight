import React, { useState, useMemo, useEffect } from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TableSortLabel, TablePagination, Paper, Box, Button, Tooltip, Typography,
} from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { displayValue } from './_displayValue';
import { isHiddenColumn, formatByColumn } from './_columnRules';
import { formatValue } from './FormatStrip';

/**
 * Convert a column key to a stakeholder-friendly header.
 *   total_amount  -> "Total Amount"
 *   accountId     -> "Account Id"
 *   GLAccount     -> "GL Account"
 */
function humanizeHeader(key) {
  if (!key) return '';
  return String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** RFC 4180 escape for CSV cells. */
function csvCell(v) {
  const flat = displayValue(v);
  if (flat == null || flat === '') return '';
  const s = typeof flat === 'object' ? JSON.stringify(flat) : String(flat);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename, rows, cols) {
  const header = cols.map((c) => csvCell(humanizeHeader(c))).join(',');
  const body = rows.map((r) => cols.map((c) => {
    const flat = displayValue(r[c], c);
    const ruled = formatByColumn(c, flat);
    return csvCell(ruled !== undefined ? ruled : flat);
  }).join(',')).join('\n');
  // Prepend BOM so Excel detects UTF-8 correctly.
  const blob = new Blob(['\uFEFF', header, '\n', body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DataTable({
  data = [],
  columns = [],
  conditionalFormat = [],
  columnFormats = {},
  filename = 'report.csv',
  enableExport = true,
  columnOrder,
  onColumnOrderChange,
  defaultRowsPerPage = 15,
  dense = true,
  height,
}) {
  const [order, setOrder] = useState('asc');
  const [orderBy, setOrderBy] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(defaultRowsPerPage);
  const [dragCol, setDragCol] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  // Reset to page 1 whenever the data changes so the user never sees an empty
  // page 2+ after a step change produces fewer rows than before.
  useEffect(() => { setPage(0); }, [data]);

  const formatCell = (col, value) => {
    if (value == null) return {};
    for (const rule of conditionalFormat) {
      if (rule.column && rule.column !== col) continue;
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
  };

  const handleSort = (col) => {
    const isAsc = orderBy === col && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(col);
  };

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      if (!orderBy) return 0;
      const av = a[orderBy], bv = b[orderBy];
      if (av == null) return 1;
      if (bv == null) return -1;
      return order === 'asc' ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
    });
  }, [data, order, orderBy]);

  const paginated = sorted.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const rawColumns = columns.length > 0 ? columns : Object.keys(data[0] || {});
  // Honor UI filters: hide internal/system columns from the table AND from CSV export.
  const baseColumns = rawColumns.filter((c) => !String(c).startsWith('_') && !isHiddenColumn(c));
  // Apply user-defined column order. Any columns not yet in `columnOrder`
  // (e.g. brand-new aggregation aliases) get appended at the end so the
  // order persists even when the underlying schema changes.
  const displayColumns = (() => {
    if (!Array.isArray(columnOrder) || columnOrder.length === 0) return baseColumns;
    const known = new Set(baseColumns);
    const ordered = columnOrder.filter((c) => known.has(c));
    const seen = new Set(ordered);
    return [...ordered, ...baseColumns.filter((c) => !seen.has(c))];
  })();

  const reorderable = typeof onColumnOrderChange === 'function';

  // HTML5 drag handlers — reorders columns by dragging a header onto another.
  const handleDragStart = (col) => (e) => {
    setDragCol(col);
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', col); } catch (_) { /* noop */ }
  };
  const handleDragOver = (col) => (e) => {
    if (!dragCol || dragCol === col) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== col) setDragOverCol(col);
  };
  const handleDragLeave = () => setDragOverCol(null);
  const handleDrop = (target) => (e) => {
    e.preventDefault();
    const src = dragCol;
    setDragCol(null); setDragOverCol(null);
    if (!src || src === target) return;
    const next = [...displayColumns];
    const fromIdx = next.indexOf(src);
    const toIdx = next.indexOf(target);
    if (fromIdx === -1 || toIdx === -1) return;
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, src);
    onColumnOrderChange(next);
  };
  const handleDragEnd = () => { setDragCol(null); setDragOverCol(null); };

  const handleExportCsv = () => {
    // Export everything the user can currently see — sorted + filtered, but
    // ignoring pagination so they get the full result set (not just one page).
    downloadCsv(filename, sorted, displayColumns);
  };

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, height: height || 'auto', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      {data.length > 10000 && (
        <Box sx={{ px: 2, py: 0.75, bgcolor: '#fffbeb', borderBottom: 1, borderColor: '#fde68a' }}>
          <Typography variant="caption" sx={{ color: '#92400e' }}>
            Large dataset: {data.length.toLocaleString()} rows loaded. Use the MongoDB “Sort &amp; Limit” step to reduce result size for best performance.
          </Typography>
        </Box>
      )}
      {enableExport && data.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1, py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
          <Tooltip title="Export the current table (sorted, all rows) as CSV">
            <span>
              <Button
                size="small"
                variant="text"
                startIcon={<FileDownloadIcon fontSize="small" />}
                onClick={handleExportCsv}
                disabled={data.length === 0}
              >
                Download as CSV
              </Button>
            </span>
          </Tooltip>
        </Box>
      )}
      <TableContainer sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {displayColumns.map((col) => (
                <TableCell
                  key={col}
                  draggable={reorderable}
                  onDragStart={reorderable ? handleDragStart(col) : undefined}
                  onDragOver={reorderable ? handleDragOver(col) : undefined}
                  onDragLeave={reorderable ? handleDragLeave : undefined}
                  onDrop={reorderable ? handleDrop(col) : undefined}
                  onDragEnd={reorderable ? handleDragEnd : undefined}
                  sx={reorderable ? {
                    cursor: 'grab',
                    userSelect: 'none',
                    backgroundColor: dragOverCol === col ? 'action.hover' : undefined,
                    opacity: dragCol === col ? 0.5 : 1,
                    borderLeft: dragOverCol === col ? '2px solid' : undefined,
                    borderLeftColor: 'primary.main',
                  } : undefined}
                  title={reorderable ? 'Drag to reorder column' : undefined}
                >
                  <TableSortLabel
                    active={orderBy === col}
                    direction={orderBy === col ? order : 'asc'}
                    onClick={() => handleSort(col)}
                  >
                    {humanizeHeader(col)}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginated.map((row, i) => (
              <TableRow key={i} hover>
                {displayColumns.map((col) => {
                  const raw = displayValue(row[col], col);
                  const text = formatValue(raw, columnFormats[col], col);
                  return (
                    <TableCell key={col} sx={formatCell(col, raw)}>
                      {text}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={data.length}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[15, 25, 50, 100]}
        sx={dense ? {
          '& .MuiTablePagination-toolbar': { minHeight: 36, px: 1 },
          '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': { fontSize: 12, my: 0 },
          '& .MuiTablePagination-select': { fontSize: 12, py: 0 },
          '& .MuiTablePagination-actions .MuiIconButton-root': { p: 0.5 },
        } : undefined}
      />
    </Paper>
  );
}
