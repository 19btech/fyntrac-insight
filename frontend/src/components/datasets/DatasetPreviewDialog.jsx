import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogTitle, DialogActions, DialogContentText,
  IconButton, Typography, Stack, Chip,
  Tabs, Tab, Box, Button, Divider, Skeleton, Switch, FormControlLabel,
  TextField, FormControl, InputLabel, Select, MenuItem, List, ListItem,
  ListItemText, CircularProgress, Tooltip, Snackbar, Alert, Paper,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import HighlightOffOutlinedIcon from '@mui/icons-material/HighlightOffOutlined';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SaveIcon from '@mui/icons-material/Save';
import EditIcon from '@mui/icons-material/Edit';
import VerifiedIcon from '@mui/icons-material/Verified';
import HistoryIcon from '@mui/icons-material/History';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import StorageIcon from '@mui/icons-material/Storage';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import CodeIcon from '@mui/icons-material/Code';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import RestoreIcon from '@mui/icons-material/Restore';
import api from '../../hooks/useQuery';
import DataTable from '../charts/DataTable';
import { isHiddenColumn } from '../charts/_columnRules';
import { compileSteps } from '../dataset-builder/compileSteps';
import { StepCard, StepArrow, AddStepButton } from '../dataset-builder/StepCard';
import useDatasetContextStore from '../../store/datasetContextStore';

/**
 * Full-bleed modal for viewing AND editing a Dataset. Mirrors the shape of
 * `ReportPreviewDialog` (sticky header, collapsible side rail, lock/edit
 * pencils, pastel-green save toast, baseline-snapshot dirty tracking) but
 * with tabs and a side rail tailored to a dataset's job: a reusable,
 * potentially-certified table that other reports build on top of.
 *
 * Tabs:
 *   - Build       : the step stack (filter → combine → summarize → …)
 *   - Preview     : live result of the compiled pipeline
 *   - Schema      : output columns, hide toggles, descriptions
 *   - Lineage     : downstream reports/dashboards that depend on this
 *   - Pipeline    : compiled MongoDB JSON for the curious / debugging
 *   - History     : version snapshots (best-effort; falls back gracefully)
 *
 * Save persists name, description, source, steps, columnOrder, verified
 * via PUT /models/:id (or POST for a brand new dataset).
 */
const TABS = [
  { key: 'build', label: 'Build' },
  { key: 'preview', label: 'Preview' },
  { key: 'schema', label: 'Schema' },
  { key: 'lineage', label: 'Lineage' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'history', label: 'History' },
];

