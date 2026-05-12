import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogTitle, DialogActions, DialogContentText,
  IconButton, Typography, Stack, Chip,
  Box, Button, Divider, Skeleton, Switch, FormControlLabel,
  TextField, FormControl, InputLabel, Select, MenuItem,
  CircularProgress, Tooltip, Snackbar, Alert, Card, CardContent,
  Tabs, Tab, Table, TableHead, TableRow, TableCell, TableBody, LinearProgress,
  Popover,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SaveIcon from '@mui/icons-material/Save';
import EditIcon from '@mui/icons-material/Edit';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import DownloadIcon from '@mui/icons-material/Download';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import StorageIcon from '@mui/icons-material/Storage';
import TuneIcon from '@mui/icons-material/Tune';
import AssessmentIcon from '@mui/icons-material/Assessment';
import VerifiedIcon from '@mui/icons-material/Verified';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import api from '../../hooks/useQuery';
import { streamSSE } from '../../hooks/useAI';
import SourceSidePicker from './SourceSidePicker';
import MappingWizard from './MappingWizard';
import useReconContextStore from '../../store/reconContextStore';

const EMPTY_MAPPING = { keys: [], measures: [], attributes: [] };
const EMPTY_MATERIALITY = { abs: 0, pct: 0 };
const EMPTY_CURRENCY = { enabled: false, baseCurrency: 'USD', currencyFieldA: '', currencyFieldB: '', fxRates: {} };
const EMPTY_OPTIONS = {
  aggregateBeforeMatch: true,
  fuzzyKey: false,
  dateGranularity: 'day',
  caseSensitive: false,
  materiality: EMPTY_MATERIALITY,
  currency: EMPTY_CURRENCY,
};

// Convert a Mongoose Map (serialized as plain object with possible $init keys)
// to a clean { CCY: rate } object the editor can drive.
const fxRatesToObj = (fx) => {
  if (!fx) return {};
  if (fx instanceof Map) return Object.fromEntries(fx);
  if (typeof fx === 'object') {
    const out = {};
    for (const k of Object.keys(fx)) {
      if (k.startsWith('$')) continue;
      const n = Number(fx[k]);
      if (Number.isFinite(n)) out[k] = n;
    }
    return out;
  }
  return {};
};

const snapshot = (vals) => JSON.stringify({
  name: vals.name || '',
  description: vals.description || '',
  pinnedNote: vals.pinnedNote || '',
  sourceA: vals.sourceA || null,
  sourceB: vals.sourceB || null,
  mapping: vals.mapping || EMPTY_MAPPING,
  options: vals.options || EMPTY_OPTIONS,
  schedule: vals.schedule || null,
});

