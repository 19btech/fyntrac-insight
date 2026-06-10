import React, { useState } from 'react';
import {
  Box, Typography, Chip, Collapse, Button, IconButton, Tooltip, CircularProgress,
  Table, TableHead, TableBody, TableRow, TableCell, Stack,
} from '@mui/material';
import CodeIcon from '@mui/icons-material/Code';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SpeedIcon from '@mui/icons-material/SpeedOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import api from '../../../hooks/useQuery';

const CARD_SX = { mt: 1, mb: 1.5, border: '1px solid #e2e8f0', borderRadius: 2.5, bgcolor: '#fff', overflow: 'hidden' };
const HEAD_SX = { px: 1.75, py: 1, borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#fafbff' };

function fmtCell(v) {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  return s.replace(/(\d{4}-\d{2}-\d{2})[T ][\d:.]+Z?/g, '$1');
}

// ── Inline SQL result table + "show SQL" + open-in-Prism ─────────────────────
function QueryResultArtifact({ sql, columns = [], rows = [], rowCount, truncated }) {
  const [showSql, setShowSql] = useState(false);
  const [copied, setCopied] = useState(false);
  const cols = columns.slice(0, 8);
  const visibleRows = rows.slice(0, 12);

  const copy = () => {
    try { navigator.clipboard.writeText(sql || ''); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* noop */ }
  };
  const openInPrism = () => {
    window.dispatchEvent(new CustomEvent('fyntrac:prism:seed', { detail: { sql, name: 'From Insight' } }));
    window.dispatchEvent(new CustomEvent('fyntrac:open:sqllab'));
  };

  return (
    <Box sx={CARD_SX}>
      <Box sx={HEAD_SX}>
        <SpeedIcon sx={{ fontSize: 16, color: '#6366f1' }} />
        <Typography variant="caption" sx={{ fontWeight: 700, color: '#334155', flex: 1 }}>Query result</Typography>
        <Chip size="small" label={`${(rowCount ?? rows.length).toLocaleString()} rows`} sx={{ height: 18, fontSize: '0.62rem', bgcolor: '#eef2ff', color: '#4338ca', fontWeight: 600 }} />
        <Tooltip title="Show SQL"><IconButton size="small" onClick={() => setShowSql((s) => !s)} sx={{ color: showSql ? '#6366f1' : 'text.disabled' }}><CodeIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
      </Box>

      <Collapse in={showSql} unmountOnExit>
        <Box sx={{ px: 1.75, pt: 1.25 }}>
          <Box component="pre" sx={{ m: 0, p: 1.25, bgcolor: '#0f172a', color: '#e2e8f0', borderRadius: 1.5, fontSize: '0.72rem', fontFamily: 'ui-monospace, monospace', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
            {sql}
          </Box>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button size="small" startIcon={copied ? <CheckCircleIcon sx={{ fontSize: 15 }} /> : <ContentCopyIcon sx={{ fontSize: 15 }} />} onClick={copy} sx={{ textTransform: 'none', color: '#4f46e5' }}>{copied ? 'Copied' : 'Copy SQL'}</Button>
            <Button size="small" startIcon={<OpenInNewIcon sx={{ fontSize: 15 }} />} onClick={openInPrism} sx={{ textTransform: 'none', color: '#4f46e5' }}>Open in Prism</Button>
          </Stack>
        </Box>
      </Collapse>

      <Box sx={{ overflowX: 'auto', maxHeight: 280 }}>
        {cols.length === 0 ? (
          <Typography variant="caption" sx={{ display: 'block', px: 1.75, py: 1.5, color: 'text.secondary' }}>No columns returned.</Typography>
        ) : (
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {cols.map((c) => <TableCell key={c} sx={{ fontWeight: 700, fontSize: '0.72rem', bgcolor: '#f8fafc', whiteSpace: 'nowrap' }}>{c}</TableCell>)}
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleRows.map((r, i) => (
                <TableRow key={i} hover>
                  {cols.map((c) => <TableCell key={c} sx={{ fontSize: '0.72rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmtCell(r[c])}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Box>
      {(truncated || rows.length > visibleRows.length || columns.length > cols.length) && (
        <Typography variant="caption" sx={{ display: 'block', px: 1.75, py: 0.75, color: 'text.disabled', borderTop: '1px solid #f1f5f9' }}>
          Showing {visibleRows.length} of {(rowCount ?? rows.length).toLocaleString()} rows{columns.length > cols.length ? `, ${cols.length} of ${columns.length} columns` : ''}. Open in Prism for the full result.
        </Typography>
      )}
    </Box>
  );
}

// ── KPI draft confirm card ───────────────────────────────────────────────────
function KpiDraftArtifact({ draft }) {
  const [status, setStatus] = useState('idle'); // idle | creating | created | dismissed | error
  const [err, setErr] = useState('');
  if (!draft) return null;
  const agg = draft.definition?.numerator?.agg || '$sum';
  const field = draft.definition?.numerator?.field;
  const aggLabel = `${agg.replace('$', '')}${field ? ` of ${field}` : ''}`;
  const filters = Array.isArray(draft.definition?.filters) ? draft.definition.filters : [];
  const periodField = draft.definition?.periodField;
  const OP_LABEL = { $eq: '=', $ne: '≠', $gt: '>', $gte: '≥', $lt: '<', $lte: '≤', $in: 'in', $nin: 'not in', $regex: '~', $exists: 'exists' };

  const create = async () => {
    setStatus('creating'); setErr('');
    try {
      await api.post('/metrics', { ...draft, displayFormat: draft.format?.kind || 'number' });
      setStatus('created');
      // Let the KPIs screen pick up the new metric if it's already open.
      window.dispatchEvent(new CustomEvent('fyntrac:metric:created'));
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Failed to create KPI');
      setStatus('error');
    }
  };

  if (status === 'dismissed') return null;

  return (
    <Box sx={CARD_SX}>
      <Box sx={HEAD_SX}>
        <SpeedIcon sx={{ fontSize: 16, color: '#7c3aed' }} />
        <Typography variant="caption" sx={{ fontWeight: 700, color: '#334155', flex: 1 }}>Suggested KPI</Typography>
        {status === 'created' && <Chip size="small" icon={<CheckCircleIcon sx={{ fontSize: 13 }} />} label="Created" sx={{ height: 18, fontSize: '0.62rem', bgcolor: '#dcfce7', color: '#166534', fontWeight: 600 }} />}
      </Box>
      <Box sx={{ px: 1.75, py: 1.25 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>{draft.name}</Typography>
        {draft.description && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>{draft.description}</Typography>}
        <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap' }} useFlexGap>
          <Chip size="small" label={draft.collection || 'no source'} sx={{ height: 20, fontSize: '0.62rem', bgcolor: '#eff6ff', color: '#1e40af' }} />
          <Chip size="small" label={aggLabel} sx={{ height: 20, fontSize: '0.62rem', bgcolor: '#faf5ff', color: '#7c3aed' }} />
          {filters.map((f, i) => (
            <Chip key={i} size="small" label={`${f.field} ${OP_LABEL[f.operator] || f.operator} ${f.value}`}
              sx={{ height: 20, fontSize: '0.62rem', bgcolor: '#fef3c7', color: '#92400e' }} />
          ))}
          {periodField && (
            <Chip size="small" label={`vs previous · ${periodField}`} sx={{ height: 20, fontSize: '0.62rem', bgcolor: '#dcfce7', color: '#166534' }} />
          )}
        </Stack>
        {status === 'error' && <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>{err}</Typography>}
        {status !== 'created' && (
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            <Button size="small" variant="contained" onClick={create} disabled={status === 'creating'}
              startIcon={status === 'creating' ? <CircularProgress size={13} color="inherit" /> : null}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, bgcolor: '#14213d', boxShadow: 'none', '&:hover': { bgcolor: '#0a1628', boxShadow: 'none' } }}>
              {status === 'creating' ? 'Creating…' : 'Create KPI'}
            </Button>
            <Button size="small" onClick={() => setStatus('dismissed')} sx={{ textTransform: 'none', color: '#475569' }}>Dismiss</Button>
          </Stack>
        )}
      </Box>
    </Box>
  );
}

/** Renders a parsed `fyntrac-artifact` payload as the right rich card. */
export default function ChatArtifact({ data }) {
  if (!data || typeof data !== 'object') return null;
  if (data.type === 'query_result') return <QueryResultArtifact {...data} />;
  if (data.type === 'kpi_draft') return <KpiDraftArtifact draft={data.draft} />;
  return null;
}
