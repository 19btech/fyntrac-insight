import React, { useMemo } from 'react';
import { Box, Typography, Button, CircularProgress, Chip, Paper, Stack, Divider } from '@mui/material';
import { DataGrid, GridPagination } from '@mui/x-data-grid';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import BoltIcon from '@mui/icons-material/Bolt';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import TableRowsOutlinedIcon from '@mui/icons-material/TableRowsOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';

const PAGE_SIZE = 100;

/**
 * Dynamic results grid. Columns are derived from the query result; paging is
 * server-side (each page re-runs the query with a new offset). The footer
 * shows total row count, execution time, an Export-CSV button, and the pager.
 */
export default function ResultsGrid({ result, loading, error, sortModel, onSortChange, onPageChange, onExport, exporting }) {
  const columns = useMemo(
    () =>
      (result?.columns || []).map((c) => ({
        field: c,
        headerName: c,
        // Fixed initial width (no flex) so many/wide columns overflow and the
        // grid scrolls horizontally instead of squashing every column to fit.
        width: 180,
        sortable: true,
        resizable: true,
        renderCell: (params) => formatCell(params.value),
      })),
    [result?.columns]
  );

  const rows = useMemo(() => {
    if (!result?.rows) return [];
    const base = (result.page || 0) * (result.pageSize || PAGE_SIZE);
    return result.rows.map((r, i) => ({ _id: base + i, ...r }));
  }, [result]);

  const Footer = () => (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 0.75,
        borderTop: '1px solid #e2e8f0', bgcolor: '#fafbfc', minHeight: 48, overflow: 'hidden',
        // TablePagination defaults to overflow:auto, which shows a stray
        // scrollbar inside this compact bar — clip it.
        '& .MuiTablePagination-root': { fontSize: '0.75rem', color: '#64748b', overflow: 'hidden' },
        '& .MuiTablePagination-toolbar': { minHeight: 40, overflow: 'hidden' },
        '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': { fontSize: '0.75rem', mb: 0 },
      }}
    >
      {result && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.5}
          divider={<Divider orientation="vertical" flexItem sx={{ my: 0.75, borderColor: '#e2e8f0' }} />}
        >
          <Chip
            size="small"
            variant="outlined"
            icon={<TableRowsOutlinedIcon sx={{ fontSize: 15 }} />}
            label={`${result.rowCount.toLocaleString()} rows`}
            sx={{ height: 24, borderRadius: 1.5, bgcolor: '#eef2ff', borderColor: '#c7d2fe', color: '#4338ca', fontWeight: 600, fontSize: '0.72rem', '& .MuiChip-icon': { color: '#6366f1' } }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#16a34a' }}>
            <BoltIcon sx={{ fontSize: 15 }} />
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 600 }}>{result.executionTime} ms</Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            startIcon={exporting ? <CircularProgress size={13} /> : <FileDownloadOutlinedIcon sx={{ fontSize: 16 }} />}
            onClick={onExport}
            disabled={exporting || result.rowCount === 0}
            sx={{
              textTransform: 'none', fontSize: '0.72rem', fontWeight: 600, borderRadius: 2, py: 0.25,
              color: '#4f46e5', borderColor: '#c7d2fe', bgcolor: '#fff',
              '&:hover': { bgcolor: '#eef2ff', borderColor: '#a5b4fc' },
            }}
          >
            Export CSV
          </Button>
        </Stack>
      )}
      <Box sx={{ flex: 1 }} />
      <GridPagination />
    </Box>
  );

  if (error) {
    return (
      <Box sx={{ p: 3, display: 'flex', alignItems: 'flex-start', gap: 1.5, color: '#dc2626' }}>
        <ErrorOutlineIcon sx={{ fontSize: 20, mt: 0.2 }} />
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', mb: 0.5 }}>Query error</Typography>
          <Typography sx={{ fontSize: '0.82rem', fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap' }}>
            {error}
          </Typography>
        </Box>
      </Box>
    );
  }

  if (!result && !loading) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
        <Paper
          elevation={0}
          sx={{
            width: '100%', textAlign: 'center', py: 6, px: 5, borderRadius: 4,
            border: '1px dashed #cbd5e1', bgcolor: '#fff',
            animation: 'fyntrac-empty-in 0.45s ease both',
            '@keyframes fyntrac-empty-in': {
              '0%': { opacity: 0, transform: 'translateY(10px)' },
              '100%': { opacity: 1, transform: 'translateY(0)' },
            },
          }}
        >
          <Stack alignItems="center" spacing={1.5}>
            <Box
              sx={{
                width: 64, height: 64, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f1f5f9',
                animation: 'fyntrac-empty-float 2.6s ease-in-out infinite',
                '@keyframes fyntrac-empty-float': {
                  '0%, 100%': { transform: 'translateY(0)' },
                  '50%': { transform: 'translateY(-6px)' },
                },
              }}
            >
              <PlayCircleOutlineIcon sx={{ fontSize: 32, color: '#94A3B8' }} />
            </Box>
            <Typography sx={{ fontFamily: 'Inter', fontSize: '1rem', fontWeight: 600, color: '#64748B' }}>
              No results yet
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'Inter', fontSize: '0.875rem', color: '#94A3B8', maxWidth: 380 }}>
              Write a SQL query in the editor above and run it with the Run button or <b>⌘/Ctrl + Enter</b> to see results here.
            </Typography>
          </Stack>
        </Paper>
      </Box>
    );
  }

  return (
    <DataGrid
      rows={rows}
      columns={columns}
      getRowId={(r) => r._id}
      loading={loading}
      paginationMode="server"
      rowCount={result?.rowCount || 0}
      paginationModel={{ page: result?.page || 0, pageSize: result?.pageSize || PAGE_SIZE }}
      onPaginationModelChange={(m) => onPageChange(m.page)}
      pageSizeOptions={[result?.pageSize || PAGE_SIZE]}
      sortingMode="server"
      sortModel={sortModel}
      onSortModelChange={onSortChange}
      disableColumnMenu
      disableRowSelectionOnClick
      density="compact"
      slots={{ footer: Footer }}
      sx={{
        border: 'none',
        height: '100%',
        // Breathing room so the first column isn't flush against the side panel.
        '& .MuiDataGrid-columnHeaders, & .MuiDataGrid-virtualScroller, & .MuiDataGrid-footerContainer': { pl: 1 },
        // Subtle gridlines.
        '--DataGrid-rowBorderColor': '#eef2f6',
        '& .MuiDataGrid-columnHeaders': { bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' },
        // More horizontal padding inside each cell/header so text isn't cramped.
        '& .MuiDataGrid-columnHeader': { borderRight: '1px solid #eef2f6', px: 1.75 },
        '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 700, fontSize: '0.75rem', color: '#334155' },
        '& .MuiDataGrid-columnHeader:hover .MuiDataGrid-columnHeaderTitle': { color: '#4f46e5' },
        '& .MuiDataGrid-cell': { fontSize: '0.78rem', fontFamily: 'ui-monospace, monospace', color: '#1e293b', borderRight: '1px solid #f1f5f9', px: 1.75 },
        // Keep the resize handle (column separator) — visible on hover so columns
        // can be dragged wider/narrower, but unobtrusive otherwise.
        '& .MuiDataGrid-columnSeparator': { color: 'transparent' },
        '& .MuiDataGrid-columnHeader:hover .MuiDataGrid-columnSeparator': { color: '#cbd5e1' },
        '& .MuiDataGrid-columnSeparator:hover': { color: '#6366f1' },
        '& .MuiDataGrid-sortIcon': { color: '#6366f1' },
      }}
    />
  );
}

// Matches an ISO date / datetime string, capturing the date part and the
// hour/min/sec so we can show plain `YYYY-MM-DD` for pure dates (midnight) and
// trim the noisy `.000Z` off real timestamps.
const ISO_DATE_RX = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function formatCell(v) {
  if (v === null || v === undefined) return <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>null</span>;
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'string') {
    const m = ISO_DATE_RX.exec(v);
    if (m) {
      const [, date, hh, mm, ss] = m;
      // Pure date (no time, or midnight) -> YYYY-MM-DD; otherwise keep a clean time.
      if (!hh || (hh === '00' && mm === '00' && ss === '00')) return date;
      return `${date} ${hh}:${mm}${ss !== '00' ? `:${ss}` : ''}`;
    }
    return v;
  }
  return String(v);
}
