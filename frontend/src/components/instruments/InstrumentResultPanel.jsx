import React, { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import {
  Box, Paper, Stack, Typography, Chip, Button, Divider, Alert, CircularProgress, Tooltip,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
import BarChartIcon from '@mui/icons-material/BarChartOutlined';
import TableViewIcon from '@mui/icons-material/TableViewOutlined';

// The charting bundle is large and only a report source needs it, so keep it
// out of the browser's initial chunk.
const ChartRenderer = lazy(() => import('../charts/ChartRenderer'));
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import BoltIcon from '@mui/icons-material/Bolt';
import TableRowsOutlinedIcon from '@mui/icons-material/TableRowsOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonthOutlined';
import FingerprintIcon from '@mui/icons-material/FingerprintOutlined';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import ScienceIcon from '@mui/icons-material/ScienceOutlined';
import TableChartIcon from '@mui/icons-material/TableChartOutlined';

const ACCENT = '#4f46e5';

/**
 * Renders a cell value. Mongo returns extended-JSON wrappers for some BSON
 * types, so unwrap those rather than showing "[object Object]".
 */
function formatCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v.$date !== undefined) {
      const d = new Date(v.$date);
      return Number.isNaN(d.getTime()) ? String(v.$date) : d.toISOString().slice(0, 10);
    }
    if (v.$numberDecimal !== undefined) return v.$numberDecimal;
    if (v.$oid !== undefined) return v.$oid;
    return JSON.stringify(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

function toCsv(columns, rows) {
  const esc = (v) => {
    const s = formatCell(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    columns.join(','),
    ...rows.map((r) => columns.map((c) => esc(r[c])).join(',')),
  ].join('\n');
}

function EmptyState({ icon, title, body }) {
  return (
    <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ py: 9, px: 3, textAlign: 'center' }}>
      <Box
        sx={{
          width: 52, height: 52, borderRadius: '16px', bgcolor: '#f1f5f9',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8',
        }}
      >
        {icon}
      </Box>
      <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: 'text.primary' }}>{title}</Typography>
      <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', maxWidth: 420 }}>{body}</Typography>
    </Stack>
  );
}

