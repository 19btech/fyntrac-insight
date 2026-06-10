import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogTitle, DialogActions, DialogContentText,
  IconButton, Typography, Stack, Chip,
  Tabs, Tab, Box, Button, Divider, Skeleton,
  TextField, List, ListItem,
  ListItemText, CircularProgress, Tooltip, Snackbar, Alert, Paper,
  ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import HighlightOffOutlinedIcon from '@mui/icons-material/HighlightOffOutlined';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import EditIcon from '@mui/icons-material/Edit';
import VerifiedIcon from '@mui/icons-material/Verified';
import HistoryIcon from '@mui/icons-material/History';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import StorageIcon from '@mui/icons-material/Storage';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import CodeIcon from '@mui/icons-material/Code';
import RefreshIcon from '@mui/icons-material/Refresh';
import RestoreIcon from '@mui/icons-material/Restore';
import api from '../../hooks/useQuery';
import DataTable from '../charts/DataTable';
import { isHiddenColumn } from '../charts/_columnRules';
import { compileSteps } from '../dataset-builder/compileSteps';
import { StepCard, StepArrow, AddStepButton } from '../dataset-builder/StepCard';
import useDatasetContextStore from '../../store/datasetContextStore';
import AppToast from '../shared/AppToast';
import BrandedDialogTitle from '../shared/BrandedDialogTitle';
import SearchSelect from '../shared/SearchSelect';
import restoreButtonSx from '../shared/restoreButtonSx';

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

  // Build mode: 'steps' (visual step stack) or 'savedQuery' (a Prism SQL query).
  // Only one is active at a time; both configs are retained when switching.
  const [sourceMode, setSourceMode] = useState('steps');
  const [savedQueryId, setSavedQueryId] = useState(null);
  const [savedQuerySql, setSavedQuerySql] = useState('');
  const [savedQueryName, setSavedQueryName] = useState('');
  const [savedQueries, setSavedQueries] = useState([]);
  // Pending selection awaiting confirmation when its collection differs.
  const [mismatch, setMismatch] = useState(null); // { query, datasetCollection }
  // Target build mode awaiting confirmation (only one mode may be active).
  const [pendingMode, setPendingMode] = useState(null); // 'steps' | 'savedQuery'

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
  const [nameError, setNameError] = useState(false);
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
    sourceMode: vals.sourceMode || 'steps',
    savedQueryId: vals.savedQueryId || null,
    savedQuerySql: vals.savedQuerySql || '',
  });

  // Load the available source collections + Prism saved queries once per open.
  useEffect(() => {
    if (!open) return;
    api.get('/schema/collections').then((r) => setCollections(r.data || [])).catch(() => setCollections([]));
    api.get('/query/saved').then((r) => setSavedQueries(r.data?.queries || [])).catch(() => setSavedQueries([]));
  }, [open]);

  // Hydrate when opened. Either from /models/:id, or with a starter template.
  useEffect(() => {
    if (!open) return;
    setTab('build'); setError(''); setDirty(false); setNameError(false);
    setPreviewData(null); setStepCounts([]); setLineage(null); setVersions([]);
    setMismatch(null);

    if (isNew || !datasetId) {
      setActiveId(null);
      setName(''); setDescription(''); setSourceCollection('');
      setColumnOrder([]); setVerified(false);
      setSourceMode('steps'); setSavedQueryId(null); setSavedQuerySql(''); setSavedQueryName('');
      const seeded = seedSteps(starter);
      setSteps(seeded);
      setMetaEditing(true);
      baselineRef.current = snapshot({
        name: '', description: '', sourceCollection: '',
        steps: seeded, columnOrder: [], verified: false,
        sourceMode: 'steps', savedQueryId: null, savedQuerySql: '',
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
        const mode = data.sourceMode === 'savedQuery' ? 'savedQuery' : 'steps';
        const sqId = data.savedQueryId || null;
        const sqSql = data.savedQuerySql || '';
        const sqName = data.savedQueryName || '';
        setName(nm); setDescription(desc); setSourceCollection(src);
        setSteps(sts); setColumnOrder(co); setVerified(v);
        setSourceMode(mode); setSavedQueryId(sqId); setSavedQuerySql(sqSql); setSavedQueryName(sqName);
        baselineRef.current = snapshot({ name: nm, description: desc, sourceCollection: src, steps: sts, columnOrder: co, verified: v, sourceMode: mode, savedQueryId: sqId, savedQuerySql: sqSql });
      })
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));

    api.get(`/models/${datasetId}/lineage`).then(({ data }) => setLineage(data)).catch(() => setLineage({ questions: [] }));
  }, [open, datasetId, isNew, starter]);

  // Dirty by snapshot comparison (same pattern as ReportPreviewDialog).
  useEffect(() => {
    if (!baselineRef.current) return;
    const current = snapshot({ name, description, sourceCollection, steps, columnOrder, verified, sourceMode, savedQueryId, savedQuerySql });
    setDirty(current !== baselineRef.current);
  }, [name, description, sourceCollection, steps, columnOrder, verified, sourceMode, savedQueryId, savedQuerySql]);

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
    setTab('preview');
    setError(''); setRunning(true);
    try {
      if (sourceMode === 'savedQuery') {
        if (!savedQuerySql) { setRunning(false); return; }
        // Preview a saved-query dataset by running its SQL through Prism.
        const { data } = await api.post('/query/sql', { sql: savedQuerySql, page: 0, pageSize: 100 });
        const shaped = { data: data.rows || [], columns: data.columns || [], executionTime: data.executionTime };
        setPreviewData(shaped);
        setStepCounts([]);
        if (showToast) setSavedMsg(`Preview ready — ${shaped.data.length} rows · ${shaped.executionTime ?? 0}ms`);
      } else {
        if (!sourceCollection) { setRunning(false); return; }
        const { data } = await api.post('/models/preview-steps', {
          sourceCollection,
          steps,
          sampleSize: sampleMode ? sampleSize : 0,
          previewLimit: 100,
        });
        setPreviewData(data);
        setStepCounts(data.stepCounts || []);
        if (showToast) setSavedMsg(`Preview ready — ${data.data?.length || 0} rows · ${data.executionTime ?? 0}ms`);
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setRunning(false);
    }
  };

  // ── Build-mode helpers ──────────────────────────────────────────────────────
  // Only one mode is ever active. Switching away from a mode that holds work
  // asks for confirmation first, then: steps -> query disables all steps;
  // query -> steps clears the selected query (and re-enables the steps).
  const applyMode = (mode) => {
    if (mode === 'savedQuery') {
      setSteps((prev) => prev.map((s) => ({ ...s, disabled: true })));
    } else {
      setSavedQueryId(null); setSavedQuerySql(''); setSavedQueryName('');
      setSteps((prev) => prev.map((s) => ({ ...s, disabled: false })));
    }
    setSourceMode(mode);
    setPreviewData(null);
    setError('');
  };

  const switchMode = (_e, mode) => {
    if (!mode || mode === sourceMode) return;
    const losingQuery = mode === 'steps' && !!savedQueryId;
    const losingSteps = mode === 'savedQuery' && steps.length > 0;
    if (losingQuery || losingSteps) {
      setPendingMode(mode); // confirm before discarding the other side's work
    } else {
      applyMode(mode);
    }
  };

  const applySavedQuery = (q, { replaceSource = false } = {}) => {
    setSavedQueryId(q._id);
    setSavedQuerySql(q.sql);
    setSavedQueryName(q.name);
    // Adopt the query's primary collection as the dataset source when forced
    // (mismatch confirmed) or when no source has been picked yet.
    if (q.primaryCollection && (replaceSource || !sourceCollection)) {
      setSourceCollection(q.primaryCollection);
    }
    setPreviewData(null);
    setError('');
  };

  // Selecting a query whose primary collection differs from the dataset's
  // source table prompts a confirm; otherwise it applies directly.
  const handleSelectSavedQuery = (id) => {
    if (!id) { setSavedQueryId(null); setSavedQuerySql(''); setSavedQueryName(''); setPreviewData(null); return; }
    const q = savedQueries.find((x) => String(x._id) === String(id));
    if (!q) return;
    const qCol = (q.primaryCollection || '').toLowerCase();
    const dsCol = (sourceCollection || '').toLowerCase();
    if (qCol && dsCol && qCol !== dsCol) {
      setMismatch({ query: q, datasetCollection: sourceCollection });
    } else {
      applySavedQuery(q);
    }
  };

  const save = async () => {
    if (!name?.trim()) { setNameError(true); setMetaEditing(true); return; }
    if (!sourceCollection) { setError('Pick a source table first'); return; }
    if (sourceMode === 'savedQuery' && !savedQuerySql) { setError('Select a Prism query first'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        name, description, sourceCollection, steps, columnOrder, verified,
        sourceMode, savedQueryId, savedQuerySql, savedQueryName,
      };
      let data;
      if (activeId) {
        ({ data } = await api.put(`/models/${activeId}`, payload));
      } else {
        ({ data } = await api.post('/models', payload));
        setActiveId(data._id);
      }
      baselineRef.current = snapshot({ name, description, sourceCollection, steps, columnOrder, verified, sourceMode, savedQueryId, savedQuerySql });
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
        prompt: `Analyse the data shown in the preview grid of the dataset "${name || 'Untitled'}".${sourceCollection ? ` Source table: "${sourceCollection}".` : ''} The grid has ${rowCount} row(s) with columns: ${colList}.

Give me the key insights from this data — notable totals/sums, averages, the highest and lowest values, and any outliers or patterns — citing specific numbers in **bold**. Base it on the rows in front of me, keep it concise, and finish with a couple of useful follow-up questions I could ask.`,
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
                height: 20, fontSize: '0.6rem', fontWeight: 700, letterSpacing: 0.8,
                textTransform: 'uppercase', bgcolor: 'rgba(99, 102, 241, 0.1)',
                color: '#6366F1', mb: 0.5, borderRadius: '8px',
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
                    value={name}
                    onChange={(e) => { setName(e.target.value); if (nameError) setNameError(false); }}
                    placeholder="Dataset name"
                    error={nameError}
                    helperText={nameError ? 'Dataset name is required' : ''}
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
                    inputProps={{ maxLength: 160 }}
                    helperText={`${(description || '').length}/160`}
                    FormHelperTextProps={{ sx: { textAlign: 'right', mx: 0 } }}
                  />
                ) : (
                  <Typography
                    variant="body2"
                    title={description || undefined}
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
                    {description || <Box component="span" sx={{ fontStyle: 'italic', color: 'text.disabled' }}>No description</Box>}
                  </Typography>
                )}
              </Stack>

              <Divider />

              <Stack spacing={1}>
                <Typography variant="body2" fontWeight={700} color="#0f172a">Source</Typography>
                <SearchSelect
                  value={sourceCollection}
                  onChange={setSourceCollection}
                  options={collections.map((c) => ({ value: c, label: c }))}
                  label="Source table"
                  fullWidth
                  disabled={sourceMode === 'savedQuery'}
                />
                {sourceMode === 'savedQuery' && (
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <CodeIcon sx={{ fontSize: 13 }} />
                    Set by the Prism query. Switch to “Build steps” to change it.
                  </Typography>
                )}
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
                  startIcon={saving ? <CircularProgress size={13} color="inherit" /> : null}
                  onClick={save}
                  disabled={saving}
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
              {/* Build mode toggle — always visible. "Build steps" needs a source
                  table; "Use a Prism query" can be selected without one. Only one
                  mode is ever active. */}
              <ToggleButtonGroup
                value={sourceMode}
                exclusive
                size="small"
                onChange={switchMode}
                sx={{
                  alignSelf: 'flex-start', mb: 0.5,
                  '& .MuiToggleButton-root': { textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', px: 1.5, py: 0.5, border: '1px solid #e2e8f0', color: '#64748b' },
                  '& .Mui-selected': { bgcolor: '#eef2ff !important', color: '#4f46e5 !important', borderColor: '#c7d2fe !important' },
                  '& .Mui-disabled': { color: '#cbd5e1' },
                }}
              >
                <ToggleButton value="steps" disabled={!sourceCollection}>
                  <AccountTreeIcon sx={{ fontSize: 16, mr: 0.5 }} /> Build steps
                </ToggleButton>
                <ToggleButton value="savedQuery">
                  <CodeIcon sx={{ fontSize: 16, mr: 0.5 }} /> Use a Prism query
                </ToggleButton>
              </ToggleButtonGroup>

              {sourceMode === 'savedQuery' ? (
                <Box sx={{ pt: 1 }}>
                  <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                      Use a saved Prism (SQL) query as this dataset's definition — the preview and output come from the query's results.
                    </Typography>
                    <SearchSelect
                      fullWidth
                      label="Prism query"
                      placeholder={savedQueries.length ? 'Select a saved query…' : 'No saved queries yet'}
                      value={savedQueryId}
                      onChange={handleSelectSavedQuery}
                      options={savedQueries.map((q) => ({
                        value: q._id,
                        label: q.name,
                        description: q.primaryCollection ? `Reads from ${q.primaryCollection}` : 'SQL query',
                      }))}
                    />
                    {savedQuerySql ? (
                      <Box>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mb: 0.75, display: 'block' }}>
                          Query SQL
                        </Typography>
                        <Paper
                          variant="outlined"
                          sx={{ p: 2, borderRadius: 2, border: 'none', bgcolor: '#0f172a', color: '#e2e8f0', fontFamily: 'ui-monospace, monospace', fontSize: '0.78rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto' }}
                        >
                          {savedQuerySql}
                        </Paper>
                      </Box>
                    ) : (
                      <EmptyCard
                        icon={<CodeIcon sx={{ fontSize: 32, color: '#94A3B8' }} />}
                        title="No query selected"
                        subtitle="Pick a saved Prism query above. Don't have one yet? Open Prism, write a query, save it, and it'll appear here."
                      />
                    )}
                  </Stack>
                </Box>
              ) : !sourceCollection ? (
                <EmptyCard
                  icon={<StorageIcon sx={{ fontSize: 32, color: '#94A3B8' }} />}
                  title="No source table selected"
                  subtitle="Pick a source table from the side rail to start building with steps — then filter, combine, summarize, and shape it. (Or switch to “Use a Prism query” above.)"
                />
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
                            onSaved={() => setSavedMsg('Step saved')}
                            rowCount={cnt}
                            defaultExpanded={i === justAddedIndex}
                            precedingSteps={steps.slice(0, i).filter((st) => !st.disabled)}
                          />
                          {i < steps.length - 1 && <StepArrow />}
                        </React.Fragment>
                      );
                    })}
                    {/* Centered add-step button */}
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 0.5 }}>
                      <AddStepButton onAdd={addStep} existingKinds={steps.map((s) => s.kind)} />
                    </Box>
                  </Box>

                  {steps.length === 0 && (
                    <EmptyCard
                      icon={<AccountTreeIcon sx={{ fontSize: 32, color: '#94A3B8' }} />}
                      title="No steps yet"
                      subtitle="Use the + button above to add your first step — filter rows, combine tables, add calculated columns, summarize, sort, and more to shape your dataset."
                    />
                  )}
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
                  {sourceCollection && (
                    <Button
                      size="small"
                      startIcon={running ? <CircularProgress size={13} sx={{ color: '#15803d' }} /> : <PlayArrowIcon fontSize="small" />}
                      onClick={() => runPreview(true)}
                      disabled={running}
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
                  )}
                </Stack>
              </Stack>
              {!sourceCollection ? (
                <EmptyCard
                  icon={<StorageIcon sx={{ fontSize: 32, color: '#94A3B8' }} />}
                  title="No source table selected"
                  subtitle="Pick a source table from the side rail first, then press Re-run to preview a live sample of your dataset here."
                />
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
                <EmptyCard
                  icon={<PlayArrowIcon sx={{ fontSize: 32, color: '#94A3B8' }} />}
                  title="No preview yet"
                  subtitle="Press Re-run above to execute the current build steps and see a live sample of your dataset here."
                />
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
                <EmptyCard
                  icon={<ViewColumnIcon sx={{ fontSize: 32, color: '#94A3B8' }} />}
                  title="No schema yet"
                  subtitle="Run a preview from the Preview tab to inspect the output columns, sample values, and reorder them here."
                />
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
                <EmptyCard
                  icon={<HistoryIcon sx={{ fontSize: 32, color: '#94A3B8' }} />}
                  title="No history yet"
                  subtitle="Save the dataset to start capturing version snapshots. The most recent 20 saves are kept here for you to restore."
                />
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
                                sx={restoreButtonSx}
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
        <BrandedDialogTitle label="Dataset" title="Discard Changes" onClose={() => setConfirmCloseOpen(false)} />
        <DialogContent>
          <DialogContentText>
            You have unsaved changes to this dataset. Closing now will lose them.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={confirmDiscard} color="error" variant="contained">Discard changes</Button>
        </DialogActions>
      </Dialog>

      {/* Restore confirm */}
      <Dialog open={!!restoreTarget} onClose={() => setRestoreTarget(null)} maxWidth="xs">
        <BrandedDialogTitle label="Dataset" title="Restore Version" onClose={() => setRestoreTarget(null)} />
        <DialogContent>
          <DialogContentText>
            This will load v{restoreTarget?.version ?? '?'} (saved{' '}
            {restoreTarget?.createdAt ? new Date(restoreTarget.createdAt).toLocaleString() : ''})
            {' '}into the editor. Your current unsaved changes will be replaced.
            You will still need to press <strong>Save</strong> to make the restore permanent.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => restoreFromVersion(restoreTarget)} startIcon={<RestoreIcon fontSize="small" />} sx={restoreButtonSx}>
            Restore
          </Button>
        </DialogActions>
      </Dialog>

      {/* Mode-switch confirm — only one of steps / Prism query can be active */}
      <Dialog
        open={!!pendingMode}
        onClose={() => setPendingMode(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 4, overflow: 'hidden', boxShadow: '0 32px 64px rgba(0,0,0,0.16)', border: '1px solid', borderColor: 'divider' } }}
      >
        <Box
          sx={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            px: 3, pt: 3, pb: 2.5,
            background: 'linear-gradient(135deg, rgba(30,64,175,0.05) 0%, rgba(99,102,241,0.04) 100%)',
            borderBottom: '1px solid', borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <img src="/fyntrac9.png" alt="Fyntrac" style={{ width: 64, height: 'auto' }} />
            <Box>
              <Chip
                label="Dataset"
                size="small"
                sx={{ height: 20, fontSize: '0.6rem', fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', bgcolor: 'rgba(99, 102, 241, 0.1)', color: '#6366F1', mb: 0.5, borderRadius: '8px' }}
              />
              <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2, color: 'text.primary' }}>
                Switch build mode?
              </Typography>
            </Box>
          </Box>
          <Tooltip title="Close" placement="left">
            <IconButton onClick={() => setPendingMode(null)} size="small" sx={{ color: 'text.secondary', bgcolor: 'action.hover', borderRadius: 2, '&:hover': { bgcolor: 'error.50', color: 'error.main' } }}>
              <HighlightOffOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <DialogContent sx={{ pt: 3 }}>
          <DialogContentText sx={{ fontSize: '0.85rem', color: 'text.primary' }}>
            A dataset can use <b>either</b> build steps <b>or</b> a Prism query — not both.
            <br /><br />
            {pendingMode === 'savedQuery'
              ? 'Switching to a Prism query will disable all of this dataset’s build steps.'
              : 'Switching to build steps will clear the selected Prism query.'}
            {' '}Continue?
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setPendingMode(null)} sx={{ textTransform: 'none', color: '#64748b' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => { applyMode(pendingMode); setPendingMode(null); }}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, px: 2.5, bgcolor: '#14213d', boxShadow: 'none', '&:hover': { bgcolor: '#0a1628', boxShadow: 'none' } }}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>

      {/* Collection-mismatch confirm when a Prism query reads from a different table */}
      <Dialog
        open={!!mismatch}
        onClose={() => setMismatch(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 4, overflow: 'hidden', boxShadow: '0 32px 64px rgba(0,0,0,0.16)', border: '1px solid', borderColor: 'divider' } }}
      >
        {/* Branded header */}
        <Box
          sx={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            px: 3, pt: 3, pb: 2.5,
            background: 'linear-gradient(135deg, rgba(30,64,175,0.05) 0%, rgba(99,102,241,0.04) 100%)',
            borderBottom: '1px solid', borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <img src="/fyntrac9.png" alt="Fyntrac" style={{ width: 64, height: 'auto' }} />
            <Box>
              <Chip
                label="Dataset"
                size="small"
                sx={{ height: 20, fontSize: '0.6rem', fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', bgcolor: 'rgba(99, 102, 241, 0.1)', color: '#6366F1', mb: 0.5, borderRadius: '8px' }}
              />
              <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2, color: 'text.primary' }}>
                Different source collection
              </Typography>
            </Box>
          </Box>
          <Tooltip title="Close" placement="left">
            <IconButton
              onClick={() => setMismatch(null)}
              size="small"
              sx={{ color: 'text.secondary', bgcolor: 'action.hover', borderRadius: 2, '&:hover': { bgcolor: 'error.50', color: 'error.main' } }}
            >
              <HighlightOffOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <DialogContent sx={{ pt: 3 }}>
          <DialogContentText sx={{ fontSize: '0.85rem', color: 'text.primary' }}>
            The Prism query <b>“{mismatch?.query?.name}”</b> reads from <b>{mismatch?.query?.primaryCollection}</b>, but this
            dataset's source table is <b>{mismatch?.datasetCollection}</b>.
            <br /><br />
            If you use it anyway, the dataset's source table will be changed to <b>{mismatch?.query?.primaryCollection}</b>.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setMismatch(null)} sx={{ textTransform: 'none', color: '#64748b' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => { if (mismatch?.query) applySavedQuery(mismatch.query, { replaceSource: true }); setMismatch(null); }}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, px: 2.5, bgcolor: '#14213d', boxShadow: 'none', '&:hover': { bgcolor: '#0a1628', boxShadow: 'none' } }}
          >
            Use anyway
          </Button>
        </DialogActions>
      </Dialog>

      <AppToast open={!!savedMsg} onClose={() => setSavedMsg('')} message={savedMsg} modal />
    </Dialog>
  );
}

// Shared animated empty-state card used across the Build / Preview / Schema /
// History tabs. Soft slate "tint" icon on a pastel circle, with a gentle
// fade-in-up on mount and a slow float loop on the icon.
function EmptyCard({ icon, title, subtitle }) {
  return (
    <Paper
      elevation={0}
      sx={{
        textAlign: 'center', py: 6, px: 4, borderRadius: 4,
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
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: '#f1f5f9',
            animation: 'fyntrac-empty-float 2.6s ease-in-out infinite',
            '@keyframes fyntrac-empty-float': {
              '0%, 100%': { transform: 'translateY(0)' },
              '50%': { transform: 'translateY(-6px)' },
            },
          }}
        >
          {icon}
        </Box>
        <Typography sx={{ fontFamily: 'Inter', fontSize: '1rem', fontWeight: 600, color: '#64748B' }}>
          {title}
        </Typography>
        <Typography variant="body2" sx={{ fontFamily: 'Inter', fontSize: '0.875rem', color: '#94A3B8', maxWidth: 380 }}>
          {subtitle}
        </Typography>
      </Stack>
    </Paper>
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
