import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogTitle, DialogActions, DialogContentText,
  IconButton, Typography, Stack, Chip,
  Box, Button, Divider, Skeleton, Switch, FormControlLabel,
  TextField, FormControl, InputLabel, Select, MenuItem,
  CircularProgress, Tooltip, Snackbar, Alert, Card, CardContent,
  Tabs, Tab, Table, TableHead, TableRow, TableCell, TableBody, LinearProgress,
  Popover, Collapse, Drawer, Avatar,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import HighlightOffOutlinedIcon from '@mui/icons-material/HighlightOffOutlined';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import EditIcon from '@mui/icons-material/Edit';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import api from '../../hooks/useQuery';
import { streamSSE } from '../../hooks/useAI';
import SourceSidePicker from './SourceSidePicker';
import MappingWizard from './MappingWizard';
import useReconContextStore from '../../store/reconContextStore';
import AppToast from '../shared/AppToast';
import SearchSelect from '../shared/SearchSelect';
import BrandedDialogTitle from '../shared/BrandedDialogTitle';

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


/**
 * Live "would this match?" bar shown in the Mapping step. Reflects a real
 * server-side dry-run (no run is saved) so the user gets instant feedback as
 * they map columns instead of finding out only after they run.
 */
function MatchPreviewBar({ loading, data, error, ready }) {
  if (!ready) {
    return (
      <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#f8fafc', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', gap: 1 }}>
        <InfoOutlinedIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
        <Typography variant="caption" color="text.secondary">
          Map at least one <b>Match on</b> key pair to see a live match preview.
        </Typography>
      </Box>
    );
  }
  const c = data?.summary?.rowCounts || {};
  const rate = Number(data?.summary?.matchRate) || 0;
  const total = (c.matched ?? 0) + (c.mismatched ?? 0) + (c.onlyA ?? 0) + (c.onlyB ?? 0) + (c.immaterial ?? 0);
  const barColor = rate > 0.95 ? '#86efac' : rate > 0.8 ? '#fcd34d' : '#fca5a5';
  return (
    <Box sx={{ p: 1.75, borderRadius: 2, bgcolor: '#fff', border: '1px solid #e2e8f0' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#475569', fontSize: '0.62rem' }}>
          Live match preview
        </Typography>
        {loading && <CircularProgress size={12} sx={{ color: '#3b82f6' }} />}
        <Box sx={{ flex: 1 }} />
        {error
          ? <Typography variant="caption" color="error">{error}</Typography>
          : data && (
            <Typography variant="caption" sx={{ color: '#0f172a', fontWeight: 700 }}>
              {(rate * 100).toFixed(1)}% match
              {data.limited && <Box component="span" sx={{ color: '#94a3b8', fontWeight: 400 }}> · sample</Box>}
            </Typography>
          )}
      </Stack>
      {data && !error ? (
        <>
          <Box sx={{ position: 'relative', height: 8, borderRadius: 4, bgcolor: '#f1f5f9', overflow: 'hidden' }}>
            <Box sx={{ position: 'absolute', inset: 0, width: `${Math.min(100, rate * 100)}%`, bgcolor: barColor, borderRadius: 4, transition: 'width .35s ease' }} />
          </Box>
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }} useFlexGap>
            <Chip size="small" label={`${c.matched ?? 0} matched`} sx={{ height: 20, fontSize: '0.65rem', bgcolor: '#dcfce7', color: '#166534', fontWeight: 600, borderRadius: 1 }} />
            <Chip size="small" label={`${c.mismatched ?? 0} mismatched`} sx={{ height: 20, fontSize: '0.65rem', bgcolor: '#fef3c7', color: '#92400e', fontWeight: 600, borderRadius: 1 }} />
            <Chip size="small" label={`A-only ${c.onlyA ?? 0}`} sx={{ height: 20, fontSize: '0.65rem', bgcolor: '#eff6ff', color: '#1e40af', fontWeight: 600, borderRadius: 1 }} />
            <Chip size="small" label={`B-only ${c.onlyB ?? 0}`} sx={{ height: 20, fontSize: '0.65rem', bgcolor: '#faf5ff', color: '#7c3aed', fontWeight: 600, borderRadius: 1 }} />
            <Box sx={{ flex: 1 }} />
            <Typography variant="caption" color="text.disabled" sx={{ alignSelf: 'center' }}>{total.toLocaleString()} keys</Typography>
          </Stack>
          {data.sampleSize > 0 && (
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 1 }}>
              <InfoOutlinedIcon sx={{ fontSize: 13, color: '#94a3b8' }} />
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.68rem' }}>
                Fast estimate from a sample of the first {data.sampleSize} rows per side — run the reconciliation for exact figures.
              </Typography>
            </Stack>
          )}
        </>
      ) : !error && (
        <Typography variant="caption" color="text.secondary">{loading ? 'Checking…' : 'Adjust the mapping to preview matches.'}</Typography>
      )}
    </Box>
  );
}

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
  const [runMsg, setRunMsg] = useState('');
  const [runs, setRuns] = useState([]);
  const [latestBreaks, setLatestBreaks] = useState(null); // top mismatched rows of the latest run, for AI analysis
  const [railOpen, setRailOpen] = useState(true);
  const [metaEditing, setMetaEditing] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [tab, setTab] = useState(0); // 0-3: config steps, 4: results
  const [selectedRunId, setSelectedRunId] = useState(null);
  const baselineRef = useRef(null);
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
  const [matchPreview, setMatchPreview] = useState({ loading: false, data: null, error: '' });
  const previewTimer = useRef(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const setReconCtx = useReconContextStore((s) => s.setRecon);
  const clearReconCtx = useReconContextStore((s) => s.clearRecon);

  // Hydrate when opened with a new id, or initialize a blank "new" recon.
  useEffect(() => {
    if (!open) return;
    setError(''); setRuns([]); setDirty(false); setNameError(false);
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

  // Fetch the latest run's top mismatched rows so the AI can analyse the
  // actual results grid (not just the summary counts).
  useEffect(() => {
    const runId = runs[0]?._id;
    if (!open || !runId) { setLatestBreaks(null); return; }
    let cancelled = false;
    api.get(`/recons/runs/${runId}`, { params: { status: 'mismatched', limit: 30 } })
      .then(({ data }) => { if (!cancelled) setLatestBreaks({ rows: data.rows || [], total: data.total ?? (data.rows || []).length }); })
      .catch(() => { if (!cancelled) setLatestBreaks(null); });
    return () => { cancelled = true; };
  }, [open, runs]);

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
      lastRunBreaks: latestBreaks,
    });
  }, [open, activeId, recon, columnsA, columnsB, runs, latestBreaks, setReconCtx]);
  useEffect(() => () => clearReconCtx(), [clearReconCtx]);

  const set = (patch) => setRecon((r) => ({ ...r, ...patch }));

  // ── Live match preview (dry-run) ──────────────────────────────────────────
  // While on the Mapping step, debounce a real (non-saving) match against the
  // server so the user sees "≈ X / Y rows match" update as they map columns.
  const previewKey = useMemo(() => JSON.stringify({
    a: recon.sourceA, b: recon.sourceB,
    keys: (recon.mapping?.keys || []).filter((k) => k.a && k.b),
    measures: (recon.mapping?.measures || []).filter((m) => m.a && m.b),
    attributes: (recon.mapping?.attributes || []).filter((x) => x.a && x.b),
    options: recon.options,
  }), [recon.sourceA, recon.sourceB, recon.mapping, recon.options]);

  useEffect(() => {
    if (tab !== 1) return undefined;
    const keyPairs = (recon.mapping?.keys || []).filter((k) => k.a && k.b);
    if (!recon.sourceA || !recon.sourceB || keyPairs.length === 0) {
      setMatchPreview({ loading: false, data: null, error: '' });
      return undefined;
    }
    if (previewTimer.current) clearTimeout(previewTimer.current);
    setMatchPreview((p) => ({ ...p, loading: true, error: '' }));
    previewTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.post('/recons/preview-match', {
          sourceA: recon.sourceA, sourceB: recon.sourceB,
          mapping: recon.mapping, options: recon.options,
        });
        setMatchPreview({ loading: false, data, error: '' });
      } catch (e) {
        setMatchPreview({ loading: false, data: null, error: e.response?.data?.error || e.message });
      }
    }, 700);
    return () => { if (previewTimer.current) clearTimeout(previewTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, previewKey]);

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
    if (!recon.name?.trim()) { setNameError(true); setMetaEditing(true); return; }
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
      setSavedMsg('Reconciliation saved successfully');
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
      setRunMsg('Reconciliation run complete');
      setTimeout(() => setRunMsg(''), 2500);
      // Refresh the run history list in the background.
      api.get(`/recons/${id}/runs`).then(({ data }) => setRuns(data || [])).catch(() => {});
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setRunning(false); }
  };

  const askAiExplainRecon = () => {
    const c = runs[0]?.summary?.rowCounts;
    const hasRun = !!c;
    const summary = hasRun
      ? `The latest run: ${c.matched ?? 0} matched, ${c.mismatched ?? 0} mismatched, ${c.onlyA ?? 0} only in A, ${c.onlyB ?? 0} only in B.`
      : 'This reconciliation has not been run yet.';
    const prompt = hasRun
      ? `Analyse the results of the reconciliation "${recon.name || 'Untitled'}" (${recon.sourceA?.displayName || 'Side A'} vs ${recon.sourceB?.displayName || 'Side B'}). ${summary}

Look at the mismatched/break rows in the results grid and tell me: the likely root causes of the variances, any patterns (which side runs higher, timing vs amount differences, recurring keys), the largest breaks by value, and 2–3 concrete next steps to investigate. Cite specific keys and numbers in **bold**; keep it concise.`
      : `Explain the reconciliation "${recon.name || 'Untitled'}" (${recon.sourceA?.displayName || 'Side A'} vs ${recon.sourceB?.displayName || 'Side B'}): what it's set up to compare, and what I should do next. ${summary}`;
    window.dispatchEvent(new CustomEvent('fyntrac:ai:open', { detail: { prompt } }));
  };

  const handleClose = () => {
    if (dirty) setConfirmCloseOpen(true);
    else onClose?.();
  };
  const confirmDiscard = () => { setConfirmCloseOpen(false); onClose?.(); };

  const canRun = recon.sourceA && recon.sourceB && (recon.mapping.keys || []).filter((k) => k.a && k.b).length > 0;

  // Guided-flow step model: each step knows whether its prerequisite is met
  // (enabled) and whether it's been satisfied (done) so the header can show a
  // numbered, gated stepper instead of four flat tabs.
  const sourcesReady = !!(recon.sourceA && recon.sourceB);
  const mappingReady = (recon.mapping?.keys || []).filter((k) => k.a && k.b).length > 0;
  const hasRun = runs.length > 0 || !!selectedRunId;
  const STEPS = [
    { label: 'Sources', done: sourcesReady, enabled: true, lockHint: '' },
    { label: 'Mapping', done: mappingReady, enabled: sourcesReady, lockHint: 'Pick both sources first' },
    { label: 'Options', done: canRun, enabled: sourcesReady, lockHint: 'Pick both sources first' },
    { label: 'Results', done: hasRun, enabled: canRun || hasRun, lockHint: 'Map at least one key pair, then run' },
  ];
  const statusLine = !sourcesReady ? 'Step 1 — choose the two sources to compare'
    : !mappingReady ? 'Step 2 — map at least one key column on each side'
    : !hasRun ? 'Ready to run — review options, then run the reconciliation'
    : 'Run complete — review the results below';

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
          width: '96vw', height: '95vh', m: 0, borderRadius: 4, maxWidth: 'none',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 32px 64px rgba(0,0,0,0.14)',
          border: '1px solid',
          borderColor: 'divider',
        },
      }}
    >
      {/* ── Branded header ── */}
      <Box
        sx={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          px: 3, pt: 3, pb: 2.5, flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(30,64,175,0.05) 0%, rgba(99,102,241,0.04) 100%)',
          borderBottom: '1px solid', borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <img src="/fyntrac9.png" alt="Fyntrac" style={{ width: 72, height: 'auto' }} />
          <Box>
            <Chip
              label="Reconciliation"
              size="small"
              sx={{
                height: 20, fontSize: '0.6rem', fontWeight: 700, letterSpacing: 0.8,
                textTransform: 'uppercase', bgcolor: 'rgba(99, 102, 241, 0.1)',
                color: '#6366F1', mb: 0.5, borderRadius: '8px',
              }}
            />
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2, color: 'text.primary' }} noWrap>
                {recon.name || (isNew ? 'New Reconciliation' : 'Reconciliation')}
              </Typography>
              {recon.sourceA?.displayName && (
                <Chip size="small" variant="outlined" label={`A: ${recon.sourceA.displayName}`} sx={{ height: 18, fontSize: '0.65rem', borderRadius: 1 }} />
              )}
              {recon.sourceB?.displayName && (
                <Chip size="small" variant="outlined" label={`B: ${recon.sourceB.displayName}`} sx={{ height: 18, fontSize: '0.65rem', borderRadius: 1 }} />
              )}
              {dirty && (
                <Chip size="small" color="warning" variant="outlined" label="Unsaved changes" sx={{ height: 18, fontSize: '0.65rem', borderRadius: 1 }} />
              )}
            </Stack>
            <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', mt: 0.25 }}>
              {statusLine}
            </Typography>
          </Box>
        </Box>
        <Tooltip title="Close" placement="left">
          <IconButton
            onClick={handleClose}
            size="small"
            sx={{ color: 'text.secondary', bgcolor: 'action.hover', borderRadius: 2, '&:hover': { bgcolor: 'error.50', color: 'error.main' } }}
          >
            <HighlightOffOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* ── Tabs (match Dataset modal) ───────────────────────────────── */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable" allowScrollButtonsMobile
        sx={{ px: 3, minHeight: 44, flexShrink: 0, borderBottom: '1px solid #e2e8f0', bgcolor: '#fff', '& .MuiTab-root': { fontWeight: 500 }, '& .MuiTab-root.Mui-selected': { color: '#1e40af', fontWeight: 700 }, '& .MuiTabs-indicator': { bgcolor: '#3b82f6' } }}
      >
        {STEPS.map((step, i) => (
          <Tab
            key={step.label}
            value={i}
            disabled={!step.enabled}
            sx={{ minHeight: 44, py: 0.5, textTransform: 'none' }}
            label={
              step.label === 'Results' && runs.length > 0
                ? <Stack direction="row" spacing={0.75} alignItems="center"><span>{step.label}</span><Chip size="small" label={runs.length} sx={{ height: 18, fontSize: '0.65rem' }} /></Stack>
                : step.label
            }
          />
        ))}
      </Tabs>

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
                    value={recon.name}
                    onChange={(e) => { set({ name: e.target.value }); if (nameError) setNameError(false); }}
                    placeholder="Reconciliation name"
                    error={nameError}
                    helperText={nameError ? 'Reconciliation name is required' : ''}
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
                    inputProps={{ maxLength: 160 }}
                    helperText={`${(recon.description || '').length}/160`}
                    FormHelperTextProps={{ sx: { textAlign: 'right', mx: 0 } }}
                  />
                ) : (
                  <Typography
                    variant="body2"
                    title={recon.description || undefined}
                    sx={{
                      color: 'text.secondary',
                      width: '100%',
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word',
                      display: '-webkit-box',
                      WebkitLineClamp: 6,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
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
                  {running ? 'Running…' : 'Run Preview'}
                </Button>
                <Button
                  size="small" variant="contained" fullWidth
                  startIcon={saving ? <CircularProgress size={13} color="inherit" /> : null}
                  onClick={save}
                  disabled={saving}
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
                  <Box sx={{ px: 2, py: 1.5, borderRadius: 2, bgcolor: '#eff6ff', border: '1px solid #bfdbfe' }}>
                    <Typography variant="body2" sx={{ color: '#1e40af' }}>
                      A reconciliation compares two datasets row-by-row to surface <strong>matches</strong>,
                      <strong> mismatches</strong>, and rows that exist on only one side. It's a quick 1-2-3:
                      pick the two sources, map the columns, then run.
                    </Typography>
                  </Box>
                  <SectionCard
                    title="Step 1 · Pick the two sides"
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
                  <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={1.5}>
                    {!sourcesReady && <Typography variant="caption" color="text.secondary">Choose both sides to continue</Typography>}
                    <Button
                      variant="contained" disabled={!sourcesReady} onClick={() => setTab(1)}
                      endIcon={<ChevronRightIcon />}
                      sx={{ borderRadius: 2, fontWeight: 700, textTransform: 'none', bgcolor: '#14213d', boxShadow: 'none', '&:hover': { bgcolor: '#0a1628', boxShadow: 'none' } }}
                    >
                      Next: Map columns
                    </Button>
                  </Stack>
                </Stack>
              )}

              {/* Tab 1 — Mapping */}
              {tab === 1 && (
                <Stack spacing={2}>
                  <SectionCard
                    title="Step 2 · Map the columns"
                    description="Match on = columns that identify the same record (e.g. invoice #, trade ID). Compare = the numbers to check (e.g. amount, quantity). Add at least one key pair to continue."
                  >
                    <MatchPreviewBar
                      loading={matchPreview.loading}
                      data={matchPreview.data}
                      error={matchPreview.error}
                      ready={mappingReady}
                    />
                    <MappingWizard
                      mapping={recon.mapping}
                      onChange={(m) => set({ mapping: m })}
                      columnsA={columnsA}
                      columnsB={columnsB}
                      sideAName={recon.sourceA?.displayName}
                      sideBName={recon.sourceB?.displayName}
                      onAISuggest={aiSuggest}
                      aiSuggestLoading={aiSuggestLoading}
                      aiReasoning={aiReasoning}
                      onClearReasoning={() => setAiReasoning('')}
                    />
                  </SectionCard>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Button onClick={() => setTab(0)} startIcon={<ChevronLeftIcon />} sx={{ textTransform: 'none', fontWeight: 600, color: '#475569' }}>
                      Back
                    </Button>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      {!mappingReady && <Typography variant="caption" color="text.secondary">Map at least one key pair</Typography>}
                      <Button
                        variant="contained" disabled={!mappingReady} onClick={() => setTab(2)}
                        endIcon={<ChevronRightIcon />}
                        sx={{ borderRadius: 2, fontWeight: 700, textTransform: 'none', bgcolor: '#14213d', boxShadow: 'none', '&:hover': { bgcolor: '#0a1628', boxShadow: 'none' } }}
                      >
                        Next: Options
                      </Button>
                    </Stack>
                  </Stack>
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
                                <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', color: '#93c5fd', display: 'block' }}>{l}</Typography>
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
                      <TextField
                        select size="small" label="Date granularity"
                        value={recon.options.dateGranularity || 'day'}
                        onChange={(e) => set({ options: { ...recon.options, dateGranularity: e.target.value } })}
                        sx={{ width: 180 }}
                      >
                        {['day', 'month', 'quarter', 'year'].map((g) => (
                          <MenuItem key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</MenuItem>
                        ))}
                      </TextField>
                    </Stack>
                  </SectionCard>

                  <Box>
                    <Button
                      onClick={() => setAdvancedOpen((o) => !o)}
                      startIcon={advancedOpen ? <ArrowDropUpIcon /> : <ArrowDropDownIcon />}
                      sx={{ textTransform: 'none', fontWeight: 700, color: '#475569', px: 1, '&:hover': { bgcolor: 'transparent', color: '#1e293b' } }}
                    >
                      Advanced options
                      <Typography component="span" variant="caption" sx={{ ml: 1, color: '#94a3b8', fontWeight: 400 }}>
                        materiality threshold · currency normalisation
                      </Typography>
                    </Button>
                  </Box>
                  <Collapse in={advancedOpen} unmountOnExit>
                  <Stack spacing={2}>
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
                              <Typography variant="caption" sx={{ color: '#1d4ed8', fontWeight: 700, display: 'block' }}>Absolute limit</Typography>
                              <Typography variant="caption" sx={{ color: '#94a3b8' }}>Largest dollar (or unit) difference allowed, e.g. 1.00 to ignore penny rounding.</Typography>
                            </Box>
                            <Box sx={{ mt: 0.5 }}>
                              <Typography variant="caption" sx={{ color: '#1d4ed8', fontWeight: 700, display: 'block' }}>Percent limit</Typography>
                              <Typography variant="caption" sx={{ color: '#94a3b8' }}>Largest relative difference, e.g. 0.001 means 0.1% of the larger of the two values.</Typography>
                            </Box>
                          </Box>
                        }>
                        <InfoOutlinedIcon sx={{ fontSize: 16, color: '#94a3b8', cursor: 'default', mt: 0.25 }} />
                      </Tooltip>
                    }
                  >
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                      <TextField
                        size="small" type="number" label="Absolute limit"
                        helperText="e.g. 1.00 — differences up to this are immaterial"
                        value={recon.options.materiality?.abs ?? 0}
                        onChange={(e) => set({ options: { ...recon.options, materiality: { ...(recon.options.materiality || EMPTY_MATERIALITY), abs: Number(e.target.value) || 0 } } })}
                        sx={{ flex: 1 }}
                        inputProps={{ step: '0.01', min: 0 }}
                      />
                      <TextField
                        size="small" type="number" label="Percent limit"
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
                    description="When sides are reported in different currencies, multiply each measure by the row's FX rate before comparing. Missing rates default to 1x (no conversion)."
                    action={
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Tooltip placement="left" arrow
                          componentsProps={{ tooltip: { sx: { maxWidth: 300, bgcolor: '#1e293b', border: '1px solid #334155' } }, arrow: { sx: { color: '#1e293b' } } }}
                          title={
                            <Box sx={{ p: 0.5 }}>
                              <Typography variant="caption" fontWeight={700} sx={{ display: 'block', mb: 0.5, color: '#e2e8f0' }}>Currency normalisation</Typography>
                              <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', lineHeight: 1.5 }}>
                                Use this when Side A and Side B are in different currencies. Each row's measure is converted to your base currency using the FX rate from a column you specify. Define one rate per currency code (e.g. EUR = 1.08 means 1 EUR = 1.08 USD). Missing rates are treated as 1x (no conversion).
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
                  </Collapse>
                  <Stack direction="row" justifyContent="flex-start" alignItems="center">
                    <Button onClick={() => setTab(1)} startIcon={<ChevronLeftIcon />} sx={{ textTransform: 'none', fontWeight: 600, color: '#475569' }}>
                      Back
                    </Button>
                  </Stack>
                </Stack>
              )}

              {/* Tab 3 — Results */}
              {tab === 3 && (
                (!selectedRunId && runs.length === 0) ? (
                  <Box sx={{
                    textAlign: 'center', py: 8, px: 4, borderRadius: 4,
                    border: '1px dashed #cbd5e1', bgcolor: '#fff',
                    animation: 'recon-empty-in 0.45s ease both',
                    '@keyframes recon-empty-in': { '0%': { opacity: 0, transform: 'translateY(10px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
                  }}>
                    <Stack alignItems="center" spacing={1.75}>
                      <Box sx={{
                        width: 64, height: 64, borderRadius: '50%', bgcolor: '#f1f5f9',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        animation: 'recon-empty-float 2.6s ease-in-out infinite',
                        '@keyframes recon-empty-float': { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
                      }}>
                        <PlayArrowIcon sx={{ fontSize: 32, color: '#94A3B8' }} />
                      </Box>
                      <Typography sx={{ fontFamily: 'Inter', fontSize: '1rem', fontWeight: 600, color: '#64748B' }}>
                        No results yet
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'Inter', color: '#94A3B8', maxWidth: 380 }}>
                        Run the reconciliation to compare the two sides and see matches, mismatches, and rows that exist on only one side here.
                      </Typography>
                      <Button
                        variant="outlined" disabled={!canRun || running} onClick={runNow}
                        startIcon={running ? <CircularProgress size={14} sx={{ color: '#15803d' }} /> : <PlayArrowIcon />}
                        sx={{
                          mt: 0.5, borderRadius: 2, fontWeight: 600, textTransform: 'none',
                          color: '#15803d', bgcolor: '#f0fdf4', border: '1px solid #bbf7d0',
                          '&:hover': { bgcolor: '#dcfce7', borderColor: '#86efac' },
                          '&.Mui-disabled': { bgcolor: '#f0fdf4', borderColor: '#dcfce7', color: '#86efac' },
                        }}
                      >
                        {running ? 'Running…' : 'Run reconciliation'}
                      </Button>
                      {!canRun && (
                        <Typography variant="caption" color="text.secondary">
                          Pick both sources and map a key pair first.
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                ) : (
                  <RunResultsView
                    reconId={activeId}
                    runId={selectedRunId}
                    runs={runs}
                    onGoToConfig={() => setTab(0)}
                    reconName={recon.name}
                    mapping={recon.mapping}
                  />
                )
              )}
            </>
          )}
        </Box>
      </Box>

      {/* Discard confirm */}
      <Dialog open={confirmCloseOpen} onClose={() => setConfirmCloseOpen(false)} maxWidth="xs">
        <BrandedDialogTitle label="Reconciliation" title="Discard Changes" onClose={() => setConfirmCloseOpen(false)} />
        <DialogContent>
          <DialogContentText>
            You have unsaved changes to this reconciliation. Closing now will lose them.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={confirmDiscard} color="error" variant="contained" sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}>
            Discard changes
          </Button>
        </DialogActions>
      </Dialog>

      <AppToast open={!!savedMsg} onClose={() => setSavedMsg('')} message={savedMsg} modal />
      <AppToast open={!!runMsg} onClose={() => setRunMsg('')} message={runMsg} modal />
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

// Break-management lifecycle. Empty key = the default "Open" state.
const BREAK_STATUSES = [
  { key: '',              label: 'Open',          bg: '#fee2e2', fg: '#991b1b' },
  { key: 'investigating', label: 'Investigating', bg: '#fef3c7', fg: '#92400e' },
  { key: 'resolved',      label: 'Resolved',      bg: '#dcfce7', fg: '#166534' },
  { key: 'explained',     label: 'Explained',     bg: '#dbeafe', fg: '#1e40af' },
];
const STATUS_BY_KEY = Object.fromEntries(BREAK_STATUSES.map((s) => [s.key, s]));
const initials = (s) => String(s || '').trim().split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

// Headline stat card (Match rate / Coverage / Breaks) — lifts + shadows on hover.
const STAT_CARD_SX = {
  flex: 1, p: 2, bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: 2.5,
  transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
  cursor: 'default',
  '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 10px 24px rgba(15,23,42,0.10)', borderColor: '#c7d2fe' },
};

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