/** Reusable card section matching the KPI modal style */
function SectionCard({ title, description, children, action }) {
  return (
    <Box sx={{ bgcolor: '#fff', borderRadius: 2.5, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <Box sx={{ px: 2.5, py: 1.75, borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
        <Box>
          <Typography variant="body2" fontWeight={700} color="#0f172a">{title}</Typography>
          {description && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block', lineHeight: 1.4 }}>
              {description}
            </Typography>
          )}
        </Box>
        {action && <Box sx={{ flexShrink: 0, mt: 0.25 }}>{action}</Box>}
      </Box>
      <Stack spacing={1.5} sx={{ p: 2.5 }}>
        {children}
      </Stack>
    </Box>
  );
}

const STEP_TABS = [
  { label: 'Sources',  icon: <StorageIcon sx={{ fontSize: 15 }} /> },
  { label: 'Mapping',  icon: <CompareArrowsIcon sx={{ fontSize: 15 }} /> },
  { label: 'Options',  icon: <TuneIcon sx={{ fontSize: 15 }} /> },
  { label: 'Results',  icon: <AssessmentIcon sx={{ fontSize: 15 }} /> },
];

/**
 * Full-bleed modal for viewing AND editing a Reconciliation. Revamped to
 * match the KPI modal style: per-step tabs, SectionCard layout, and a
 * dedicated Results tab. Sidebar (left rail) remains unchanged.
 */
export default function ReconPreviewDialog({ open, reconId, isNew, onClose, onSaved, initialTab }) {
  const [activeId, setActiveId] = useState(reconId || null);
  const [recon, setRecon] = useState({
    name: '', description: '', pinnedNote: '',
    sourceA: null, sourceB: null,
    mapping: EMPTY_MAPPING,
    options: EMPTY_OPTIONS,
    schedule: { enabled: false, cron: '0 9 * * *', recipients: [], alertWhenMismatchOver: undefined },
  });
  const [columnsA, setColumnsA] = useState([]);
  const [columnsB, setColumnsB] = useState([]);
  const [sampleA, setSampleA] = useState([]);
  const [sampleB, setSampleB] = useState([]);
  const [typesA, setTypesA] = useState({});
  const [typesB, setTypesB] = useState({});
  const [aiReasoning, setAiReasoning] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [runs, setRuns] = useState([]);
  const [railOpen, setRailOpen] = useState(true);
  const [metaEditing, setMetaEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [tab, setTab] = useState(0); // 0-3: config steps, 4: results
  const [selectedRunId, setSelectedRunId] = useState(null);
  const baselineRef = useRef(null);
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false);

  const setReconCtx = useReconContextStore((s) => s.setRecon);
  const clearReconCtx = useReconContextStore((s) => s.clearRecon);

  // Hydrate when opened with a new id, or initialize a blank "new" recon.
  useEffect(() => {
    if (!open) return;
    setError(''); setRuns([]); setDirty(false);
    setTab(initialTab ?? 0); setSelectedRunId(null);
    if (isNew || !reconId) {
      setActiveId(null);
      const blank = {
        name: '', description: '', pinnedNote: '',
        sourceA: null, sourceB: null,
        mapping: EMPTY_MAPPING,
        options: EMPTY_OPTIONS,
        schedule: { enabled: false, cron: '0 9 * * *', recipients: [], alertWhenMismatchOver: undefined },
      };
      setRecon(blank);
      setMetaEditing(true);
      baselineRef.current = snapshot(blank);
      return;
    }
    setActiveId(reconId);
    setLoading(true);
    setMetaEditing(false);
    api.get(`/recons/${reconId}`)
      .then(({ data }) => {
        const incomingOpts = data.options || {};
        const next = {
          ...data,
          pinnedNote: data.pinnedNote || '',
          mapping: data.mapping || EMPTY_MAPPING,
          options: {
            ...EMPTY_OPTIONS,
            ...incomingOpts,
            materiality: { ...EMPTY_MATERIALITY, ...(incomingOpts.materiality || {}) },
            currency: {
              ...EMPTY_CURRENCY,
              ...(incomingOpts.currency || {}),
              fxRates: fxRatesToObj(incomingOpts.currency?.fxRates),
            },
          },
          schedule: data.schedule || { enabled: false, cron: '0 9 * * *', recipients: [] },
        };
        setRecon(next);
        baselineRef.current = snapshot(next);
      })
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
    api.get(`/recons/${reconId}/runs`).then(({ data }) => {
      const list = data || [];
      setRuns(list);
      if (list[0]?._id) setSelectedRunId(list[0]._id);
    }).catch(() => {});
  }, [open, reconId, isNew, initialTab]);

  // Dirty by snapshot comparison.
  useEffect(() => {
    if (!baselineRef.current) return;
    const current = snapshot(recon);
    setDirty(current !== baselineRef.current);
  }, [recon]);

  const loadColumns = useCallback(async (side, setCol, setSample, setTypes) => {
    if (!side?.kind || !side?.refId) { setCol([]); setSample([]); setTypes({}); return; }
    try {
      const r = await api.post('/recons/source/columns', { kind: side.kind, refId: side.refId });
      setCol(r.data.columns || []);
      setSample(r.data.sample || []);
      setTypes(r.data.types || {});
    } catch { setCol([]); setSample([]); setTypes({}); }
  }, []);
  useEffect(() => { loadColumns(recon.sourceA, setColumnsA, setSampleA, setTypesA); }, [recon.sourceA, loadColumns]);
  useEffect(() => { loadColumns(recon.sourceB, setColumnsB, setSampleB, setTypesB); }, [recon.sourceB, loadColumns]);

  // Publish recon context for the global AI drawer.
  useEffect(() => {
    if (!open) return;
    setReconCtx({
      id: activeId,
      name: recon.name,
      description: recon.description,
      sourceA: recon.sourceA,
      sourceB: recon.sourceB,
      mapping: recon.mapping,
      options: recon.options,
      schedule: recon.schedule,
      columnsA,
      columnsB,
      lastRunSummary: runs[0]?.summary || null,
      latestRunId: runs[0]?._id || null,
      runCount: runs.length,
    });
  }, [open, activeId, recon, columnsA, columnsB, runs, setReconCtx]);
  useEffect(() => () => clearReconCtx(), [clearReconCtx]);

  const set = (patch) => setRecon((r) => ({ ...r, ...patch }));

  const aiSuggest = async () => {
    if (columnsA.length === 0 || columnsB.length === 0) {
      setError('Load both sources first so columns are available.'); return;
    }
    setAiSuggestLoading(true); setError(''); setAiReasoning('');
    try {
      const r = await api.post('/ai/mapping-suggest', {
        columnsA, columnsB,
        sampleA: sampleA.slice(0, 15),
        sampleB: sampleB.slice(0, 15),
        typesA, typesB,
      });
      set({ mapping: {
        keys: r.data.keys || [],
        measures: r.data.measures || [],
        attributes: r.data.attributes || [],
      } });
      if (r.data.reasoning) setAiReasoning(r.data.reasoning);
    } catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setAiSuggestLoading(false); }
  };

  const save = async () => {
    if (!recon.name?.trim()) { setError('Name is required'); setMetaEditing(true); return; }
    setSaving(true); setError('');
    try {
      let data;
      if (activeId) {
        ({ data } = await api.put(`/recons/${activeId}`, recon));
      } else {
        ({ data } = await api.post('/recons', recon));
        setActiveId(data._id);
      }
      const incomingOpts = data.options || {};
      const next = {
        ...data,
        pinnedNote: data.pinnedNote || '',
        mapping: data.mapping || EMPTY_MAPPING,
        options: {
          ...EMPTY_OPTIONS,
          ...incomingOpts,
          materiality: { ...EMPTY_MATERIALITY, ...(incomingOpts.materiality || {}) },
          currency: {
            ...EMPTY_CURRENCY,
            ...(incomingOpts.currency || {}),
            fxRates: fxRatesToObj(incomingOpts.currency?.fxRates),
          },
        },
      };
      setRecon(next);
      baselineRef.current = snapshot(next);
      setDirty(false);
      setMetaEditing(false);
      setSavedMsg('Saved');
      setTimeout(() => setSavedMsg(''), 2500);
      onSaved?.(data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setSaving(false); }
  };

  const runNow = async () => {
    setRunning(true); setError('');
    try {
      let id = activeId;
      if (!id) {
        const r = await api.post('/recons', recon);
        id = r.data._id;
        setActiveId(id);
      } else if (dirty) {
        await api.put(`/recons/${id}`, recon);
      }
      const r2 = await api.post(`/recons/${id}/run`);
      // Switch to the embedded Results tab instead of navigating away.
      setSelectedRunId(r2.data.runId);
      setTab(3);
      // Refresh the run history list in the background.
      api.get(`/recons/${id}/runs`).then(({ data }) => setRuns(data || [])).catch(() => {});
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setRunning(false); }
  };

  const askAiExplainRecon = () => {
    const last = recon?.lastRun?.summary?.rowCounts
      ? `Last run: matched=${recon.lastRun.summary.rowCounts.matched ?? 0}, mismatched=${recon.lastRun.summary.rowCounts.mismatched ?? 0}, A-only=${recon.lastRun.summary.rowCounts.onlyA ?? 0}, B-only=${recon.lastRun.summary.rowCounts.onlyB ?? 0}`
      : 'No runs yet';
    window.dispatchEvent(new CustomEvent('fyntrac:ai:open', {
      detail: {
        prompt: `I have the reconciliation "${recon.name || 'Untitled'}" open. It compares ${recon.sourceA?.displayName || 'Side A'} against ${recon.sourceB?.displayName || 'Side B'}. ${last}.

I can help you with:
1. How this reconciliation works — what each tab does (Mapping, Results, History, Schedule)
2. Questions like "what does mismatch mean?", "how do I add a key?", "how do I set a tolerance?"
3. Interpreting the latest results — variances, A-only rows, B-only rows

What would you like to know?`,
      },
    }));
  };

  const handleClose = () => {
    if (dirty) setConfirmCloseOpen(true);
    else onClose?.();
  };
  const confirmDiscard = () => { setConfirmCloseOpen(false); onClose?.(); };

  const canRun = recon.sourceA && recon.sourceB && (recon.mapping.keys || []).filter((k) => k.a && k.b).length > 0;

  const sideASummary = useMemo(() => {
    const s = recon.sourceA;
    if (!s) return '—';
    return `${s.kind || '?'} · ${s.displayName || s.refId || '?'}`;
  }, [recon.sourceA]);
  const sideBSummary = useMemo(() => {
    const s = recon.sourceB;
    if (!s) return '—';
    return `${s.kind || '?'} · ${s.displayName || s.refId || '?'}`;
  }, [recon.sourceB]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth={false}
      PaperProps={{
        sx: {
          width: '96vw', height: '95vh', m: 0, borderRadius: 3, maxWidth: 'none',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(15,23,42,0.18)',
        },
      }}
    >
      {/* ── Header bar ───────────────────────────────────────────── */}
      <Box sx={{
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        px: 3, py: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 1.5, bgcolor: '#eff6ff', flexShrink: 0 }}>
            <CompareArrowsIcon sx={{ fontSize: 18, color: '#1e40af' }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
              {recon.name || (isNew ? 'New reconciliation' : 'Reconciliation')}
            </Typography>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.25, flexWrap: 'wrap' }}>
              {recon.sourceA?.displayName && (
                <Chip size="small" variant="outlined" label={`A: ${recon.sourceA.displayName}`}
                  sx={{ height: 18, fontSize: '0.65rem', borderRadius: 1 }} />
              )}
              {recon.sourceB?.displayName && (
                <Chip size="small" variant="outlined" label={`B: ${recon.sourceB.displayName}`}
                  sx={{ height: 18, fontSize: '0.65rem', borderRadius: 1 }} />
              )}
              {dirty && (
                <Chip size="small" color="warning" variant="outlined" label="Unsaved changes"
                  sx={{ height: 18, fontSize: '0.65rem', borderRadius: 1 }} />
              )}
            </Stack>
          </Box>
        </Stack>
        <IconButton size="small" onClick={handleClose}><CloseIcon fontSize="small" /></IconButton>
      </Box>

      {/* ── Step tabs (KPI-style) ─────────────────────────────────── */}
      <Box sx={{
        display: 'flex', gap: 0, flexShrink: 0,
        borderBottom: '1px solid #e2e8f0',
        bgcolor: '#fff',
        overflowX: 'auto',
        px: 2,
      }}>
        {STEP_TABS.map(({ label, icon }, i) => (
          <Box
            key={label}
            onClick={() => setTab(i)}
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.75,
              px: 2, py: 0.5, cursor: 'pointer', position: 'relative',
              color: tab === i ? '#1e40af' : '#64748b',
              fontWeight: tab === i ? 700 : 500,
              fontSize: '0.875rem',
              minHeight: 44,
              whiteSpace: 'nowrap',
              transition: 'color .12s',
              '&:hover': { color: tab === i ? '#1e40af' : '#1e293b' },
              '&::after': {
                content: '""',
                position: 'absolute', bottom: 0, left: 0, right: 0,
                height: 2.5, borderRadius: '2px 2px 0 0',
                bgcolor: tab === i ? '#3b82f6' : 'transparent',
                transition: 'background-color .12s',
              },
            }}
          >
            {icon}
            <Typography variant="body2" fontWeight="inherit" fontSize="inherit" color="inherit">
              {label}
            </Typography>
            {label === 'Results' && runs.length > 0 && (
              <Chip size="small" label={runs.length} sx={{ height: 16, fontSize: '0.6rem', ml: 0.25 }} />
            )}
          </Box>
        ))}
      </Box>

      {/* ── Body ──────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left rail */}
        <Box sx={{
          width: railOpen ? 280 : 44, flexShrink: 0, borderRight: '1px solid #e2e8f0',
          overflow: 'hidden', bgcolor: '#fff',
          transition: 'width 0.2s ease',
          display: 'flex', flexDirection: 'column',
          position: 'relative',
        }}>
          {!railOpen && (
            <Tooltip title="Expand panel" placement="right">
              <IconButton size="small" onClick={() => setRailOpen(true)} sx={{ m: 1, alignSelf: 'center' }}>
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {railOpen && (
            <Box sx={{ p: 2, pt: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5, width: 280 }}>
              <Stack direction="row" justifyContent="flex-end" sx={{ mt: -0.5, mb: -0.5 }}>
                <Tooltip title="Collapse panel" placement="left">
                  <IconButton size="small" onClick={() => setRailOpen(false)}>
                    <ChevronLeftIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>

              {/* Name */}
              <Stack spacing={0.5}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="body2" fontWeight={700} color="#0f172a">Name</Typography>
                  {!metaEditing && (
                    <Tooltip title="Edit name & description">
                      <IconButton size="small" onClick={() => setMetaEditing(true)} sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary' } }}>
                        <EditIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
                {metaEditing ? (
                  <TextField
                    size="small" fullWidth autoFocus
                    value={recon.name} onChange={(e) => set({ name: e.target.value })}
                    placeholder="Reconciliation name"
                  />
                ) : (
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#334155' }}>
                    {recon.name || <Box component="span" sx={{ fontStyle: 'italic', color: 'text.disabled' }}>Untitled reconciliation</Box>}
                  </Typography>
                )}
              </Stack>

              {/* Description */}
              <Stack spacing={0.5}>
                <Typography variant="body2" fontWeight={700} color="#0f172a">Description</Typography>
                {metaEditing ? (
                  <TextField
                    size="small" fullWidth multiline minRows={2} maxRows={5}
                    value={recon.description || ''} onChange={(e) => set({ description: e.target.value })}
                    placeholder="What does this reconcile?"
                  />
                ) : (
                  <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'pre-wrap' }}>
                    {recon.description || <Box component="span" sx={{ fontStyle: 'italic', color: 'text.disabled' }}>No description</Box>}
                  </Typography>
                )}
              </Stack>

              <Divider />

              {/* Sources summary */}
              <Stack spacing={1}>
                <Typography variant="body2" fontWeight={700} color="#0f172a">Sources</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, mt: 0.1 }}>
                      <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.6rem', color: '#1e40af' }}>A</Typography>
                    </Box>
                    <Typography variant="body2" sx={{ color: '#475569', wordBreak: 'break-word', fontSize: '0.78rem' }}>{sideASummary}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, mt: 0.1 }}>
                      <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.6rem', color: '#7c3aed' }}>B</Typography>
                    </Box>
                    <Typography variant="body2" sx={{ color: '#475569', wordBreak: 'break-word', fontSize: '0.78rem' }}>{sideBSummary}</Typography>
                  </Box>
                </Box>
              </Stack>

              <Divider />

              {/* Pinned note — always-visible reminder */}
              <Stack spacing={0.5}>
                <Typography variant="body2" fontWeight={700} color="#0f172a">Pinned note</Typography>
                <TextField
                  size="small" fullWidth multiline minRows={2} maxRows={5}
                  value={recon.pinnedNote || ''}
                  onChange={(e) => set({ pinnedNote: e.target.value })}
                  placeholder="e.g. Always confirm 30-Sep totals against the Bloomberg PDF before signing off."
                  sx={{
                    '& .MuiOutlinedInput-root': { bgcolor: '#fffbeb', fontSize: '0.78rem' },
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#fde68a' },
                  }}
                />
              </Stack>

              <Divider />

              {/* Action buttons */}
              <Stack spacing={1}>
                <Button
                  size="small" variant="outlined" fullWidth
                  startIcon={<AutoAwesomeIcon fontSize="small" />}
                  onClick={askAiExplainRecon}
                  sx={{
                    borderRadius: 2, fontWeight: 600, justifyContent: 'flex-start', textTransform: 'none',
                    color: '#7c3aed', borderColor: '#ddd6fe', bgcolor: '#faf5ff',
                    '&:hover': { bgcolor: '#ede9fe', borderColor: '#c4b5fd' },
                    '&.Mui-disabled': { bgcolor: '#faf5ff', borderColor: '#ddd6fe', color: '#7c3aed' },
                    boxShadow: 'none',
                  }}
                >
                  Ask AI to explain
                </Button>
                <Button
                  size="small" variant="outlined" fullWidth
                  startIcon={running ? <CircularProgress size={13} sx={{ color: '#15803d' }} /> : <PlayArrowIcon fontSize="small" />}
                  onClick={runNow}
                  disabled={!canRun || running}
                  sx={{
                    borderRadius: 2, fontWeight: 600, justifyContent: 'flex-start', textTransform: 'none',
                    color: '#15803d', borderColor: '#bbf7d0', bgcolor: '#f0fdf4',
                    '&:hover': { bgcolor: '#dcfce7', borderColor: '#86efac' },
                    '&.Mui-disabled': { bgcolor: '#f0fdf4', borderColor: '#bbf7d0', color: '#15803d' },
                    boxShadow: 'none',
                  }}
                >
                  {running ? 'Running…' : 'Run now'}
                </Button>
                <Button
                  size="small" variant="contained" fullWidth
                  startIcon={saving ? <CircularProgress size={13} color="inherit" /> : <SaveIcon fontSize="small" />}
                  onClick={save}
                  disabled={saving || !recon.name?.trim()}
                  sx={{
                    borderRadius: 2, fontWeight: 700, textTransform: 'none',
                    bgcolor: '#14213d', boxShadow: 'none',
                    '&:hover': { bgcolor: '#0a1628', boxShadow: 'none' },
                  }}
                >
                  {saving ? 'Saving…' : 'Save reconciliation'}
                </Button>
              </Stack>
            </Box>
          )}
        </Box>

        {/* Content area */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 3, bgcolor: '#f8fafc' }}>
          {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
          {loading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Skeleton variant="rounded" height={32} width={240} />
              <Skeleton variant="rounded" height={160} />
              <Skeleton variant="rounded" height={220} />
            </Box>
          ) : (
            <>
              {/* Tab 0 — Sources */}
              {tab === 0 && (
                <Stack spacing={2}>
                  <SectionCard
                    title="Pick the two sides"
                    description="Select the datasets or uploaded CSVs you want to reconcile."
                  >
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
                      <Box sx={{ flex: 1 }}>
                        <SourceSidePicker label="Side A" value={recon.sourceA} onChange={(v) => set({ sourceA: v })} />
                      </Box>
                      <Divider orientation="vertical" flexItem />
                      <Box sx={{ flex: 1 }}>
                        <SourceSidePicker label="Side B" value={recon.sourceB} onChange={(v) => set({ sourceB: v })} />
                      </Box>
                    </Stack>
                  </SectionCard>
                </Stack>
              )}

              {/* Tab 1 — Mapping */}
              {tab === 1 && (
                <Stack spacing={2}>
                  <SectionCard
                    title="Map the columns"
                    description="Which columns identify the same row (Keys) and which numbers to compare (Measures)."
                  >
                    <MappingWizard
                      mapping={recon.mapping}
                      onChange={(m) => set({ mapping: m })}
                      columnsA={columnsA}
                      columnsB={columnsB}
                      onAISuggest={aiSuggest}
                      aiSuggestLoading={aiSuggestLoading}
                      aiReasoning={aiReasoning}
                      onClearReasoning={() => setAiReasoning('')}
                    />
                  </SectionCard>
                </Stack>
              )}

              {/* Tab 2 — Options */}
              {tab === 2 && (
                <Stack spacing={2}>
                  <SectionCard
                    title="Matching options"
                    description="Fine-tune how rows are compared and matched across the two sources."
                    action={
                      <Tooltip placement="left" arrow
                        componentsProps={{ tooltip: { sx: { maxWidth: 320, bgcolor: '#1e293b', border: '1px solid #334155' } }, arrow: { sx: { color: '#1e293b' } } }}
                        title={
                          <Box sx={{ p: 0.5 }}>
                            <Typography variant="caption" fontWeight={700} sx={{ display: 'block', mb: 0.5, color: '#e2e8f0' }}>Matching options</Typography>
                            {[
                              { l: 'Aggregate by key', d: 'Sum all measure values that share the same key before comparing — ideal when one side has multiple lines per transaction.' },
                              { l: 'Case-sensitive', d: 'When on, "ABC" and "abc" are treated as different values. Leave off unless your keys are case-sensitive identifiers.' },
                              { l: 'Date granularity', d: 'Controls how date key columns are bucketed. Day = exact date; Month, Quarter, Year = progressively looser matching.' },
                            ].map(({ l, d }) => (
                              <Box key={l} sx={{ mb: 0.6 }}>
                                <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#93c5fd', display: 'block' }}>{l}</Typography>
                                <Typography variant="caption" sx={{ color: '#94a3b8' }}>{d}</Typography>
                              </Box>
                            ))}
                          </Box>
                        }>
                        <InfoOutlinedIcon sx={{ fontSize: 16, color: '#94a3b8', cursor: 'default', mt: 0.25 }} />
                      </Tooltip>
                    }
                  >
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems="center" flexWrap="wrap" useFlexGap>
                      <FormControlLabel
                        control={<Switch checked={recon.options.aggregateBeforeMatch !== false} onChange={(e) => set({ options: { ...recon.options, aggregateBeforeMatch: e.target.checked } })} />}
                        label={<Typography variant="body2">Aggregate by key before matching</Typography>}
                      />
                      <FormControlLabel
                        control={<Switch checked={!!recon.options.caseSensitive} onChange={(e) => set({ options: { ...recon.options, caseSensitive: e.target.checked } })} />}
                        label={<Typography variant="body2">Case-sensitive</Typography>}
                      />
                      <FormControl size="small" sx={{ minWidth: 180 }}>
                        <InputLabel>Date granularity</InputLabel>
                        <Select label="Date granularity" value={recon.options.dateGranularity || 'day'} onChange={(e) => set({ options: { ...recon.options, dateGranularity: e.target.value } })}>
                          {['day', 'month', 'quarter', 'year'].map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
                        </Select>
                      </FormControl>
                    </Stack>
                  </SectionCard>

                  <SectionCard
                    title="Materiality threshold"
                    description="Mismatches whose largest measure delta is within BOTH limits are demoted to an 'Immaterial' bucket and excluded from the headline mismatched count. Set both to 0 to disable."
                    action={
                      <Tooltip placement="left" arrow
                        componentsProps={{ tooltip: { sx: { maxWidth: 300, bgcolor: '#1e293b', border: '1px solid #334155' } }, arrow: { sx: { color: '#1e293b' } } }}
                        title={
                          <Box sx={{ p: 0.5 }}>
                            <Typography variant="caption" fontWeight={700} sx={{ display: 'block', mb: 0.5, color: '#e2e8f0' }}>Materiality threshold</Typography>
                            <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', lineHeight: 1.5 }}>
                              A row is only flagged as mismatched if its difference exceeds BOTH limits. Rows that fall within both are moved to an "Immaterial" bucket so you can focus on what actually matters.
                            </Typography>
                            <Box sx={{ mt: 0.75 }}>
                              <Typography variant="caption" sx={{ color: '#93c5fd', fontFamily: 'monospace', display: 'block' }}>Absolute (≤)</Typography>
                              <Typography variant="caption" sx={{ color: '#94a3b8' }}>Maximum dollar (or unit) difference allowed, e.g. 1.00 to ignore penny rounding.</Typography>
                            </Box>
                            <Box sx={{ mt: 0.5 }}>
                              <Typography variant="caption" sx={{ color: '#93c5fd', fontFamily: 'monospace', display: 'block' }}>Percent (≤)</Typography>
                              <Typography variant="caption" sx={{ color: '#94a3b8' }}>Maximum relative difference, e.g. 0.001 means 0.1% of the larger of the two values.</Typography>
                            </Box>
                          </Box>
                        }>
                        <InfoOutlinedIcon sx={{ fontSize: 16, color: '#94a3b8', cursor: 'default', mt: 0.25 }} />
                      </Tooltip>
                    }
                  >
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                      <TextField
                        size="small" type="number" label="Absolute (≤)"
                        helperText="e.g. 1.00 — diff ≤ this amount is immaterial"
                        value={recon.options.materiality?.abs ?? 0}
                        onChange={(e) => set({ options: { ...recon.options, materiality: { ...(recon.options.materiality || EMPTY_MATERIALITY), abs: Number(e.target.value) || 0 } } })}
                        sx={{ flex: 1 }}
                        inputProps={{ step: '0.01', min: 0 }}
                      />
                      <TextField
                        size="small" type="number" label="Percent (≤)"
                        helperText="e.g. 0.001 = 0.1% of the larger of A or B"
                        value={recon.options.materiality?.pct ?? 0}
                        onChange={(e) => set({ options: { ...recon.options, materiality: { ...(recon.options.materiality || EMPTY_MATERIALITY), pct: Number(e.target.value) || 0 } } })}
                        sx={{ flex: 1 }}
                        inputProps={{ step: '0.0001', min: 0 }}
                      />
                    </Stack>
                  </SectionCard>

                  <SectionCard
                    title="Currency normalisation"
                    description="When sides are reported in different currencies, multiply each measure by the row's FX rate before comparing. Missing rates default to 1× (no conversion)."
                    action={
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Tooltip placement="left" arrow
                          componentsProps={{ tooltip: { sx: { maxWidth: 300, bgcolor: '#1e293b', border: '1px solid #334155' } }, arrow: { sx: { color: '#1e293b' } } }}
                          title={
                            <Box sx={{ p: 0.5 }}>
                              <Typography variant="caption" fontWeight={700} sx={{ display: 'block', mb: 0.5, color: '#e2e8f0' }}>Currency normalisation</Typography>
                              <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', lineHeight: 1.5 }}>
                                Use this when Side A and Side B are in different currencies. Each row's measure is converted to your base currency using the FX rate from a column you specify. Define one rate per currency code (e.g. EUR = 1.08 means 1 EUR = 1.08 USD). Missing rates are treated as 1× (no conversion).
                              </Typography>
                            </Box>
                          }>
                          <InfoOutlinedIcon sx={{ fontSize: 16, color: '#94a3b8', cursor: 'default' }} />
                        </Tooltip>
                        <Switch
                          checked={!!recon.options.currency?.enabled}
                          onChange={(e) => set({ options: { ...recon.options, currency: { ...(recon.options.currency || EMPTY_CURRENCY), enabled: e.target.checked } } })}
                        />
                      </Stack>
                    }
                  >
                    {recon.options.currency?.enabled && (
                      <>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                          <FormControl size="small" sx={{ flex: 1 }}>
                            <InputLabel>Currency column on Side A</InputLabel>
                            <Select
                              label="Currency column on Side A"
                              value={recon.options.currency?.currencyFieldA || ''}
                              onChange={(e) => set({ options: { ...recon.options, currency: { ...(recon.options.currency || EMPTY_CURRENCY), currencyFieldA: e.target.value } } })}
                            >
                              <MenuItem value=""><em>none</em></MenuItem>
                              {columnsA.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                            </Select>
                          </FormControl>
                          <FormControl size="small" sx={{ flex: 1 }}>
                            <InputLabel>Currency column on Side B</InputLabel>
                            <Select
                              label="Currency column on Side B"
                              value={recon.options.currency?.currencyFieldB || ''}
                              onChange={(e) => set({ options: { ...recon.options, currency: { ...(recon.options.currency || EMPTY_CURRENCY), currencyFieldB: e.target.value } } })}
                            >
                              <MenuItem value=""><em>none</em></MenuItem>
                              {columnsB.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                            </Select>
                          </FormControl>
                          <TextField
                            size="small" label="Base currency"
                            value={recon.options.currency?.baseCurrency || 'USD'}
                            onChange={(e) => set({ options: { ...recon.options, currency: { ...(recon.options.currency || EMPTY_CURRENCY), baseCurrency: e.target.value.toUpperCase().slice(0, 3) } } })}
                            sx={{ width: 140 }}
                          />
                        </Stack>
                        <FxRatesEditor
                          baseCurrency={recon.options.currency?.baseCurrency || 'USD'}
                          rates={recon.options.currency?.fxRates || {}}
                          onChange={(next) => set({ options: { ...recon.options, currency: { ...(recon.options.currency || EMPTY_CURRENCY), fxRates: next } } })}
                        />
                      </>
                    )}
                  </SectionCard>
                </Stack>
              )}

              {/* Tab 3 — Results */}
              {tab === 3 && (
                <RunResultsView
                  reconId={activeId}
                  runId={selectedRunId}
                  runs={runs}
                  onPickRun={setSelectedRunId}
                  onGoToConfig={() => setTab(0)}
                  reconName={recon.name}
                  mapping={recon.mapping}
                />
              )}
            </>
          )}
        </Box>
      </Box>

      {/* Discard confirm */}
      <Dialog open={confirmCloseOpen} onClose={() => setConfirmCloseOpen(false)} maxWidth="xs">
        <DialogTitle>Discard unsaved changes?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have unsaved changes to this reconciliation. Closing now will lose them.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmCloseOpen(false)}>Keep editing</Button>
          <Button onClick={confirmDiscard} color="error" variant="contained"
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}>
            Discard changes
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!savedMsg}
        autoHideDuration={2500}
        onClose={() => setSavedMsg('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ mt: 8, zIndex: (theme) => theme.zIndex.modal + 20 }}
      >
        <Alert
          severity="success" variant="filled" icon={false}
          onClose={() => setSavedMsg('')}
          sx={{ bgcolor: '#d1fae5', color: '#065f46', fontWeight: 600, border: '1px solid #a7f3d0' }}
        >
          {savedMsg}
        </Alert>
      </Snackbar>
    </Dialog>
  );
}

