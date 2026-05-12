import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Grid, Card, CardContent, Table, TableHead, TableBody,
  TableRow, TableCell, TablePagination, MenuItem, Select, FormControl,
  InputLabel, TextField, Stack, CircularProgress, Alert, Fade,
} from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { BarChart } from '@mui/x-charts/BarChart';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import PeopleIcon from '@mui/icons-material/People';
import BoltIcon from '@mui/icons-material/Bolt';
import TodayIcon from '@mui/icons-material/Today';
import api from '../hooks/useQuery';

// Design-token palette — synced with metabaseTheme.js / theme.ts
const INDIGO      = '#6366f1'; // tokens.brand.indigo
const INDIGO_DARK = '#4f46e5'; // tokens.brand.indigoDark
const INDIGO_BG   = '#eef2ff'; // tokens.brand.indigoBg
const GREEN       = '#10b981'; // tokens.brand.green
const GREEN_BG    = '#d1fae5'; // tokens.brand.greenBg
const AMBER       = '#f59e0b'; // tokens.brand.amber
const AMBER_BG    = '#fef3c7'; // tokens.brand.amberBg
const RED         = '#ef4444'; // tokens.brand.red
const RED_BG      = '#fee2e2'; // tokens.brand.redBg
const PURPLE      = '#a855f7'; // tokens.brand.purple
const PURPLE_BG   = '#f3e8ff'; // tokens.brand.purpleBg
const SLATE_50    = '#f8fafc'; // tokens.brand.slate50
const SLATE_200   = '#e2e8f0'; // tokens.brand.slate200
const SLATE_500   = '#64748b'; // tokens.brand.slate500
const SLATE_700   = '#334155'; // tokens.brand.slate700
const SLATE_900   = '#0f172a'; // tokens.brand.slate900

const ACTION_CONFIG = {
  'query.run':      { bgcolor: INDIGO_BG,  color: INDIGO_DARK, border: '#bfdbfe'  },
  'dashboard.view': { bgcolor: GREEN_BG,   color: '#15803d',   border: '#bbf7d0'  },
  'question.view':  { bgcolor: AMBER_BG,   color: '#b45309',   border: '#fde68a'  },
  'metric.evaluate':{ bgcolor: RED_BG,     color: RED,         border: '#fecaca'  },
  'question.save':  { bgcolor: PURPLE_BG,  color: '#7c3aed',   border: '#ddd6fe'  },
  'metric.create':  { bgcolor: GREEN_BG,   color: '#15803d',   border: '#bbf7d0'  },
  default:          { bgcolor: SLATE_50,   color: SLATE_500,   border: SLATE_200  },
};

// Map raw action/resource identifiers to user-facing display labels.
const ACTION_DISPLAY_LABEL = {
  'query.run': 'query.run',
  'dashboard.view': 'dashboard.view',
  'question.view': 'report.view',
  'question.save': 'report.save',
  'metric.evaluate': 'kpi.evaluate',
  'metric.create': 'kpi.create',
};

const RESOURCE_DISPLAY_LABEL = {
  dashboard: 'Dashboard',
  question: 'Report',
  metric: 'KPI',
  collection: 'Collection',
};

const STAT_ACCENTS = [INDIGO, GREEN, PURPLE, AMBER];
const STAT_ICONS   = [BoltIcon, PeopleIcon, QueryStatsIcon, TodayIcon];