// Collapse ISO timestamps (e.g. 2025-03-31T00:00:00.000Z) to plain dates for
// display in keys and record cells — recon dates don't carry a time component.
function prettyVal(v) {
  return String(v ?? '').replace(/(\d{4}-\d{2}-\d{2})[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?/g, '$1');
}

function Delta({ a, b }) {
  const d = (Number(b) || 0) - (Number(a) || 0);
  const color = d === 0 ? 'text.secondary' : (d > 0 ? '#22c55e' : '#ef4444');
  const Icon = d === 0 ? null : (d > 0 ? ArrowDropUpIcon : ArrowDropDownIcon);
  return (
    <Stack direction="row" alignItems="center" spacing={0.25} justifyContent="flex-end" sx={{ color }}>
      {Icon && <Icon sx={{ fontSize: 18 }} />}
      <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtNum(d)}</Typography>
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
        Multiplier to convert each row into <b>{baseCurrency}</b>. Example: if base is USD and you load a row tagged <code>EUR</code>, set <code>EUR = 1.08</code>.
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

function RunResultsView({ reconId, runId, runs, onGoToConfig, reconName, mapping }) {
  const [run, setRun] = useState(null);
  const [bucket, setBucket] = useState('matched');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [groupBy, setGroupBy] = useState(''); // attribute column key for drill-down
  const [aiAnalysis, setAiAnalysis] = useState({ open: false, text: '', loading: false });
  const [inspect, setInspect] = useState(null); // break row currently open in the inspector drawer

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
${mKeys.length > 0 ? `Measure totals: ${mKeys.map((m) => `${m}: Total A=${totals2[m]?.sumA}, Total B=${totals2[m]?.sumB}`).join('; ')}` : ''}
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
        Save the reconciliation, then click <b>Run Preview</b> to see results here.
      </Alert>
    );
  }
  if (!runId || runs.length === 0) {
    return (
      <Alert severity="info" action={
        <Button size="small" onClick={onGoToConfig}>Configure</Button>
      }>
        No runs yet. Click <b>Run Preview</b> in the side panel to compare and the results will appear here.
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
      {/* Run header bar with timestamp + export */}
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 200 }}>
          Run at {new Date(run.runAt).toLocaleString()} · {run.durationMs} ms · {(c.a ?? 0).toLocaleString()} rows on A, {(c.b ?? 0).toLocaleString()} on B
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
          size="small" variant="outlined"
          startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: 16 }} />}
          onClick={exportCsv}
          sx={{
            textTransform: 'none', fontSize: '0.72rem', fontWeight: 600, borderRadius: 2, py: 0.25,
            color: '#4f46e5', borderColor: '#c7d2fe', bgcolor: '#fff',
            '&:hover': { bgcolor: '#eef2ff', borderColor: '#a5b4fc' },
          }}
        >
          Export CSV
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
        <Box sx={STAT_CARD_SX}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.65rem' }}>Match rate</Typography>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a', mt: 0.25 }}>{(matchRate * 100).toFixed(1)}%</Typography>
          <LinearProgress variant="determinate" value={matchRate * 100}
            sx={{ mt: 1, height: 6, borderRadius: 3, bgcolor: '#f1f5f9', '& .MuiLinearProgress-bar': { bgcolor: matchRate > 0.95 ? '#86efac' : matchRate > 0.8 ? '#fcd34d' : '#fca5a5' } }} />
          {trend.length > 1 && (
            <Box sx={{ mt: 1.25 }}>
              <Sparkline values={trend} color="#3b82f6" />
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>Last {trend.length} runs</Typography>
            </Box>
          )}
        </Box>
        <Box sx={STAT_CARD_SX}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.65rem' }}>Coverage</Typography>
          <Stack spacing={1.25} sx={{ mt: 1 }}>
            <Box>
              <Stack direction="row" justifyContent="space-between"><Typography variant="caption" sx={{ fontWeight: 600, color: '#1e40af' }}>Side A</Typography><Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>{(coverageA * 100).toFixed(1)}%</Typography></Stack>
              <LinearProgress variant="determinate" value={coverageA * 100} sx={{ height: 6, borderRadius: 3, bgcolor: '#eff6ff', '& .MuiLinearProgress-bar': { bgcolor: '#93c5fd' } }} />
            </Box>
            <Box>
              <Stack direction="row" justifyContent="space-between"><Typography variant="caption" sx={{ fontWeight: 600, color: '#7c3aed' }}>Side B</Typography><Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>{(coverageB * 100).toFixed(1)}%</Typography></Stack>
              <LinearProgress variant="determinate" value={coverageB * 100} sx={{ height: 6, borderRadius: 3, bgcolor: '#faf5ff', '& .MuiLinearProgress-bar': { bgcolor: '#c4b5fd' } }} />
            </Box>
          </Stack>
        </Box>
        <Box sx={STAT_CARD_SX}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.65rem' }}>Breaks</Typography>
          <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#ef4444' }}>{c.mismatched ?? 0}</Typography>
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
                  <TableCell align="right">Total A</TableCell>
                  <TableCell align="right">Total B</TableCell>
                  <TableCell align="right">Difference</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {measureKeys.map((m) => (
                  <TableRow key={m}>
                    <TableCell>{m}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(totals[m].sumA)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(totals[m].sumB)}</TableCell>
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
            <SearchSelect
              value={groupBy}
              onChange={(val) => setGroupBy(val ?? '')}
              options={[{ value: '', label: 'none' }, ...groupableCols.map((c) => ({ value: c, label: c }))]}
              label="Group by"
              width={180}
            />
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
                  {measureKeys.map((m) => <TableCell key={m} align="right" sx={{ fontWeight: 700 }}>Difference · {m}</TableCell>)}
                </TableRow>
              </TableHead>
              <TableBody>
                {groupAgg.slice(0, 50).map((g) => (
                  <TableRow key={g.key} hover>
                    <TableCell sx={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.78rem' }}>{prettyVal(g.key)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{g.rows}</TableCell>
                    {measureKeys.map((m) => {
                      const sev = deltaSeverity(0, 0, g.deltas[m]);
                      return <TableCell key={m} align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: sev.fg, bgcolor: sev.bg }}>{fmtNum(g.deltas[m])}</TableCell>;
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
                  <TableCell key={`${m}-d`} align="right">Difference</TableCell>,
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
                  onUpdate={updateRow}
                  onOpen={setInspect}
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

      <BreakInspector
        row={inspect}
        measureKeys={measureKeys}
        onClose={() => setInspect(null)}
        onUpdate={updateRow}
      />
    </Stack>
  );
}

/**
 * Right-hand drawer that turns a single break into an actionable task: assign
 * an owner, set a status + due date, categorise, note it, and see the full
 * A-vs-B record with differing fields highlighted.
 */
function BreakInspector({ row, measureKeys, onClose, onUpdate }) {
  const [draft, setDraft] = useState({ assignee: '', breakStatus: '', dueDate: '', category: '', note: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    setDraft({
      assignee: row.assignee || '',
      breakStatus: row.breakStatus || '',
      dueDate: row.dueDate ? String(row.dueDate).slice(0, 10) : '',
      category: row.category || '',
      note: row.note || '',
    });
  }, [row]);

  const fields = useMemo(() => {
    if (!row) return [];
    const keys = Array.from(new Set([
      ...Object.keys(row.aFull || {}),
      ...Object.keys(row.bFull || {}),
    ]));
    return keys.sort();
  }, [row]);

  if (!row) return <Drawer anchor="right" open={false} onClose={onClose} />;

  const bucket = STATUS_BUCKETS.find((s) => s.key === row.status);
  const save = async () => {
    setSaving(true);
    try {
      await onUpdate(row, {
        assignee: draft.assignee,
        breakStatus: draft.breakStatus,
        dueDate: draft.dueDate || null,
        category: draft.category,
        note: draft.note,
      });
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <Drawer
      anchor="right" open={!!row} onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 460 }, p: 0 } }}
    >
      {/* Header */}
      <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a', flex: 1 }}>Break detail</Typography>
          {bucket && (() => {
            const tint = bucket.color === 'success' ? { bgcolor: '#dcfce7', color: '#166534' }
              : bucket.color === 'warning' ? { bgcolor: '#fef3c7', color: '#92400e' }
              : { bgcolor: '#f1f5f9', color: '#475569' };
            return <Chip size="small" label={bucket.label} sx={{ borderRadius: 1, height: 22, fontWeight: 600, ...tint }} />;
          })()}
          <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
        </Stack>
        <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', color: '#475569', wordBreak: 'break-all', display: 'block', mt: 0.5 }}>
          {prettyVal(row.key) || '—'}
        </Typography>
        {Number(row.age) > 1 && (
          <Chip size="small" label={`Persistent · seen in ${row.age} runs`} sx={{ mt: 0.75, height: 18, fontSize: '0.62rem', bgcolor: '#fef3c7', color: '#92400e', fontWeight: 600, borderRadius: 1 }} />
        )}
      </Box>

      <Box sx={{ p: 2.5, overflowY: 'auto' }}>
        {/* Workflow */}
        <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#475569', fontSize: '0.62rem' }}>Workflow</Typography>
        <Stack spacing={1.5} sx={{ mt: 1, mb: 2.5 }}>
          <FormControl size="small" fullWidth>
            <InputLabel>Status</InputLabel>
            <Select label="Status" value={draft.breakStatus} onChange={(e) => setDraft((d) => ({ ...d, breakStatus: e.target.value }))}>
              {BREAK_STATUSES.map((s) => <MenuItem key={s.key || 'open'} value={s.key}>{s.label}</MenuItem>)}
            </Select>
          </FormControl>
          <Stack direction="row" spacing={1.5}>
            <TextField size="small" fullWidth label="Assignee" placeholder="name or email"              value={draft.assignee} onChange={(e) => setDraft((d) => ({ ...d, assignee: e.target.value }))} />
            <TextField size="small" label="Due date" type="date"              InputLabelProps={{ shrink: true }} sx={{ width: 170 }}
              value={draft.dueDate} onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))} />
          </Stack>
          <FormControl size="small" fullWidth>
            <InputLabel>Category</InputLabel>
            <Select label="Category" value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}>
              {BREAK_CATEGORIES.map((c) => <MenuItem key={c.key || 'none'} value={c.key}>{c.label}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField size="small" fullWidth multiline minRows={2} maxRows={6} label="Note"            placeholder="Why is this break here? What did you check?"
            value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} />
        </Stack>

        {/* Measures */}
        {measureKeys.length > 0 && (
          <>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#475569', fontSize: '0.62rem' }}>Measures</Typography>
            <Table size="small" sx={{ mt: 0.5, mb: 2.5 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Measure</TableCell>
                  <TableCell align="right">A</TableCell>
                  <TableCell align="right">B</TableCell>
                  <TableCell align="right">Difference</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {measureKeys.map((m) => (
                  <TableRow key={m}>
                    <TableCell>{m}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{row.a ? fmtNum(row.a[m]) : '—'}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{row.b ? fmtNum(row.b[m]) : '—'}</TableCell>
                    <TableCell align="right">{row.a && row.b ? <Delta a={row.a[m]} b={row.b[m]} /> : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}

        {/* Full A vs B record */}
        <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#475569', fontSize: '0.62rem' }}>Full record · A vs B</Typography>
        {fields.length === 0 ? (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.75, fontStyle: 'italic' }}>
            No detail captured for this row.
          </Typography>
        ) : (
          <Table size="small" sx={{ mt: 0.5 }}>
            <TableHead>
              <TableRow>
                <TableCell>Field</TableCell>
                <TableCell sx={{ color: '#1e40af', fontWeight: 700 }}>A</TableCell>
                <TableCell sx={{ color: '#7c3aed', fontWeight: 700 }}>B</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {fields.map((f) => {
                const av = row.aFull?.[f]; const bv = row.bFull?.[f];
                const diff = String(av ?? '') !== String(bv ?? '');
                return (
                  <TableRow key={f} sx={{ bgcolor: diff ? 'rgba(251,191,36,0.10)' : 'transparent' }}>
                    <TableCell sx={{ fontWeight: 600, color: '#334155', fontSize: '0.72rem' }}>{f}</TableCell>
                    <TableCell sx={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.72rem', color: diff ? '#b45309' : '#475569' }}>{av == null || av === '' ? '—' : prettyVal(av)}</TableCell>
                    <TableCell sx={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.72rem', color: diff ? '#b45309' : '#475569' }}>{bv == null || bv === '' ? '—' : prettyVal(bv)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Box>

      {/* Footer */}
      <Box sx={{ mt: 'auto', px: 2.5, py: 2, borderTop: '1px solid #e2e8f0', bgcolor: '#fff' }}>
        <Stack direction="row" justifyContent="flex-end" spacing={1}>
          <Button onClick={onClose} sx={{ textTransform: 'none', fontWeight: 600, color: '#475569' }}>Close</Button>
          <Button variant="contained" onClick={save} disabled={saving}
            startIcon={saving ? <CircularProgress size={13} color="inherit" /> : null}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, bgcolor: '#14213d', boxShadow: 'none', '&:hover': { bgcolor: '#0a1628', boxShadow: 'none' } }}>
            Save
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}

/** A single row in the results table — renders measures, age/new chips, and
 *  inline category select + note popover + copy-key button. */
function ResultRow({ row: r, measureKeys, deltaSeverity, onUpdate, onOpen }) {
  const [noteAnchor, setNoteAnchor] = useState(null);
  const [draftNote, setDraftNote] = useState(r.note || '');
  const [copyTip, setCopyTip] = useState('Copy key');

  useEffect(() => { setDraftNote(r.note || ''); }, [r.note]);

  const cat = CATEGORY_BY_KEY[r.category || ''] || CATEGORY_BY_KEY[''];
  const isBreak = r.status !== 'matched';
  const persistent = Number(r.age) > 1;

  const copyKey = () => {
    if (!r.key) return;
    try { navigator.clipboard.writeText(String(r.key)); setCopyTip('Copied'); setTimeout(() => setCopyTip('Copy key'), 1400); }
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
              <FiberNewIcon sx={{ fontSize: 14, color: '#f87171' }} />
            </Tooltip>
          )}
          {persistent && (
            <Tooltip title={`Persistent break — seen in ${r.age} consecutive runs`}>
              <Chip size="small" label={`${r.age} runs`} sx={{ height: 16, fontSize: '0.6rem', bgcolor: '#fef3c7', color: '#92400e', fontWeight: 700, borderRadius: 1 }} />
            </Tooltip>
          )}
        </Stack>
      </TableCell>

      <TableCell sx={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>{prettyVal(r.key) || '—'}</Box>
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
          <TableCell key={`${m}-a`} align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{r.a ? fmtNum(a) : '—'}</TableCell>,
          <TableCell key={`${m}-b`} align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{r.b ? fmtNum(b) : '—'}</TableCell>,
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
                       onChange={(e) => onUpdate(r, { category: e.target.value })}
            renderValue={(v) => {
              const meta = CATEGORY_BY_KEY[v || ''] || cat;
              return <Chip size="small" label={meta.label} sx={{ height: 20, fontSize: '0.65rem', bgcolor: meta.bg, color: meta.fg, fontWeight: 600, borderRadius: 1 }} />;
            }}
            sx={{ width: '100%', '& .MuiSelect-select': { py: 0.5 } }}
          >
            {BREAK_CATEGORIES.map((c) => (
              <MenuItem key={c.key || '__none'} value={c.key} sx={{ fontSize: '0.8rem' }}>
                <Chip size="small" label={c.label} sx={{ height: 18, fontSize: '0.65rem', bgcolor: c.bg, color: c.fg, fontWeight: 600, borderRadius: '8px', mr: 0.75 }} />
              </MenuItem>
            ))}
          </Select>
        ) : <Typography variant="caption" color="text.disabled">—</Typography>}
      </TableCell>

      <TableCell>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
          {r.attrIssues?.length > 0 && (
            <Tooltip title={r.attrIssues.map((x) => `${x.field}: A is ${x.a}, B is ${x.b}`).join(' · ')}>
              <Chip size="small" color="warning" variant="outlined" label={`${r.attrIssues.length} attr diff`} sx={{ height: 18, fontSize: '0.65rem', borderRadius: 1 }} />
            </Tooltip>
          )}
          {r.a?.__count > 1 && <Chip size="small" label={`A: ${r.a.__count} rows`} sx={{ height: 18, fontSize: '0.65rem', borderRadius: 1 }} />}
          {r.b?.__count > 1 && <Chip size="small" label={`B: ${r.b.__count} rows`} sx={{ height: 18, fontSize: '0.65rem', borderRadius: 1 }} />}
          {isBreak && (
            <>
              {(() => { const st = STATUS_BY_KEY[r.breakStatus || ''] || STATUS_BY_KEY['']; return (
                <Tooltip title="Open break detail">
                  <Chip size="small" label={st.label} onClick={() => onOpen?.(r)}
                    sx={{ height: 18, fontSize: '0.62rem', bgcolor: st.bg, color: st.fg, fontWeight: 700, borderRadius: 1, cursor: 'pointer' }} />
                </Tooltip>
              ); })()}
              {r.assignee && (
                <Tooltip title={`Assigned to ${r.assignee}`}>
                  <Avatar sx={{ width: 18, height: 18, fontSize: '0.55rem', bgcolor: '#e0e7ff', color: '#3730a3', fontWeight: 700 }}>{initials(r.assignee)}</Avatar>
                </Tooltip>
              )}
              {r.dueDate && (
                <Chip size="small" label={`due ${String(r.dueDate).slice(0, 10)}`} sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#f1f5f9', color: '#475569', borderRadius: 1 }} />
              )}
              <Tooltip title="Inspect break (A vs B)">
                <IconButton size="small" onClick={() => onOpen?.(r)} sx={{ p: 0.25, color: 'text.disabled', '&:hover': { color: '#1e40af' } }}>
                  <InfoOutlinedIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title={r.note ? 'Edit note' : 'Add note'}>
                <IconButton size="small" onClick={(e) => { setDraftNote(r.note || ''); setNoteAnchor(e.currentTarget); }}
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
                    sx={{ height: 18, fontSize: '0.65rem', borderRadius: '8px', bgcolor: '#faf5ff', color: '#6d28d9', maxWidth: 240 }} />
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