// ---- Embedded run results view -------------------------------------------

const STATUS_BUCKETS = [
  { key: 'matched',    label: 'Matched',     color: 'success' },
  { key: 'mismatched', label: 'Mismatched',  color: 'warning' },
  { key: 'immaterial', label: 'Immaterial',  color: 'default' },
  { key: 'only_a',     label: 'Only in A',   color: 'default' },
  { key: 'only_b',     label: 'Only in B',   color: 'default' },
];

const BREAK_CATEGORIES = [
  { key: '',          label: 'Uncategorised', bg: '#f1f5f9', fg: '#475569' },
  { key: 'timing',    label: 'Timing',        bg: '#fef3c7', fg: '#92400e' },
  { key: 'amount',    label: 'Amount',        bg: '#fee2e2', fg: '#991b1b' },
  { key: 'missing',   label: 'Missing data',  bg: '#fce7f3', fg: '#9d174d' },
  { key: 'currency',  label: 'Currency / FX', bg: '#dbeafe', fg: '#1e40af' },
  { key: 'explained', label: 'Explained',     bg: '#dcfce7', fg: '#166534' },
];
const CATEGORY_BY_KEY = Object.fromEntries(BREAK_CATEGORIES.map((c) => [c.key, c]));

/** Tiny inline sparkline of N numeric values (0..1). Avoids new chart deps. */
function Sparkline({ values, width = 240, height = 36, color = '#3b82f6' }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const pts = values.map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      {values.map((v, i) => (
        <circle key={i} cx={(i * stepX).toFixed(1)} cy={(height - ((v - min) / range) * height).toFixed(1)} r="1.75" fill={color} />
      ))}
    </svg>
  );
}

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