function StatCard({ label, value, accent, IconComp, delay }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <Fade in={show} timeout={500}>
      <Card variant="outlined" sx={{
        borderRadius: 2,
        border: '1px solid #e2e8f0',
        borderTop: `3px solid ${accent}`,
        boxShadow: 'none',
        transition: 'box-shadow 0.2s',
        '&:hover': { boxShadow: '0 4px 16px rgba(0,0,0,0.08)' },
      }}>
        <CardContent sx={{ pb: '16px !important' }}>
          <Stack direction="row" alignItems="flex-start" spacing={1.5}>
            <Box sx={{
              width: 36, height: 36, borderRadius: 1.5, flexShrink: 0,
              bgcolor: `${accent}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <IconComp sx={{ fontSize: 18, color: accent }} />
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary" fontWeight={500}>{label}</Typography>
              <Typography variant="h5" fontWeight={700} sx={{ color: SLATE_900, lineHeight: 1.2, mt: 0.25 }}>
                {value ?? '—'}
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Fade>
  );
}

function ChartCard({ title, children, delay }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <Fade in={show} timeout={500}>
      <Card variant="outlined" sx={{
        borderRadius: 2, border: '1px solid #e2e8f0',
        boxShadow: 'none', height: '100%',
        transition: 'box-shadow 0.2s',
        '&:hover': { boxShadow: '0 4px 16px rgba(0,0,0,0.08)' },
      }}>
        <CardContent>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, color: SLATE_900 }}>
            {title}
          </Typography>
          {children}
        </CardContent>
      </Card>
    </Fade>
  );
}

export default function AdminPage() {
  const [summary, setSummary] = useState(null);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage] = useState(50);
  const [filterAction, setFilterAction] = useState('');
  const [filterResourceType, setFilterResourceType] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [error, setError] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    setLoadingSummary(true);
    api.get('/admin/audit/summary')
      .then((r) => setSummary(r.data))
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoadingSummary(false));
  }, []);

  const loadLogs = useCallback(() => {
    setLoadingLogs(true);
    const params = new URLSearchParams({ skip: page * rowsPerPage, limit: rowsPerPage });
    if (filterAction) params.set('action', filterAction);
    if (filterResourceType) params.set('resourceType', filterResourceType);
    if (filterFrom) params.set('from', filterFrom);
    if (filterTo) params.set('to', filterTo);
    api.get(`/admin/audit?${params}`)
      .then((r) => { setLogs(r.data.logs); setTotal(r.data.total); })
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoadingLogs(false));
  }, [page, rowsPerPage, filterAction, filterResourceType, filterFrom, filterTo]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const topActionsRaw = summary?.topActions    || [];
  const activeUsers   = summary?.activeUsers   || [];
  const dailyActivity = summary?.dailyActivity || [];
  // Re-label raw action ids to friendly names for chart display.
  const topActions = topActionsRaw.map((a) => ({
    ...a,
    _id: ACTION_DISPLAY_LABEL[a._id] ?? a._id,
  }));
  const totalActions  = topActionsRaw.reduce((s, a) => s + a.count, 0);
  const peakDay       = dailyActivity.length
    ? dailyActivity.reduce((a, b) => (a.count > b.count ? a : b))._id
    : '—';

  const statCards = [
    { label: 'Total actions (30d)', value: totalActions.toLocaleString() },
    { label: 'Active users (30d)',   value: activeUsers.length },
    { label: 'Most common action',   value: ACTION_DISPLAY_LABEL[topActions[0]?._id] ?? topActions[0]?._id ?? '—' },
    { label: 'Peak day',             value: peakDay },
  ];

  return (
    <Fade in={mounted} timeout={300}>
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        {/* Page header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: 2, bgcolor: INDIGO_BG,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <QueryStatsIcon sx={{ fontSize: 20, color: INDIGO_DARK }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700} sx={{ color: SLATE_900 }}>Usage Analytics</Typography>
            <Typography variant="body2" color="text.secondary">Last 30 days · tenant-scoped audit log</Typography>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loadingSummary ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {/* Stat cards */}
            <Grid container spacing={2} sx={{ mb: 2.5 }}>
              {statCards.map(({ label, value }, i) => (
                <Grid key={label} size={{ xs: 12, sm: 6, md: 3 }}>
                  <StatCard
                    label={label}
                    value={value}
                    accent={STAT_ACCENTS[i]}
                    IconComp={STAT_ICONS[i]}
                    delay={i * 80}
                  />
                </Grid>
              ))}
            </Grid>

            {/* Charts row 1 */}
            <Grid container spacing={2} sx={{ mb: 2.5 }}>
              <Grid size={{ xs: 12, md: 8 }}>
                <ChartCard title="Daily Activity" delay={320}>
                  <LineChart
                    dataset={dailyActivity}
                    xAxis={[{ dataKey: '_id', scaleType: 'point', tickLabelStyle: { fontSize: 11, fill: SLATE_500 } }]}
                    yAxis={[{ tickLabelStyle: { fontSize: 11, fill: SLATE_500 } }]}
                    series={[{ dataKey: 'count', label: 'Activity', color: INDIGO, showMark: false, curve: 'monotoneX' }]}
                    height={220}
                    margin={{ top: 16, right: 16, bottom: 32, left: 48 }}
                    grid={{ horizontal: true }}
                  />
                </ChartCard>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <ChartCard title="Top Actions" delay={400}>
                  <BarChart
                    dataset={topActions.slice(0, 8)}
                    layout="horizontal"
                    yAxis={[{ dataKey: '_id', scaleType: 'band', tickLabelStyle: { fontSize: 11, fill: SLATE_500 } }]}
                    xAxis={[{ tickLabelStyle: { fontSize: 11, fill: SLATE_500 } }]}
                    series={[{ dataKey: 'count', label: 'Count', color: PURPLE }]}
                    height={220}
                    margin={{ top: 8, right: 16, bottom: 32, left: 96 }}
                    grid={{ vertical: true }}
                    borderRadius={4}
                    slotProps={{ legend: { hidden: true } }}
                  />
                </ChartCard>
              </Grid>
            </Grid>

            {/* Charts row 2 */}
            <Grid container spacing={2} sx={{ mb: 2.5 }}>
              <Grid size={{ xs: 12, md: 4 }}>
                <ChartCard title="Most Active Users" delay={480}>
                  {activeUsers.slice(0, 8).map((u, i) => (
                    <Box
                      key={u._id}
                      sx={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        py: 0.75,
                        borderBottom: i < Math.min(activeUsers.length, 8) - 1 ? '1px solid #f1f5f9' : 'none',
                      }}
                    >
                      <Typography variant="body2" noWrap sx={{ maxWidth: '75%', color: SLATE_700 }}>
                        {u._id || 'anonymous'}
                      </Typography>
                      <Box component="span" sx={{
                        px: 1, py: 0.25, borderRadius: 1,
                        bgcolor: INDIGO_BG, color: INDIGO_DARK, border: '1px solid #c7d2fe',
                        fontSize: '0.7rem', fontWeight: 600,
                      }}>
                        {u.count}
                      </Box>
                    </Box>
                  ))}
                  {activeUsers.length === 0 && (
                    <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 3 }}>
                      No data yet.
                    </Typography>
                  )}
                </ChartCard>
              </Grid>
              <Grid size={{ xs: 12, md: 8 }}>
                <ChartCard title="Avg Query Execution Time (ms)" delay={560}>
                  {(() => {
                    const rows = (summary?.avgExecTime || []).map((d) => ({
                      action: ACTION_DISPLAY_LABEL[d._id] ?? d._id,
                      avgMs: Math.round(d.avgMs),
                    }));
                    return (
                      <BarChart
                        height={220}
                        dataset={rows}
                        xAxis={[{ scaleType: 'band', dataKey: 'action', tickLabelStyle: { fontSize: 10, fill: SLATE_500, angle: -30, textAnchor: 'end' } }]}
                        yAxis={[{ tickLabelStyle: { fontSize: 11, fill: SLATE_500 } }]}
                        series={[{ dataKey: 'avgMs', color: GREEN, valueFormatter: (v) => `${v} ms` }]}
                        margin={{ top: 8, right: 16, bottom: 56, left: 48 }}
                      />
                    );
                  })()}
                </ChartCard>
              </Grid>
            </Grid>
          </>
        )}

        {/* Audit log table */}
        <Fade in={!loadingSummary} timeout={500}>
          <Card variant="outlined" sx={{ borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
            <Box sx={{
              px: 2.5, py: 1.5, borderBottom: '1px solid #e2e8f0',
              display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#fff',
            }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ color: SLATE_900 }}>Audit Log</Typography>
            </Box>

            {/* Filters */}
            <Box sx={{ p: 2, borderBottom: '1px solid #f1f5f9' }}>
              <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1 }}>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel>Action</InputLabel>
                  <Select value={filterAction} label="Action" onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}>
                    <MenuItem value="">All</MenuItem>
                    {['query.run', 'dashboard.view', 'question.view', 'question.save', 'metric.evaluate', 'metric.create'].map((a) => (
                      <MenuItem key={a} value={a}>{ACTION_DISPLAY_LABEL[a] || a}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>Resource</InputLabel>
                  <Select value={filterResourceType} label="Resource" onChange={(e) => { setFilterResourceType(e.target.value); setPage(0); }}>
                    <MenuItem value="">All</MenuItem>
                    {['dashboard', 'question', 'metric', 'collection'].map((r) => (
                      <MenuItem key={r} value={r}>{RESOURCE_DISPLAY_LABEL[r] || r}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField size="small" label="From" type="date" value={filterFrom}
                  onChange={(e) => { setFilterFrom(e.target.value); setPage(0); }}
                  InputLabelProps={{ shrink: true }} />
                <TextField size="small" label="To" type="date" value={filterTo}
                  onChange={(e) => { setFilterTo(e.target.value); setPage(0); }}
                  InputLabelProps={{ shrink: true }} />
              </Stack>
            </Box>

            {loadingLogs ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
                <CircularProgress size={28} />
              </Box>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: SLATE_50 }}>
                    {['Timestamp', 'Action', 'User', 'Resource', 'Exec (ms)'].map((h) => (
                      <TableCell key={h} sx={{ fontWeight: 700, color: SLATE_500, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {logs.map((log) => {
                    const cfg = ACTION_CONFIG[log.action] || ACTION_CONFIG.default;
                    return (
                      <TableRow key={log._id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                        <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'text.secondary' }}>
                          {new Date(log.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Box component="span" sx={{
                            display: 'inline-flex', alignItems: 'center',
                            px: 1, py: 0.25, fontSize: '0.7rem', fontWeight: 600, borderRadius: 1,
                            bgcolor: cfg.bgcolor, color: cfg.color, border: `1px solid ${cfg.border}`,
                          }}>
                            {ACTION_DISPLAY_LABEL[log.action] || log.action}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', color: SLATE_700 }}>
                          {log.userId || '—'}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                          {log.resourceType
                            ? `${log.resourceType}${log.resourceId ? ` · ${String(log.resourceId).slice(-6)}` : ''}`
                            : '—'}
                        </TableCell>
                        <TableCell sx={{
                          fontSize: '0.8rem',
                          fontWeight: log.executionTimeMs > 500 ? 700 : 400,
                          color: log.executionTimeMs > 500 ? RED : 'text.secondary',
                        }}>
                          {log.executionTimeMs != null ? `${log.executionTimeMs} ms` : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {logs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                        No audit log entries found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}

            <TablePagination
              component="div"
              count={total}
              page={page}
              rowsPerPage={rowsPerPage}
              rowsPerPageOptions={[50]}
              onPageChange={(_, p) => setPage(p)}
            />
          </Card>
        </Fade>
      </Box>
    </Fade>
  );
}