export default function InstrumentResultPanel({ source, state, instrumentId, period, periodMode }) {
  const columns = useMemo(
    () =>
      (state?.columns || []).map((c) => ({
        field: c,
        headerName: c,
        width: 170,
        sortable: true,
        resizable: true,
        valueGetter: (value) => formatCell(value),
      })),
    [state?.columns]
  );

  const rows = useMemo(
    () => (state?.rows || []).map((r, i) => ({ ...r, __rowId: i })),
    [state?.rows]
  );

  const exportCsv = () => {
    const csv = toCsv(state.columns || [], state.rows || []);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const datePart = period ? `_${period}` : '';
    a.download = `${source.label.replace(/\s+/g, '_')}_${instrumentId}${datePart}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isDataset = source?.sourceType === 'dataset';
  const isPeriodMode = periodMode === 'accountingPeriod';

  // A report carries its own visualization. Honour it here rather than always
  // showing a grid — a report saved as a bar chart should browse as a bar chart.
  const savedChartType = source?.chartConfig?.chartType;
  const hasChart = !!savedChartType && savedChartType !== 'table';
  const chartConfig = source?.chartConfig || {};
  const [view, setView] = useState(hasChart ? 'chart' : 'table');

  // Selecting a different source starts from that source's own presentation.
  useEffect(() => {
    setView(hasChart ? 'chart' : 'table');
  }, [source?._id, hasChart]);

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: '16px', border: '1px solid', borderColor: 'divider',
        overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 420,
      }}
    >
      {/* ── Context header ── */}
      <Box sx={{ px: 2.5, py: 2 }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box sx={{ color: ACCENT, display: 'flex' }}>
                {isDataset ? <ScienceIcon sx={{ fontSize: 18 }} /> : <TableChartIcon sx={{ fontSize: 18 }} />}
              </Box>
              <Typography noWrap sx={{ fontSize: '1rem', fontWeight: 700 }}>
                {source.label}
              </Typography>
            </Stack>
            {source.description && (
              <Typography noWrap sx={{ fontSize: '0.78rem', color: 'text.secondary', mt: 0.25 }}>
                {source.description}
              </Typography>
            )}
          </Box>

          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
            {hasChart && (
              <ToggleButtonGroup
                exclusive
                size="small"
                value={view}
                onChange={(_e, v) => v && setView(v)}
                sx={{
                  mr: 0.5,
                  '& .MuiToggleButton-root': {
                    px: 1, py: 0.35, borderRadius: '8px', textTransform: 'none',
                    fontSize: '0.72rem', fontWeight: 600,
                    '&.Mui-selected': { bgcolor: '#eef2ff', color: '#4338ca' },
                  },
                }}
              >
                <ToggleButton value="chart"><BarChartIcon sx={{ fontSize: 15, mr: 0.5 }} />Chart</ToggleButton>
                <ToggleButton value="table"><TableViewIcon sx={{ fontSize: 15, mr: 0.5 }} />Table</ToggleButton>
              </ToggleButtonGroup>
            )}
            <Chip
              size="small"
              icon={<FingerprintIcon sx={{ fontSize: 14 }} />}
              label={instrumentId}
              sx={{
                height: 26, borderRadius: '8px', fontWeight: 700, fontSize: '0.75rem',
                bgcolor: '#eef2ff', color: '#4338ca', '& .MuiChip-icon': { color: ACCENT },
              }}
            />
            <Chip
              size="small"
              icon={isPeriodMode ? <CalendarMonthIcon sx={{ fontSize: 14 }} /> : <EventOutlinedIcon sx={{ fontSize: 14 }} />}
              label={period || (isPeriodMode ? 'All periods' : 'All posting dates')}
              variant={period ? 'filled' : 'outlined'}
              sx={{
                height: 26, borderRadius: '8px', fontWeight: 600, fontSize: '0.75rem',
                ...(period
                  ? { bgcolor: '#fef3c7', color: '#92400e', '& .MuiChip-icon': { color: '#f59e0b' } }
                  : { color: 'text.secondary' }),
              }}
            />
          </Stack>
        </Stack>
      </Box>

      <Divider />

      {/* ── Body ── */}
      {state?.loading ? (
        <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ py: 10 }}>
          <CircularProgress size={26} />
          <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
            Running {source.label}…
          </Typography>
        </Stack>
      ) : state?.error ? (
        <Box sx={{ p: 2.5 }}>
          <Alert severity="error" sx={{ borderRadius: '12px' }}>
            {state.error}
          </Alert>
        </Box>
      ) : !state ? (
        <EmptyState
          icon={<TableRowsOutlinedIcon />}
          title="Not run yet"
          body="Search an instrument ID above to populate this source."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<SearchOffOutlinedIcon />}
          title="No rows for this instrument"
          body={
            period
              ? `${source.label} has no rows for ${instrumentId} ${isPeriodMode ? 'in' : 'on'} ${period}. Clear the ${isPeriodMode ? 'period' : 'date'} to look across all of them.`
              : `${source.label} has no rows for ${instrumentId} in any period.`
          }
        />
      ) : (
        <>
          {hasChart && view === 'chart' ? (
            // Browsing, not editing: `controls="external"` drops ChartRenderer's
            // type picker / format chips / axis pickers, and omitting
            // onConfigChange puts it in embedded mode so it measures this box
            // and fills it instead of overflowing a fixed height.
            <Box sx={{ height: 340, px: 2.5, pt: 2, pb: 1, minHeight: 0 }}>
              <Suspense fallback={(
                <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
                  <CircularProgress size={22} />
                </Stack>
              )}>
                <ChartRenderer
                  data={state.rows}
                  columns={state.columns}
                  config={chartConfig}
                  controls="external"
                />
              </Suspense>
            </Box>
          ) : (
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <DataGrid
              rows={rows}
              columns={columns}
              getRowId={(r) => r.__rowId}
              density="compact"
              disableRowSelectionOnClick
              initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
              pageSizeOptions={[25, 50, 100]}
              sx={{
                border: 0,
                '& .MuiDataGrid-columnHeaders': { bgcolor: '#f8fafc' },
                '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 700, fontSize: '0.75rem' },
                '& .MuiDataGrid-cell': { fontSize: '0.8125rem' },
              }}
              autoHeight
            />
          </Box>
          )}

          <Divider />
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.5}
            sx={{ px: 2, py: 1, bgcolor: '#fafbfc' }}
            divider={<Divider orientation="vertical" flexItem sx={{ my: 0.75 }} />}
          >
            <Chip
              size="small"
              variant="outlined"
              icon={<TableRowsOutlinedIcon sx={{ fontSize: 15 }} />}
              label={`${rows.length.toLocaleString()} rows`}
              sx={{
                height: 24, borderRadius: 1.5, bgcolor: '#eef2ff', borderColor: '#c7d2fe',
                color: '#4338ca', fontWeight: 600, fontSize: '0.72rem', '& .MuiChip-icon': { color: '#6366f1' },
              }}
            />
            {state.executionTime !== undefined && (
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: '#16a34a' }}>
                <BoltIcon sx={{ fontSize: 15 }} />
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 600 }}>{state.executionTime} ms</Typography>
              </Stack>
            )}
            {state.pushedDown && (
              <Tooltip title="The instrument filter ran against the collection, so an index on it can be used">
                <Chip size="small" label="Indexed scan" sx={{ height: 22, borderRadius: 1.5, bgcolor: '#d1fae5', color: '#065f46', fontWeight: 600, fontSize: '0.7rem' }} />
              </Tooltip>
            )}
            {state.truncated && (
              <Tooltip title="Only the first rows are shown. Narrow the search with a posting date.">
                <Chip
                  size="small"
                  label="Truncated"
                  sx={{ height: 22, borderRadius: 1.5, bgcolor: '#fef3c7', color: '#92400e', fontWeight: 600, fontSize: '0.7rem' }}
                />
              </Tooltip>
            )}
            <Box sx={{ flex: 1 }} />
            <Button
              size="small"
              startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: 16 }} />}
              onClick={exportCsv}
              sx={{ fontSize: '0.75rem', fontWeight: 600, borderRadius: '8px' }}
            >
              Export CSV
            </Button>
          </Stack>
        </>
      )}
    </Paper>
  );
}