/** Inline editor for FX rates: list of CCY → rate rows + Add row. */
function FxRatesEditor({ baseCurrency, rates, onChange }) {
  const [draftCcy, setDraftCcy] = useState('');
  const [draftRate, setDraftRate] = useState('');
  const entries = Object.entries(rates || {});

  const addRow = () => {
    const k = (draftCcy || '').trim().toUpperCase().slice(0, 3);
    const v = Number(draftRate);
    if (!k || !Number.isFinite(v) || v <= 0) return;
    onChange({ ...(rates || {}), [k]: v });
    setDraftCcy(''); setDraftRate('');
  };
  const removeRow = (k) => {
    const next = { ...(rates || {}) }; delete next[k]; onChange(next);
  };
  const updateRow = (k, v) => {
    const n = Number(v);
    onChange({ ...(rates || {}), [k]: Number.isFinite(n) ? n : 0 });
  };

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
        Multiplier to convert each row into <b>{baseCurrency}</b>. Example: if base is USD and you load a row tagged <code>EUR</code>, set <code>EUR → 1.08</code>.
      </Typography>
      <Stack spacing={0.75}>
        {entries.length === 0 && (
          <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
            No rates yet — add one below.
          </Typography>
        )}
        {entries.map(([k, v]) => (
          <Stack key={k} direction="row" spacing={1} alignItems="center">
            <TextField size="small" value={k} disabled sx={{ width: 90 }} />
            <TextField
              size="small" type="number" value={v}
              onChange={(e) => updateRow(k, e.target.value)}
              inputProps={{ step: '0.0001', min: 0 }}
              sx={{ width: 140 }}
            />
            <Button size="small" color="error" onClick={() => removeRow(k)}
              sx={{ textTransform: 'none', fontWeight: 600 }}>
              Remove
            </Button>
          </Stack>
        ))}
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small" placeholder="CCY" value={draftCcy}
            onChange={(e) => setDraftCcy(e.target.value.toUpperCase().slice(0, 3))}
            sx={{ width: 90 }}
          />
          <TextField
            size="small" type="number" placeholder="rate" value={draftRate}
            onChange={(e) => setDraftRate(e.target.value)}
            inputProps={{ step: '0.0001', min: 0 }}
            sx={{ width: 140 }}
          />
          <Button size="small" variant="outlined" onClick={addRow}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}>
            Add rate
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

