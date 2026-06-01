import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Stack, Typography, Tabs, Tab, Chip, Card, CardContent, Table, TableHead,
  TableRow, TableCell, TableBody, Button, Alert, LinearProgress, Tooltip, IconButton,
} from '@mui/material';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import DownloadIcon from '@mui/icons-material/Download';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import api from '../hooks/useQuery';

const STATUS = [
  { key: 'matched',    label: 'Matched',     color: 'success' },
  { key: 'mismatched', label: 'Mismatched',  color: 'warning' },
  { key: 'only_a',     label: 'Only in A',   color: 'default' },
  { key: 'only_b',     label: 'Only in B',   color: 'default' },
];

function fmtNum(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function Delta({ a, b }) {
  const d = (Number(b) || 0) - (Number(a) || 0);
  const color = d === 0 ? 'text.secondary' : (d > 0 ? '#16a34a' : '#dc2626');
  const Icon = d === 0 ? null : (d > 0 ? ArrowDropUpIcon : ArrowDropDownIcon);
  return (
    <Stack direction="row" alignItems="center" spacing={0.25} justifyContent="flex-end" sx={{ color }}>
      {Icon && <Icon sx={{ fontSize: 18 }} />}
      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{fmtNum(d)}</Typography>
    </Stack>
  );
}

export default function ReconRunPage() {
  const { id, runId } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState(null);
  const [tab, setTab] = useState('matched');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (status = tab) => {
    setLoading(true); setError('');
    try {
      const r = await api.get(`/recons/runs/${runId}`, { params: { status, limit: 500 } });
      setRun(r.data);
    } catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(tab); /* eslint-disable-next-line */ }, [runId, tab]);

  const exportCsv = () => {
    const url = `${api.defaults.baseURL}/recons/runs/${runId}/export?status=${tab}`;
    const token = sessionStorage.getItem('fyntrac_jwt');
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.blob())
      .then((b) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `recon-${runId}-${tab}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
      });
  };

  if (loading && !run) return <Box sx={{ p: 3 }}><LinearProgress /></Box>;
  if (error) return <Box sx={{ p: 3 }}><Alert severity="error">{error}</Alert></Box>;
  if (!run) return null;

  const c = run.summary?.rowCounts || {};
  const totals = run.summary?.totals || {};
  const measureKeys = Object.keys(totals);

  return (
    <Box sx={{ p: 3, maxWidth: 1300, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <IconButton size="small" onClick={() => {
          navigate('/recons');
          window.dispatchEvent(new CustomEvent('fyntrac:open:recon', { detail: { id } }));
        }}><ArrowBackIcon /></IconButton>
        <Typography variant="h2" sx={{ flex: 1 }}>Reconciliation result</Typography>
        <Button startIcon={<DownloadIcon />} variant="outlined" onClick={exportCsv}>Export {tab}</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Run at {new Date(run.runAt).toLocaleString()} · {run.durationMs} ms
      </Typography>

      {/* Top-line summary */}
      <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
        <Chip color="success" label={`Matched ${c.matched ?? 0}`} />
        <Chip color="warning" label={`Mismatched ${c.mismatched ?? 0}`} />
        <Chip label={`Only in A ${c.onlyA ?? 0}`} />
        <Chip label={`Only in B ${c.onlyB ?? 0}`} />
        <Chip variant="outlined" label={`A rows: ${c.a ?? 0}`} />
        <Chip variant="outlined" label={`B rows: ${c.b ?? 0}`} />
        <Chip variant="outlined" label={`Match rate: ${((run.summary?.matchRate || 0) * 100).toFixed(1)}%`} />
      </Stack>

      {run.rowsTruncated && (
        <Alert severity="warning" sx={{ mt: 1, py: 0.5 }}>
          Results were capped at 50,000 rows (full dataset had {run.totalRows?.toLocaleString()} rows).
          Use <strong>Export</strong> to download all rows, or pre-aggregate your dataset.
        </Alert>
      )}

      {/* Per-measure totals */}
      {measureKeys.length > 0 && (
        <Card variant="outlined" sx={{ mt: 2 }}>
          <CardContent>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>Totals by measure</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Measure</TableCell>
                  <TableCell align="right">Σ A</TableCell>
                  <TableCell align="right">Σ B</TableCell>
                  <TableCell align="right">Σ Δ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {measureKeys.map((m) => (
                  <TableRow key={m}>
                    <TableCell>{m}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{fmtNum(totals[m].sumA)}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{fmtNum(totals[m].sumB)}</TableCell>
                    <TableCell align="right"><Delta a={totals[m].sumA} b={totals[m].sumB} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Buckets */}
      <Card variant="outlined" sx={{ mt: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          {STATUS.map((s) => (
            <Tab key={s.key} value={s.key} label={`${s.label} (${
              s.key === 'matched' ? c.matched
              : s.key === 'mismatched' ? c.mismatched
              : s.key === 'only_a' ? c.onlyA
              : c.onlyB ?? 0
            })`} />
          ))}
        </Tabs>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Key</TableCell>
                {measureKeys.map((m) => [
                  <TableCell key={`${m}-a`} align="right">{m} (A)</TableCell>,
                  <TableCell key={`${m}-b`} align="right">{m} (B)</TableCell>,
                  <TableCell key={`${m}-d`} align="right">Δ</TableCell>,
                ])}
                <TableCell>Notes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(run.rows || []).map((r, i) => (
                <TableRow key={i} hover>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{r.key || '—'}</TableCell>
                  {measureKeys.map((m) => {
                    const a = r.a?.[m]; const b = r.b?.[m]; const d = r.deltas?.[m];
                    const ok = d?.ok !== false;
                    return [
                      <TableCell key={`${i}-${m}-a`} align="right" sx={{ fontFamily: 'monospace' }}>{r.a ? fmtNum(a) : '—'}</TableCell>,
                      <TableCell key={`${i}-${m}-b`} align="right" sx={{ fontFamily: 'monospace' }}>{r.b ? fmtNum(b) : '—'}</TableCell>,
                      <TableCell key={`${i}-${m}-d`} align="right" sx={{ bgcolor: !ok ? 'rgba(220,38,38,0.06)' : 'transparent' }}>
                        {r.a && r.b ? <Delta a={a} b={b} /> : '—'}
                      </TableCell>,
                    ];
                  })}
                  <TableCell>
                    {r.attrIssues?.length > 0 && (
                      <Tooltip title={r.attrIssues.map((x) => `${x.field}: ${x.a} ≠ ${x.b}`).join(' · ')}>
                        <Chip size="small" color="warning" variant="outlined" label={`${r.attrIssues.length} attr diff`} />
                      </Tooltip>
                    )}
                    {r.a?.__count > 1 && <Chip size="small" sx={{ ml: 0.5 }} label={`A ×${r.a.__count}`} />}
                    {r.b?.__count > 1 && <Chip size="small" sx={{ ml: 0.5 }} label={`B ×${r.b.__count}`} />}
                  </TableCell>
                </TableRow>
              ))}
              {(run.rows || []).length === 0 && (
                <TableRow><TableCell colSpan={2 + measureKeys.length * 3} sx={{ color: 'text.secondary', py: 3, textAlign: 'center' }}>
                  No rows in this bucket.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
        {run.total > (run.rows?.length || 0) && (
          <Typography variant="caption" sx={{ p: 1, color: 'text.secondary' }}>
            Showing first {run.rows.length} of {run.total} rows. Export to see them all.
          </Typography>
        )}
      </Card>
    </Box>
  );
}