export default function DatasetPreviewDialog({
  open,
  datasetId,
  isNew = false,
  starter = null, // 'blank' | 'combine' | 'rollup' | { fromQuestionId }
  onClose,
  onSaved,
}) {
  const [tab, setTab] = useState('build');
  const [activeId, setActiveId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Editable working copy
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceCollection, setSourceCollection] = useState('');
  const [steps, setSteps] = useState([]);
  const [columnOrder, setColumnOrder] = useState([]);
  const [verified, setVerified] = useState(false);

  // Sample mode
  const [sampleMode, setSampleMode] = useState(true);
  const [sampleSize, setSampleSize] = useState(10000);

  // Preview state
  const [previewData, setPreviewData] = useState(null);
  const [stepCounts, setStepCounts] = useState([]);
  const [running, setRunning] = useState(false);

  // Lineage / history
  const [lineage, setLineage] = useState(null);
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [collections, setCollections] = useState([]);
  const [restoreTarget, setRestoreTarget] = useState(null); // version object to confirm restore

  // UI state
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [metaEditing, setMetaEditing] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(true);

  const [justAddedIndex, setJustAddedIndex] = useState(null);

  // Snapshot of the editable values at hydrate time. Dirty = current !== snapshot.
  const baselineRef = useRef('');
  const snapshot = (vals) => JSON.stringify({
    name: vals.name || '',
    description: vals.description || '',
    sourceCollection: vals.sourceCollection || '',
    steps: vals.steps || [],
    columnOrder: vals.columnOrder || [],
    verified: !!vals.verified,
  });

  // Load the available source collections list once per open.
  useEffect(() => {
    if (!open) return;
    api.get('/schema/collections').then((r) => setCollections(r.data || [])).catch(() => setCollections([]));
  }, [open]);

  // Hydrate when opened. Either from /models/:id, or with a starter template.
  useEffect(() => {
    if (!open) return;
    setTab('build'); setError(''); setDirty(false);
    setPreviewData(null); setStepCounts([]); setLineage(null); setVersions([]);

    if (isNew || !datasetId) {
      setActiveId(null);
      setName(''); setDescription(''); setSourceCollection('');
      setColumnOrder([]); setVerified(false);
      const seeded = seedSteps(starter);
      setSteps(seeded);
      setMetaEditing(true);
      baselineRef.current = snapshot({
        name: '', description: '', sourceCollection: '',
        steps: seeded, columnOrder: [], verified: false,
      });
      return;
    }

    setActiveId(datasetId); setMetaEditing(false); setLoading(true);
    api.get(`/models/${datasetId}`)
      .then(({ data }) => {
        const nm = data.name || '';
        const desc = data.description || '';
        const src = data.sourceCollection || '';
        const sts = Array.isArray(data.steps) ? data.steps : [];
        const co = Array.isArray(data.columnOrder) ? data.columnOrder : [];
        const v = !!data.verified;
        setName(nm); setDescription(desc); setSourceCollection(src);
        setSteps(sts); setColumnOrder(co); setVerified(v);
        baselineRef.current = snapshot({ name: nm, description: desc, sourceCollection: src, steps: sts, columnOrder: co, verified: v });
      })
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));

    api.get(`/models/${datasetId}/lineage`).then(({ data }) => setLineage(data)).catch(() => setLineage({ questions: [] }));
  }, [open, datasetId, isNew, starter]);

  // Dirty by snapshot comparison (same pattern as ReportPreviewDialog).
  useEffect(() => {
    if (!baselineRef.current) return;
    const current = snapshot({ name, description, sourceCollection, steps, columnOrder, verified });
    setDirty(current !== baselineRef.current);
  }, [name, description, sourceCollection, steps, columnOrder, verified]);

  // No auto-run: preview only fires on explicit "Run preview" or "Re-run" button click.

  // Lazy-load version history. Extracted so both the tab-open effect and the
  // refresh button can call the same function without duplicating logic.
  const loadVersions = () => {
    if (!activeId) return;
    setVersionsLoading(true);
    api.get(`/models/${activeId}/versions`)
      .then(({ data }) => setVersions([...(data || [])].reverse()))
      .catch(() => setVersions([]))
      .finally(() => setVersionsLoading(false));
  };

  // Lazy-load version history when the History tab opens.
  useEffect(() => {
    if (tab !== 'history' || !activeId) return;
    loadVersions();
  }, [tab, activeId]); // eslint-disable-line

  const compiledPipeline = useMemo(() => {
    try { return compileSteps(steps); } catch { return []; }
  }, [steps]);

  const runPreview = async (showToast = false) => {
    if (!sourceCollection) return;
    setTab('preview');
    setError(''); setRunning(true);
    try {
      const { data } = await api.post('/models/preview-steps', {
        sourceCollection,
        steps,
        sampleSize: sampleMode ? sampleSize : 0,
        previewLimit: 100,
      });
      setPreviewData(data);
      setStepCounts(data.stepCounts || []);
      if (showToast) setSavedMsg(`Preview ready — ${data.data?.length || 0} rows · ${data.executionTime ?? 0}ms`);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setRunning(false);
    }
  };

  const save = async () => {
    if (!name?.trim()) { setError('Dataset name is required'); setMetaEditing(true); return; }
    if (!description?.trim()) { setError('Dataset description is required'); setMetaEditing(true); return; }
    if (!sourceCollection) { setError('Pick a source table first'); return; }
    setSaving(true); setError('');
    try {
      const payload = { name, description, sourceCollection, steps, columnOrder, verified };
      let data;
      if (activeId) {
        ({ data } = await api.put(`/models/${activeId}`, payload));
      } else {
        ({ data } = await api.post('/models', payload));
        setActiveId(data._id);
      }
      baselineRef.current = snapshot({ name, description, sourceCollection, steps, columnOrder, verified });
      setDirty(false);
      setMetaEditing(false);
      setSavedMsg('Dataset saved successfully');
      setTimeout(() => setSavedMsg(''), 2500);
      onSaved?.(data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const askAiExplainDataset = () => {
    const colList = previewColumns.length ? previewColumns.join(', ') : 'unknown';
    const rowCount = previewData?.data?.length ?? 0;
    window.dispatchEvent(new CustomEvent('fyntrac:ai:open', {
      detail: {
        prompt: `I have the dataset "${name || 'Untitled'}" open in front of me.${sourceCollection ? ` It reads from the "${sourceCollection}" table.` : ''}${steps.length ? ` It has ${steps.length} build step(s): ${steps.map((s, i) => `${i + 1}. ${s.kind}`).join(', ')}.` : ''} The preview shows ${rowCount} rows with columns: ${colList}.

I can help you with:
1. How each tab and step in this modal works
2. Questions like "how do I filter by date?" or "how do I group by account?"
3. Data analysis — just ask me something like "what's the sum of amount?", "which row has the highest value?", or "how many unique accounts are there?"

What would you like to know?`,
      },
    }));
  };

  const handleClose = () => {
    if (dirty) setConfirmCloseOpen(true);
    else onClose?.();
  };
  const confirmDiscard = () => { setConfirmCloseOpen(false); onClose?.(); };

  // Restore a historical version into the working state. The user still needs
  // to press Save to make the restore permanent — dirty tracking catches it.
  const restoreFromVersion = (v) => {
    const snap = v.snapshot || {};
    if (snap.name !== undefined) setName(snap.name);
    if (snap.description !== undefined) setDescription(snap.description);
    if (snap.sourceCollection !== undefined) setSourceCollection(snap.sourceCollection);
    if (Array.isArray(snap.steps)) setSteps(snap.steps);
    if (Array.isArray(snap.columnOrder)) setColumnOrder(snap.columnOrder);
    if (snap.verified !== undefined) setVerified(!!snap.verified);
    setRestoreTarget(null);
    setTab('build');
    setSavedMsg(`Restored to version ${v.version ?? '?'} — review and save when ready`);
  };

  // Step helpers
  const updateStep = (i, next) => setSteps((arr) => arr.map((s, idx) => (idx === i ? next : s)));
  const deleteStep = (i) => setSteps((arr) => arr.filter((_, idx) => idx !== i));
  const addStep = (s) => setSteps((arr) => {
    const next = [...arr, s];
    // Auto-expand the newly added step (matches DatasetEditor behavior).
    setJustAddedIndex(next.length - 1);
    return next;
  });

  const enabledIndex = useMemo(() => {
    const m = []; let j = 0;
    for (let i = 0; i < steps.length; i++) m[i] = steps[i].disabled ? null : j++;
    return m;
  }, [steps]);

  const previewColumns = useMemo(
    () => (previewData?.columns || []).filter((c) => !isHiddenColumn(c)),
    [previewData]
  );

  // Publish dataset context to the global AI drawer so any "Ask AI" button
  // (here or elsewhere) gives the chatbot what it needs to ground answers.
  const setDatasetCtx = useDatasetContextStore((s) => s.setDataset);
  const clearDatasetCtx = useDatasetContextStore((s) => s.clearDataset);
  useEffect(() => {
    if (!open) {
      // Clear stale context so the AI drawer doesn't keep the closed dataset in scope.
      clearDatasetCtx();
      return;
    }
    setDatasetCtx({
      id: activeId,
      name,
      description,
      sourceCollection,
      verified,
      steps,
      pipeline: compiledPipeline,
      columns: previewColumns,
      rowCount: previewData?.data?.length ?? null,
      sampleRows: (previewData?.data || []).slice(0, 25),
    });
  }, [open, activeId, name, description, sourceCollection, verified, steps, compiledPipeline, previewColumns, previewData, setDatasetCtx, clearDatasetCtx]);
  useEffect(() => () => clearDatasetCtx(), [clearDatasetCtx]);

  const lineageCount = lineage?.questions?.length || 0;

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
              label="Dataset"
              size="small"
              sx={{
                height: 18, fontSize: '0.6rem', fontWeight: 700, letterSpacing: 0.8,
                textTransform: 'uppercase', bgcolor: alpha('#3f51b5', 0.1),
                color: '#3f51b5', mb: 0.5, borderRadius: 1,
              }}
            />
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2, color: 'text.primary' }} noWrap>
                {name || (isNew ? 'New Dataset' : (activeId ? 'Loading…' : ''))}
              </Typography>
              {sourceCollection && (
                <Chip icon={<StorageIcon sx={{ fontSize: 14 }} />} label={sourceCollection} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem', borderRadius: 1 }} />
              )}
              {verified && (
                <Chip icon={<VerifiedIcon sx={{ fontSize: 14 }} />} label="Certified" size="small" color="success" variant="outlined" sx={{ height: 18, fontSize: '0.65rem', borderRadius: 1 }} />
              )}
              {dirty && (
                <Chip size="small" color="warning" variant="outlined" label="Unsaved changes" sx={{ height: 18, fontSize: '0.65rem', borderRadius: 1 }} />
              )}
            </Stack>
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

      {/* ── Tabs ── */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable" allowScrollButtonsMobile
        sx={{ px: 3, minHeight: 44, flexShrink: 0, borderBottom: '1px solid #e2e8f0', bgcolor: '#fff', '& .MuiTab-root': { fontWeight: 500 }, '& .MuiTab-root.Mui-selected': { color: '#1e40af', fontWeight: 700 }, '& .MuiTabs-indicator': { bgcolor: '#3b82f6' } }}
      >
        {TABS.map((t) => (
          <Tab
            key={t.key}
            value={t.key}
            sx={{ minHeight: 44, py: 0.5, textTransform: 'none' }}
            label={
              t.key === 'lineage' && lineageCount > 0
                ? <Stack direction="row" spacing={0.75} alignItems="center"><span>{t.label}</span><Chip size="small" label={lineageCount} sx={{ height: 18, fontSize: '0.65rem' }} /></Stack>
                : t.label
            }
          />
        ))}
      </Tabs>

      <DialogContent sx={{ p: 0, display: 'flex', flex: 1, overflow: 'hidden' }}>
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
                    value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="Dataset name"
                  />
                ) : (
                  <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                    {name || <Box component="span" sx={{ fontStyle: 'italic', color: 'text.disabled' }}>Untitled dataset</Box>}
                  </Typography>
                )}
              </Stack>

              <Stack spacing={0.5}>
                <Typography variant="body2" fontWeight={700} color="#0f172a">Description</Typography>
                {metaEditing ? (
                  <TextField
                    size="small" fullWidth multiline minRows={2} maxRows={5}
                    value={description} onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this dataset for?"
                  />
                ) : (
                  <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'pre-wrap' }}>
                    {description || <Box component="span" sx={{ fontStyle: 'italic', color: 'text.disabled' }}>No description</Box>}
                  </Typography>
                )}
              </Stack>

              <Divider />

              <Stack spacing={2}>
                <Typography variant="body2" fontWeight={700} color="#0f172a">Source</Typography>
                <FormControl size="small" fullWidth>
                  <InputLabel>Source table</InputLabel>
                  <Select
                    label="Source table"
                    value={sourceCollection}
                    onChange={(e) => setSourceCollection(e.target.value)}
                  >
                    {collections.map((c) => (
                      <MenuItem key={c} value={c}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <StorageIcon sx={{ fontSize: 14, opacity: 0.6 }} />
                          <span>{c}</span>
                        </Stack>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>

              <Divider />

              <Stack spacing={0.5}>
                <Typography variant="body2" fontWeight={700} color="#0f172a">Trust</Typography>
                <Box
                  onClick={() => setVerified((v) => !v)}
                  sx={{
                    display: 'inline-flex', alignItems: 'center', gap: 0.75,
                    px: 1.5, py: 0.5, borderRadius: 999, cursor: 'pointer',
                    border: '1px solid',
                    alignSelf: 'flex-start',
                    transition: 'all .14s ease',
                    borderColor: verified ? '#bbf7d0' : '#e2e8f0',
                    bgcolor: verified ? '#f0fdf4' : '#f8fafc',
                    color: verified ? '#15803d' : '#64748b',
                    '&:hover': {
                      borderColor: verified ? '#86efac' : '#cbd5e1',
                      bgcolor: verified ? '#dcfce7' : '#f1f5f9',
                    },
                  }}
                >
                  <VerifiedIcon sx={{ fontSize: 15, color: verified ? '#16a34a' : '#94a3b8' }} />
                  <Typography variant="caption" fontWeight={verified ? 700 : 500} sx={{ lineHeight: 1, fontSize: '0.78rem' }}>
                    {verified ? 'Certified' : 'Mark as certified'}
                  </Typography>
                </Box>
              </Stack>

              <Divider />

              <Stack spacing={2}>
                <Typography variant="body2" fontWeight={700} color="#0f172a">Sampling</Typography>
                <FormControlLabel
                  control={<Switch size="small" checked={sampleMode} onChange={(e) => setSampleMode(e.target.checked)} />}
                  label={<Typography variant="body2">Sample mode</Typography>}
                  sx={{ m: 0 }}
                />
                {sampleMode && (
                  <FormControl size="small" fullWidth>
                    <InputLabel>Sample size</InputLabel>
                    <Select
                      label="Sample size"
                      value={sampleSize}
                      onChange={(e) => setSampleSize(Number(e.target.value))}
                    >
                      {[1000, 5000, 10000, 25000, 50000].map((n) => (
                        <MenuItem key={n} value={n}>{n.toLocaleString()} rows</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              </Stack>

              <Divider />

              <Stack spacing={1}>
                <Button
                  size="small" variant="outlined" fullWidth
                  startIcon={<AutoAwesomeIcon fontSize="small" />}
                  onClick={askAiExplainDataset}
                  sx={{
                    borderRadius: 2, fontWeight: 600, justifyContent: 'flex-start', textTransform: 'none',
                    color: '#7c3aed', borderColor: '#ddd6fe', bgcolor: '#faf5ff',
                    '&:hover': { bgcolor: '#ede9fe', borderColor: '#c4b5fd' },
                    '&.Mui-disabled': { bgcolor: '#faf5ff', borderColor: '#ddd6fe', color: '#7c3aed' },
                  }}
                >
                  Ask AI to explain
                </Button>
                <Button
                  size="small" variant="outlined" fullWidth
                  startIcon={running ? <CircularProgress size={13} sx={{ color: '#15803d' }} /> : <PlayArrowIcon fontSize="small" />}
                  onClick={() => runPreview(true)}
                  disabled={running || !sourceCollection}
                  sx={{
                    borderRadius: 2, fontWeight: 600, justifyContent: 'flex-start', textTransform: 'none',
                    color: '#15803d', borderColor: '#bbf7d0', bgcolor: '#f0fdf4',
                    '&:hover': { bgcolor: '#dcfce7', borderColor: '#86efac' },
                    '&.Mui-disabled': { bgcolor: '#f0fdf4', borderColor: '#bbf7d0', color: '#15803d' },
                  }}
                >
                  {running ? 'Running…' : 'Run preview'}
                </Button>
                <Button
                  size="small" variant="contained" fullWidth
                  startIcon={saving ? <CircularProgress size={13} color="inherit" /> : <SaveIcon fontSize="small" />}
                  onClick={save}
                  disabled={saving || !name?.trim() || !description?.trim() || !sourceCollection}
                  sx={{
                    borderRadius: 2, fontWeight: 700, textTransform: 'none',
                    bgcolor: '#14213d', boxShadow: 'none',
                    '&:hover': { bgcolor: '#0a1628', boxShadow: 'none' },
                  }}
                >
                  {saving ? 'Saving…' : 'Save dataset'}
                </Button>
              </Stack>


            </Box>
          )}
        </Box>

        {/* Right pane */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 2.5, bgcolor: '#f8fafc' }}>
          {loading && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Skeleton variant="rounded" height={32} width={240} />
              <Skeleton variant="rounded" height={120} />
              <Skeleton variant="rounded" height={200} />
            </Box>
          )}
          {!loading && error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

          {/* BUILD */}
          {!loading && tab === 'build' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              {!sourceCollection ? (
                <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
                  <Typography color="text.secondary">
                    Pick a source table from the side rail to start building this dataset.
                  </Typography>
                </Paper>
              ) : (
                <>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {steps.map((s, i) => {
                      const idx = enabledIndex[i];
                      const cnt = idx != null ? stepCounts.find((c) => c.index === idx)?.rowCount : null;
                      return (
                        <React.Fragment key={i}>
                          <StepCard
                            step={s} index={i} total={steps.length}
                            sourceCollection={sourceCollection}
                            onChange={(next) => updateStep(i, next)}
                            onDelete={() => deleteStep(i)}
                            rowCount={cnt}
                            defaultExpanded={i === justAddedIndex}
                            precedingSteps={steps.slice(0, i).filter((st) => !st.disabled)}
                          />
                          {i < steps.length - 1 && <StepArrow />}
                        </React.Fragment>
                      );
                    })}
                    <AddStepButton onAdd={addStep} existingKinds={steps.map((s) => s.kind)} />
                  </Box>
                </>
              )}
            </Box>
          )}

          {/* PREVIEW */}
          {!loading && tab === 'preview' && (
            <Stack spacing={1.5}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="subtitle2">Live preview</Typography>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  {running && <CircularProgress size={14} />}
                  {previewData && (
                    <Typography variant="caption" color="text.secondary">
                      {previewData.data?.length || 0} rows shown · {previewData.executionTime ?? 0}ms
                      {sampleMode ? ` · sample ${sampleSize.toLocaleString()}` : ' · full table'}
                    </Typography>
                  )}
                  <Button
                    size="small"
                    startIcon={running ? <CircularProgress size={13} sx={{ color: '#15803d' }} /> : <PlayArrowIcon fontSize="small" />}
                    onClick={() => runPreview(true)}
                    disabled={running || !sourceCollection}
                    sx={{
                      borderRadius: 2, fontWeight: 600, textTransform: 'none',
                      color: '#15803d', borderColor: '#bbf7d0', bgcolor: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      '&:hover': { bgcolor: '#dcfce7', borderColor: '#86efac' },
                      '&.Mui-disabled': { bgcolor: '#f0fdf4', borderColor: '#dcfce7', color: '#86efac' },
                    }}
                  >
                    {running ? 'Running…' : 'Re-run'}
                  </Button>
                </Stack>
              </Stack>
              {!sourceCollection ? (
                <Typography color="text.secondary" variant="body2">Pick a source first.</Typography>
              ) : previewData?.data?.length > 0 ? (
                <DataTable
                  data={previewData.data}
                  columns={previewColumns}
                  columnOrder={columnOrder}
                  onColumnOrderChange={setColumnOrder}
                  filename={`${name || 'dataset'}-preview.csv`}
                  enableExport
                  defaultRowsPerPage={15}
                />
              ) : running ? (
                <Skeleton variant="rounded" height={240} />
              ) : (
                <Typography color="text.secondary" variant="body2">
                  No rows yet — add steps or press Re-run.
                </Typography>
              )}
            </Stack>
          )}

          {/* SCHEMA */}
          {!loading && tab === 'schema' && (
            <Stack spacing={1}>
              <Typography variant="subtitle2">Output columns</Typography>
              <Typography variant="caption" color="text.secondary">
                Drag to reorder columns in Preview. Hide columns by toggling them off.
              </Typography>
              {previewColumns.length === 0 ? (
                <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
                  Run a preview to inspect the output schema.
                </Typography>
              ) : (
                <Paper variant="outlined" sx={{ mt: 1 }}>
                  <List dense disablePadding>
                    {previewColumns.map((col, i) => {
                      const sample = previewData?.data?.[0]?.[col];
                      return (
                        <ListItem key={col} divider={i < previewColumns.length - 1}>
                          <ListItemText
                            primary={<Typography variant="body2" fontWeight={600}>{col}</Typography>}
                            secondary={
                              <Typography variant="caption" color="text.secondary">
                                {sample === undefined || sample === null ? '—' : `e.g. ${String(sample).slice(0, 80)}`}
                              </Typography>
                            }
                          />
                        </ListItem>
                      );
                    })}
                  </List>
                </Paper>
              )}
            </Stack>
          )}

          {/* LINEAGE */}
          {!loading && tab === 'lineage' && (
            <Stack spacing={1.5}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <AccountTreeIcon sx={{ color: 'text.secondary' }} />
                <Typography variant="subtitle2">Downstream reports</Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Reports that read from this dataset. Editing the schema here may affect them.
              </Typography>
              {!lineage ? (
                <Skeleton variant="rounded" height={120} />
              ) : lineage.questions?.length === 0 ? (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography color="text.secondary" variant="body2">
                    No reports depend on this dataset yet.
                  </Typography>
                </Paper>
              ) : (
                <Paper variant="outlined">
                  <List dense disablePadding>
                    {lineage.questions.map((q, i) => (
                      <ListItem
                        key={q._id}
                        divider={i < lineage.questions.length - 1}
                        secondaryAction={
                          <Typography variant="caption" color="text.secondary">
                            {q.updatedAt ? new Date(q.updatedAt).toLocaleDateString() : ''}
                          </Typography>
                        }
                      >
                        <ListItemText
                          primary={<Typography variant="body2" fontWeight={600}>{q.name}</Typography>}
                          secondary={
                            <Typography variant="caption" color="text.secondary">
                              {q.description || '—'}
                            </Typography>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                </Paper>
              )}

              <Divider sx={{ my: 1 }} />
              <Stack direction="row" alignItems="center" spacing={1}>
                <StorageIcon sx={{ color: 'text.secondary' }} />
                <Typography variant="subtitle2">Upstream source</Typography>
              </Stack>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="body2">
                  {sourceCollection
                    ? <>This dataset is built on collection <strong>{sourceCollection}</strong>.</>
                    : 'No source picked yet.'}
                </Typography>
              </Paper>
            </Stack>
          )}

          {/* PIPELINE */}
          {!loading && tab === 'pipeline' && (
            <Stack spacing={1}>
              <Stack direction="row" alignItems="center" spacing={1} justifyContent="space-between">
                <Stack direction="row" alignItems="center" spacing={1}>
                  <CodeIcon sx={{ color: 'text.secondary' }} />
                  <Typography variant="subtitle2">Compiled MongoDB pipeline</Typography>
                </Stack>
                <Tooltip title="Copy pipeline JSON">
                  <span>
                    <Button
                      size="small"
                      startIcon={<ContentCopyIcon fontSize="small" />}
                      onClick={() => {
                        const text = JSON.stringify(compiledPipeline, null, 2);
                        if (navigator.clipboard?.writeText) {
                          navigator.clipboard.writeText(text).then(() => setSavedMsg('Pipeline JSON copied to clipboard'));
                        }
                      }}
                      disabled={!compiledPipeline?.length}
                      sx={{
                        borderRadius: 2, fontWeight: 600, textTransform: 'none',
                        color: '#475569', borderColor: '#e2e8f0', bgcolor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        '&:hover': { bgcolor: '#f1f5f9', borderColor: '#cbd5e1' },
                        '&.Mui-disabled': { bgcolor: '#f8fafc', borderColor: '#f1f5f9', color: '#cbd5e1' },
                      }}
                    >
                      Copy JSON
                    </Button>
                  </span>
                </Tooltip>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Read-only. Regenerated from the build steps each time you save.
                {sourceCollection && <> Runs against <strong>{sourceCollection}</strong>.</>}
              </Typography>
              <pre
                style={{
                  fontFamily: 'monospace', fontSize: 12, background: '#0f172a', color: '#e2e8f0',
                  padding: 12, borderRadius: 6, overflow: 'auto', maxHeight: '60vh', margin: 0,
                }}
              >
                {sourceCollection ? `db.${sourceCollection}.aggregate(\n` : ''}{JSON.stringify(compiledPipeline, null, 2)}{sourceCollection ? '\n)' : ''}
              </pre>
              {compiledPipeline?.length === 0 && (
                <Typography variant="caption" color="text.secondary">
                  No stages yet — add steps in Build to see them compile here.
                </Typography>
              )}
            </Stack>
          )}

          {/* HISTORY */}
          {!loading && tab === 'history' && (
            <Stack spacing={1.5}>
              <Stack direction="row" alignItems="center" spacing={1} justifyContent="space-between">
                <Stack direction="row" alignItems="center" spacing={1}>
                  <HistoryIcon sx={{ color: 'text.secondary' }} />
                  <Typography variant="subtitle2">Versions</Typography>
                </Stack>
                <Tooltip title="Refresh">
                  <span>
                    <IconButton size="small" onClick={loadVersions}>
                      <RefreshIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                A snapshot is captured every time you save. The most recent 20 are kept.
              </Typography>
              {versionsLoading ? (
                <Skeleton variant="rounded" height={120} />
              ) : versions.length === 0 ? (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography color="text.secondary" variant="body2">
                    No prior versions yet. Save the dataset to start the history.
                  </Typography>
                </Paper>
              ) : (
                <Paper variant="outlined">
                  <List dense disablePadding>
                    {versions.map((v, i) => {
                      const snap = v.snapshot || {};
                      const stepN = Array.isArray(snap.steps) ? snap.steps.length : 0;
                      return (
                        <ListItem
                          key={v._id || i}
                          divider={i < versions.length - 1}
                          secondaryAction={
                            <Tooltip title="Restore this version into the editor">
                              <Button
                                size="small"
                                startIcon={<RestoreIcon fontSize="small" />}
                                onClick={() => setRestoreTarget(v)}
                                sx={{
                                  borderRadius: 2, fontWeight: 600, textTransform: 'none', minWidth: 90,
                                  color: '#1e40af', borderColor: '#bfdbfe', bgcolor: '#eff6ff',
                                  border: '1px solid #bfdbfe',
                                  '&:hover': { bgcolor: '#dbeafe', borderColor: '#93c5fd' },
                                }}
                              >
                                Restore
                              </Button>
                            </Tooltip>
                          }
                        >
                          <ListItemText
                            primary={
                              <Stack direction="row" alignItems="center" spacing={1}>
                                <Typography variant="body2" fontWeight={600}>v{v.version != null ? v.version : versions.length - i}</Typography>
                                <Chip size="small" variant="outlined" label={`${stepN} step${stepN === 1 ? '' : 's'}`} sx={{ height: 18, fontSize: '0.65rem' }} />
                                {snap.sourceCollection && (
                                  <Chip size="small" variant="outlined" label={snap.sourceCollection} sx={{ height: 18, fontSize: '0.65rem' }} />
                                )}
                              </Stack>
                            }
                            secondary={
                              <Typography variant="caption" color="text.secondary">
                                {v.createdAt ? new Date(v.createdAt).toLocaleString() : ''}
                                {v.note ? ` · ${v.note}` : ''}
                              </Typography>
                            }
                          />
                        </ListItem>
                      );
                    })}
                  </List>
                </Paper>
              )}
            </Stack>
          )}
        </Box>
      </DialogContent>

      {/* Discard confirm */}
      <Dialog open={confirmCloseOpen} onClose={() => setConfirmCloseOpen(false)} maxWidth="xs">
        <DialogTitle>Discard unsaved changes?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have unsaved changes to this dataset. Closing now will lose them.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmCloseOpen(false)}>Keep editing</Button>
          <Button onClick={confirmDiscard} color="error" variant="contained">Discard changes</Button>
        </DialogActions>
      </Dialog>

      {/* Restore confirm */}
      <Dialog open={!!restoreTarget} onClose={() => setRestoreTarget(null)} maxWidth="xs">
        <DialogTitle>Restore this version?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will load v{restoreTarget?.version ?? '?'} (saved{' '}
            {restoreTarget?.createdAt ? new Date(restoreTarget.createdAt).toLocaleString() : ''})
            {' '}into the editor. Your current unsaved changes will be replaced.
            You will still need to press <strong>Save</strong> to make the restore permanent.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestoreTarget(null)}>Cancel</Button>
          <Button
            onClick={() => restoreFromVersion(restoreTarget)}
            color="primary" variant="contained"
            startIcon={<RestoreIcon />}
          >
            Restore
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
          severity="success"
          variant="filled"
          icon={false}
          onClose={() => setSavedMsg('')}
          sx={{
            bgcolor: '#dcfce7',
            color: '#166534',
            fontWeight: 600,
            border: '1px solid #bbf7d0',
            boxShadow: '0 6px 16px rgba(22,163,74,0.15)',
            '& .MuiAlert-action': { color: '#166534' },
          }}
        >
          {savedMsg}
        </Alert>
      </Snackbar>
    </Dialog>
  );
}

// Seed steps for the New Dataset starter templates. Mirrors the behavior of
// the previous DatasetEditor query-string starters so existing entry points
// keep working without any backend change.
function seedSteps(starter) {
  if (!starter || starter === 'blank') return [];
  if (starter === 'combine') return [{ kind: 'combine', relationship: 'one', unmatched: 'keep' }];
  if (starter === 'rollup') return [{ kind: 'summarize', groupBys: [], metrics: [{ agg: '$count' }] }];
  return [];
}