function RunResultsView({ reconId, runId, runs, onPickRun, onGoToConfig, reconName, mapping }) {
  const [run, setRun] = useState(null);
  const [bucket, setBucket] = useState('matched');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [groupBy, setGroupBy] = useState(''); // attribute column key for drill-down
  const [signing, setSigning] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState({ open: false, text: '', loading: false });

  const activeRecon = useReconContextStore((s) => s.recon);

  const fetchRun = useCallback(() => {
    if (!runId) return;
    setLoading(true); setError('');
    return api.get(`/recons/runs/${runId}`, { params: { status: bucket, limit: 500 } })
      .then((r) => setRun(r.data))
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [runId, bucket]);

  useEffect(() => { if (!runId) { setRun(null); return; } fetchRun(); }, [runId, bucket, fetchRun]);

  const exportCsv = () => {
    if (!runId) return;
    const url = `${api.defaults.baseURL}/recons/runs/${runId}/export?status=${bucket}`;
    const token = sessionStorage.getItem('fyntrac_jwt');
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.blob())
      .then((b) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `recon-${runId}-${bucket}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
      });
  };

  const certified = !!run?.signOff?.certified;
  const toggleSignoff = async () => {
    if (!runId) return;
    setSigning(true);
    try {
      await api.post(`/recons/runs/${runId}/signoff`, { certified: !certified });
      await fetchRun();
    } catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setSigning(false); }
  };

  const analyseWithAI = async () => {
    if (!run) return;
    const c2 = run.summary?.rowCounts || {};
    const totals2 = run.summary?.totals || {};
    const mKeys = Object.keys(totals2);
    const topRows = (run.rows || []).slice(0, 20).map((r) => ({
      key: r.key,
      deltas: Object.fromEntries(mKeys.map((m) => [m, r.deltas?.[m]?.diff])),
      category: r.category,
    }));
    const prompt = `Analyse the latest reconciliation run for "${reconName || 'this recon'}".

Run summary:
- Match rate: ${((run.summary?.matchRate || 0) * 100).toFixed(1)}%
- Matched: ${c2.matched ?? 0}, Mismatched: ${c2.mismatched ?? 0}, Only in A: ${c2.onlyA ?? 0}, Only in B: ${c2.onlyB ?? 0}, Immaterial: ${c2.immaterial ?? 0}
${mKeys.length > 0 ? `Measure totals: ${mKeys.map((m) => `${m}: ΣA=${totals2[m]?.sumA}, ΣB=${totals2[m]?.sumB}`).join('; ')}` : ''}
Keys: ${JSON.stringify((mapping?.keys || []).map((k) => `${k.a}=${k.b}`))}

Top mismatched rows (up to 20): ${JSON.stringify(topRows)}

Please:
1. Identify the most likely root causes of the variances
2. Note any patterns (timing, sign, magnitude, which side is consistently higher)
3. Suggest 2-3 concrete investigation steps

Keep it concise and finance-focused. Cite specific numbers.`;

    setAiAnalysis({ open: true, text: '', loading: true });
    try {
      let acc = '';
      await streamSSE('/ai/chat', { messages: [{ role: 'user', content: prompt }], dashboardContext: { activeRecon: activeRecon || null } }, (chunk) => {
        acc += chunk;
        setAiAnalysis((prev) => ({ ...prev, text: acc }));
      });
    } catch (err) {
      setAiAnalysis((prev) => ({ ...prev, text: `Error: ${err.message}` }));
    } finally {
      setAiAnalysis((prev) => ({ ...prev, loading: false }));
    }
  };

  const updateRow = async (row, patch) => {
    if (!runId || !row) return;
    try {
      await api.patch(`/recons/runs/${runId}/row`, { key: row.key, status: row.status, ...patch });
      await fetchRun();
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  if (!reconId) {
    return (
      <Alert severity="info">
        Save the reconciliation, then click <b>Run now</b> to see results here.
      </Alert>
    );
  }
  if (!runId || runs.length === 0) {
    return (
      <Alert severity="info" action={
        <Button size="small" onClick={onGoToConfig}>Configure</Button>
      }>
        No runs yet. Click <b>Run now</b> in the side panel to compare and the results will appear here.
      </Alert>
    );
  }
  if (loading && !run) return <LinearProgress />;
  if (error) return <Alert severity="error" onClose={() => setError('')}>{error}</Alert>;
  if (!run) return null;

  const c = run.summary?.rowCounts || {};
  const totals = run.summary?.totals || {};
  const measureKeys = Object.keys(totals);
  const matchRate = run.summary?.matchRate || 0;
  const coverageA = run.summary?.coverageA || 0;
  const coverageB = run.summary?.coverageB || 0;
  const newBreaks = run.summary?.newBreaksVsPrior || 0;
  const persistent = c.persistent || 0;

  // Materiality threshold for delta colour-grading
  const matAbs = Number(run.options?.materiality?.abs) || 0;
  const matPct = Number(run.options?.materiality?.pct) || 0;
  const deltaSeverity = (a, b, diff) => {
    const d = Math.abs(Number(diff) || 0);
    const base = Math.max(Math.abs(Number(a) || 0), Math.abs(Number(b) || 0));
    const allowed = Math.max(matAbs, matPct * base);
    if (allowed > 0) {
      if (d <= allowed) return { bg: 'rgba(34,197,94,0.06)', fg: '#15803d' }; // immaterial
      if (d <= allowed * 5) return { bg: 'rgba(234,179,8,0.10)', fg: '#a16207' }; // small
      return { bg: 'rgba(220,38,38,0.10)', fg: '#b91c1c' }; // big
    }
    return { bg: d === 0 ? 'transparent' : 'rgba(220,38,38,0.06)', fg: d === 0 ? 'inherit' : '#b91c1c' };
  };

  // Trend across last 12 runs (oldest → newest)
  const trend = (runs || [])
    .slice(0, 12).reverse()
    .map((r) => Number(r.summary?.matchRate) || 0);

  // Possible group-by columns = attribute keys + measure keys
  const groupableCols = Array.from(new Set([
    ...Object.keys((run.rows && run.rows[0]?.a) || {}),
    ...Object.keys((run.rows && run.rows[0]?.b) || {}),
  ])).filter((k) => k !== '__count' && !measureKeys.includes(k));

  // Client-side group-by aggregation of currently-displayed bucket
  const groupAgg = (() => {
    if (!groupBy) return null;
    const map = new Map();
    for (const r of (run.rows || [])) {
      const v = r.a?.[groupBy] ?? r.b?.[groupBy] ?? '—';
      const k = String(v);
      const e = map.get(k) || { rows: 0, deltas: {} };
      e.rows++;
      for (const m of measureKeys) {
        e.deltas[m] = (e.deltas[m] || 0) + (Number(r.deltas?.[m]?.diff) || 0);
      }
      map.set(k, e);
    }
    return Array.from(map, ([k, v]) => ({ key: k, ...v })).sort((x, y) => y.rows - x.rows);
  })();

  return (
    <Stack spacing={2}>
      {/* Run picker (when there's more than one) */}
      {runs.length > 1 && (
        <FormControl size="small" sx={{ alignSelf: 'flex-start', minWidth: 320 }}>
          <InputLabel>Showing run</InputLabel>
          <Select label="Showing run" value={runId} onChange={(e) => onPickRun(e.target.value)}>
            {runs.map((r) => (
              <MenuItem key={r._id} value={r._id}>
                {new Date(r.runAt).toLocaleString()}
                {' · '}
                {r.summary?.rowCounts?.matched ?? 0}/{r.summary?.rowCounts?.mismatched ?? 0}/{r.summary?.rowCounts?.onlyA ?? 0}/{r.summary?.rowCounts?.onlyB ?? 0}
                {r.signOff?.certified ? '  ✓' : ''}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {/* Run header bar with timestamp + sign-off + export */}
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 200 }}>
          Run at {new Date(run.runAt).toLocaleString()} · {run.durationMs} ms
          {certified && run.signOff?.by && <> · Certified by <b>{run.signOff.by}</b> on {new Date(run.signOff.at).toLocaleDateString()}</>}
        </Typography>
        {(c.mismatched ?? 0) > 0 && (
          <Button
            size="small" variant="outlined"
            startIcon={aiAnalysis.loading ? <CircularProgress size={13} /> : <AutoAwesomeIcon fontSize="small" />}
            onClick={analyseWithAI}
            disabled={aiAnalysis.loading}
            sx={{
              borderRadius: 2, fontWeight: 600, textTransform: 'none',
              color: '#7c3aed', borderColor: '#ddd6fe', bgcolor: '#faf5ff',
              '&:hover': { bgcolor: '#ede9fe', borderColor: '#c4b5fd' },
            }}
          >
            AI Analyse
          </Button>
        )}
        <Button
          size="small"
          variant={certified ? 'contained' : 'outlined'}
          startIcon={signing ? <CircularProgress size={13} sx={{ color: certified ? '#fff' : '#15803d' }} /> : (certified ? <LockIcon fontSize="small" /> : <VerifiedIcon fontSize="small" />)}
          onClick={toggleSignoff}
          disabled={signing}
          sx={{
            borderRadius: 2, fontWeight: 700, textTransform: 'none',
            ...(certified
              ? { bgcolor: '#15803d', color: '#fff', boxShadow: 'none', '&:hover': { bgcolor: '#166534' } }
              : { color: '#15803d', borderColor: '#bbf7d0', bgcolor: '#f0fdf4', '&:hover': { bgcolor: '#dcfce7', borderColor: '#86efac' } }),
          }}
        >
          {certified ? 'Certified — unlock' : 'Certify run'}
        </Button>
        <Button startIcon={<DownloadIcon />} size="small" variant="outlined" onClick={exportCsv}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}>
          Export {bucket}
        </Button>
      </Stack>

      {/* AI variance analysis streaming panel */}
      {aiAnalysis.open && (
        <Box sx={{ p: 2, bgcolor: '#faf5ff', border: '1px solid #ddd6fe', borderRadius: 2.5 }}>
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1 }}>
            <AutoAwesomeIcon sx={{ fontSize: 16, color: '#7c3aed' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#4c1d95' }}>AI Variance Analysis</Typography>
            {aiAnalysis.loading && <CircularProgress size={12} sx={{ color: '#7c3aed' }} />}
            <Box sx={{ flex: 1 }} />
            <IconButton size="small" onClick={() => setAiAnalysis({ open: false, text: '', loading: false })}>
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Stack>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, color: '#1e293b' }}>
            {aiAnalysis.text || (aiAnalysis.loading ? 'Analysing…' : '')}
          </Typography>
        </Box>
      )}

      {/* Headline KPI strip — match-rate / coverage / breaks */}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
        <Box sx={{ flex: 1, p: 2, bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: 2.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.65rem' }}>Match rate</Typography>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a', mt: 0.25 }}>{(matchRate * 100).toFixed(1)}%</Typography>
          <LinearProgress variant="determinate" value={matchRate * 100}
            sx={{ mt: 1, height: 6, borderRadius: 3, bgcolor: '#f1f5f9', '& .MuiLinearProgress-bar': { bgcolor: matchRate > 0.95 ? '#16a34a' : matchRate > 0.8 ? '#eab308' : '#dc2626' } }} />
          {trend.length > 1 && (
            <Box sx={{ mt: 1.25 }}>
              <Sparkline values={trend} color="#3b82f6" />
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>Last {trend.length} runs</Typography>
            </Box>
          )}
        </Box>
        <Box sx={{ flex: 1, p: 2, bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: 2.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.65rem' }}>Coverage</Typography>
          <Stack spacing={1.25} sx={{ mt: 1 }}>
            <Box>
              <Stack direction="row" justifyContent="space-between"><Typography variant="caption" sx={{ fontWeight: 600, color: '#1e40af' }}>Side A</Typography><Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{(coverageA * 100).toFixed(1)}%</Typography></Stack>
              <LinearProgress variant="determinate" value={coverageA * 100} sx={{ height: 6, borderRadius: 3, bgcolor: '#eff6ff', '& .MuiLinearProgress-bar': { bgcolor: '#3b82f6' } }} />
            </Box>
            <Box>
              <Stack direction="row" justifyContent="space-between"><Typography variant="caption" sx={{ fontWeight: 600, color: '#7c3aed' }}>Side B</Typography><Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{(coverageB * 100).toFixed(1)}%</Typography></Stack>
              <LinearProgress variant="determinate" value={coverageB * 100} sx={{ height: 6, borderRadius: 3, bgcolor: '#faf5ff', '& .MuiLinearProgress-bar': { bgcolor: '#7c3aed' } }} />
            </Box>
          </Stack>
        </Box>
        <Box sx={{ flex: 1, p: 2, bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: 2.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.65rem' }}>Breaks</Typography>
          <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#dc2626' }}>{c.mismatched ?? 0}</Typography>
              <Typography variant="caption" color="text.secondary">mismatched</Typography>
            </Box>
            {(c.immaterial ?? 0) > 0 && (
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#475569' }}>{c.immaterial}</Typography>
                <Typography variant="caption" color="text.secondary">immaterial</Typography>
              </Box>
            )}
          </Stack>
          <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap' }} useFlexGap>
            {newBreaks > 0 && <Chip size="small" icon={<FiberNewIcon sx={{ fontSize: 14 }} />} label={`${newBreaks} new vs prior`} sx={{ height: 20, fontSize: '0.65rem', bgcolor: '#fee2e2', color: '#991b1b', fontWeight: 600 }} />}
            {persistent > 0 && <Chip size="small" label={`${persistent} persistent`} sx={{ height: 20, fontSize: '0.65rem', bgcolor: '#fef3c7', color: '#92400e', fontWeight: 600 }} />}
          </Stack>
        </Box>
      </Stack>

      {/* Top-line counts (dense pill bar) */}
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
        <Chip color="success" label={`Matched ${c.matched ?? 0}`} sx={{ borderRadius: 1.5 }} />
        <Chip color="warning" label={`Mismatched ${c.mismatched ?? 0}`} sx={{ borderRadius: 1.5 }} />
        {(c.immaterial ?? 0) > 0 && <Chip label={`Immaterial ${c.immaterial}`} sx={{ borderRadius: 1.5, bgcolor: '#e2e8f0' }} />}
        <Chip label={`Only in A ${c.onlyA ?? 0}`} sx={{ borderRadius: 1.5 }} />
        <Chip label={`Only in B ${c.onlyB ?? 0}`} sx={{ borderRadius: 1.5 }} />
        <Chip variant="outlined" label={`A rows: ${c.a ?? 0}`} sx={{ borderRadius: 1.5 }} />
        <Chip variant="outlined" label={`B rows: ${c.b ?? 0}`} sx={{ borderRadius: 1.5 }} />
      </Stack>

      {run.rowsTruncated && (
        <Alert severity="warning" sx={{ py: 0.5 }}>
          Results were capped at 50,000 rows (full dataset had {run.totalRows?.toLocaleString()} rows).
          Use <strong>Export</strong> to download all rows, or pre-aggregate your dataset.
        </Alert>
      )}

      {/* Per-measure totals */}
      {measureKeys.length > 0 && (
        <Card variant="outlined" sx={{ borderRadius: 2.5 }}>
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

      {/* Bucket sub-tabs + group-by + rows */}
      <Card variant="outlined" sx={{ borderRadius: 2.5 }}>
        <Stack direction="row" alignItems="center" sx={{ borderBottom: 1, borderColor: 'divider', pr: 1.5 }}>
          <Tabs value={bucket} onChange={(_, v) => setBucket(v)} sx={{ flex: 1, minHeight: 40 }}>
            {STATUS_BUCKETS.map((s) => {
              const n = s.key === 'matched' ? c.matched
                : s.key === 'mismatched' ? c.mismatched
                : s.key === 'immaterial' ? (c.immaterial ?? 0)
                : s.key === 'only_a' ? c.onlyA
                : c.onlyB ?? 0;
              return <Tab key={s.key} value={s.key} label={`${s.label} (${n ?? 0})`} sx={{ textTransform: 'none', minHeight: 40, fontSize: '0.8rem' }} />;
            })}
          </Tabs>
          {groupableCols.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Group by</InputLabel>
              <Select label="Group by" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                <MenuItem value=""><em>none</em></MenuItem>
                {groupableCols.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </Select>
            </FormControl>
          )}
        </Stack>

        {/* Group-by aggregation view */}
        {groupAgg && (
          <Box sx={{ overflowX: 'auto', borderBottom: '1px solid #e2e8f0' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>{groupBy}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Rows</TableCell>
                  {measureKeys.map((m) => <TableCell key={m} align="right" sx={{ fontWeight: 700 }}>Σ Δ {m}</TableCell>)}
                </TableRow>
              </TableHead>
              <TableBody>
                {groupAgg.slice(0, 50).map((g) => (
                  <TableRow key={g.key} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{g.key}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{g.rows}</TableCell>
                    {measureKeys.map((m) => {
                      const sev = deltaSeverity(0, 0, g.deltas[m]);
                      return <TableCell key={m} align="right" sx={{ fontFamily: 'monospace', color: sev.fg, bgcolor: sev.bg }}>{fmtNum(g.deltas[m])}</TableCell>;
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}

        {/* Per-row table */}
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 28 }}></TableCell>
                <TableCell>Key</TableCell>
                {measureKeys.map((m) => [
                  <TableCell key={`${m}-a`} align="right">{m} (A)</TableCell>,
                  <TableCell key={`${m}-b`} align="right">{m} (B)</TableCell>,
                  <TableCell key={`${m}-d`} align="right">Δ</TableCell>,
                ])}
                <TableCell sx={{ minWidth: 140 }}>Category</TableCell>
                <TableCell>Notes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(run.rows || []).map((r, i) => (
                <ResultRow
                  key={i}
                  row={r}
                  measureKeys={measureKeys}
                  deltaSeverity={deltaSeverity}
                  certified={certified}
                  onUpdate={updateRow}
                />
              ))}
              {(run.rows || []).length === 0 && (
                <TableRow><TableCell colSpan={3 + measureKeys.length * 3 + 1} sx={{ color: 'text.secondary', py: 3, textAlign: 'center' }}>
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
    </Stack>
  );
}

/** A single row in the results table — renders measures, age/new chips, and
 *  inline category select + note popover + copy-key button. */
function ResultRow({ row: r, measureKeys, deltaSeverity, certified, onUpdate }) {
  const [noteAnchor, setNoteAnchor] = useState(null);
  const [draftNote, setDraftNote] = useState(r.note || '');
  const [copyTip, setCopyTip] = useState('Copy key');

  useEffect(() => { setDraftNote(r.note || ''); }, [r.note]);

  const cat = CATEGORY_BY_KEY[r.category || ''] || CATEGORY_BY_KEY[''];
  const isBreak = r.status !== 'matched';
  const persistent = Number(r.age) > 1;

  const copyKey = () => {
    if (!r.key) return;
    try { navigator.clipboard.writeText(String(r.key)); setCopyTip('Copied ✓'); setTimeout(() => setCopyTip('Copy key'), 1400); }
    catch { /* clipboard not available */ }
  };

  const saveNote = async () => {
    setNoteAnchor(null);
    if (draftNote === (r.note || '')) return;
    await onUpdate(r, { note: draftNote });
  };

  return (
    <TableRow hover>
      {/* tiny status indicator */}
      <TableCell sx={{ p: 0, width: 28 }}>
        <Stack direction="column" alignItems="center" spacing={0.25}>
          {r.age === 1 && (
            <Tooltip title="New break (not present in previous run)">
              <FiberNewIcon sx={{ fontSize: 14, color: '#dc2626' }} />
            </Tooltip>
          )}
          {persistent && (
            <Tooltip title={`Persistent break — seen in ${r.age} consecutive runs`}>
              <Chip size="small" label={`×${r.age}`} sx={{ height: 16, fontSize: '0.6rem', bgcolor: '#fef3c7', color: '#92400e', fontWeight: 700, borderRadius: 1 }} />
            </Tooltip>
          )}
        </Stack>
      </TableCell>

      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>{r.key || '—'}</Box>
          {r.key && (
            <Tooltip title={copyTip}>
              <IconButton size="small" onClick={copyKey} sx={{ p: 0.25, color: 'text.disabled', '&:hover': { color: '#1e40af' } }}>
                <ContentCopyIcon sx={{ fontSize: 13 }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </TableCell>

      {measureKeys.map((m) => {
        const a = r.a?.[m]; const b = r.b?.[m]; const d = r.deltas?.[m];
        const ok = d?.ok !== false;
        const sev = ok ? { bg: 'transparent', fg: 'inherit' } : deltaSeverity(a, b, d?.diff);
        return [
          <TableCell key={`${m}-a`} align="right" sx={{ fontFamily: 'monospace' }}>{r.a ? fmtNum(a) : '—'}</TableCell>,
          <TableCell key={`${m}-b`} align="right" sx={{ fontFamily: 'monospace' }}>{r.b ? fmtNum(b) : '—'}</TableCell>,
          <TableCell key={`${m}-d`} align="right" sx={{ bgcolor: sev.bg, color: sev.fg }}>
            {r.a && r.b ? <Delta a={a} b={b} /> : '—'}
          </TableCell>,
        ];
      })}

      {/* Category select (only meaningful for breaks) */}
      <TableCell sx={{ p: 0.5 }}>
        {isBreak ? (
          <Select
            size="small" value={r.category || ''} variant="standard" disableUnderline
            disabled={certified}
            onChange={(e) => onUpdate(r, { category: e.target.value })}
            renderValue={(v) => {
              const meta = CATEGORY_BY_KEY[v || ''] || cat;
              return <Chip size="small" label={meta.label} sx={{ height: 20, fontSize: '0.65rem', bgcolor: meta.bg, color: meta.fg, fontWeight: 600, borderRadius: 1 }} />;
            }}
            sx={{ width: '100%', '& .MuiSelect-select': { py: 0.5 } }}
          >
            {BREAK_CATEGORIES.map((c) => (
              <MenuItem key={c.key || '__none'} value={c.key} sx={{ fontSize: '0.8rem' }}>
                <Chip size="small" label={c.label} sx={{ height: 18, fontSize: '0.65rem', bgcolor: c.bg, color: c.fg, fontWeight: 600, borderRadius: 1, mr: 0.75 }} />
              </MenuItem>
            ))}
          </Select>
        ) : <Typography variant="caption" color="text.disabled">—</Typography>}
      </TableCell>

      <TableCell>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
          {r.attrIssues?.length > 0 && (
            <Tooltip title={r.attrIssues.map((x) => `${x.field}: ${x.a} ≠ ${x.b}`).join(' · ')}>
              <Chip size="small" color="warning" variant="outlined" label={`${r.attrIssues.length} attr diff`} sx={{ height: 18, fontSize: '0.65rem', borderRadius: 1 }} />
            </Tooltip>
          )}
          {r.a?.__count > 1 && <Chip size="small" label={`A ×${r.a.__count}`} sx={{ height: 18, fontSize: '0.65rem', borderRadius: 1 }} />}
          {r.b?.__count > 1 && <Chip size="small" label={`B ×${r.b.__count}`} sx={{ height: 18, fontSize: '0.65rem', borderRadius: 1 }} />}
          {isBreak && (
            <>
              <Tooltip title={r.note ? 'Edit note' : 'Add note'}>
                <IconButton size="small" onClick={(e) => { setDraftNote(r.note || ''); setNoteAnchor(e.currentTarget); }}
                  disabled={certified}
                  sx={{ p: 0.25, color: r.note ? '#7c3aed' : 'text.disabled', '&:hover': { color: '#7c3aed' } }}>
                  <StickyNote2Icon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
              {r.note && (
                <Tooltip title={
                  <>
                    <Box sx={{ fontWeight: 700, mb: 0.25 }}>{r.noteBy || 'note'}{r.noteAt ? ` · ${new Date(r.noteAt).toLocaleString()}` : ''}</Box>
                    <Box>{r.note}</Box>
                  </>
                }>
                  <Chip size="small" label={r.note.length > 24 ? `${r.note.slice(0, 24)}…` : r.note}
                    sx={{ height: 18, fontSize: '0.65rem', borderRadius: 1, bgcolor: '#faf5ff', color: '#6d28d9', maxWidth: 240 }} />
                </Tooltip>
              )}
            </>
          )}
        </Stack>
        <Popover
          open={Boolean(noteAnchor)} anchorEl={noteAnchor}
          onClose={() => setNoteAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          PaperProps={{ sx: { p: 1.5, width: 320, borderRadius: 2 } }}
        >
          <Typography variant="caption" sx={{ fontWeight: 700, color: '#0f172a' }}>Break note</Typography>
          <TextField
            size="small" fullWidth multiline minRows={3} maxRows={8} autoFocus
            value={draftNote} onChange={(e) => setDraftNote(e.target.value)}
            placeholder="Why is this break here? What did you check?"
            sx={{ mt: 0.75 }}
          />
          <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: 1 }}>
            <Button size="small" onClick={() => setNoteAnchor(null)} sx={{ textTransform: 'none' }}>Cancel</Button>
            <Button size="small" variant="contained" onClick={saveNote}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, bgcolor: '#14213d', boxShadow: 'none', '&:hover': { bgcolor: '#0a1628', boxShadow: 'none' } }}>
              Save note
            </Button>
          </Stack>
        </Popover>
      </TableCell>
    </TableRow>
  );
}
