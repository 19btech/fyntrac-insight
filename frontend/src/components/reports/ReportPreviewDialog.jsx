import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Dialog, DialogContent, DialogTitle, DialogActions, DialogContentText,
  IconButton, Typography, Stack, Chip,
  Tabs, Tab, Box, Button, Divider, Skeleton,
  TextField, List, ListItem, ListItemText, CircularProgress, Tooltip,
  Snackbar, Alert, Paper,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import HighlightOffOutlinedIcon from '@mui/icons-material/HighlightOffOutlined';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import EditIcon from '@mui/icons-material/Edit';
import StorageIcon from '@mui/icons-material/Storage';
import VerifiedIcon from '@mui/icons-material/Verified';
import HistoryIcon from '@mui/icons-material/History';
import RestoreIcon from '@mui/icons-material/Restore';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import TuneIcon from '@mui/icons-material/Tune';
import api from '../../hooks/useQuery';
import ChartRenderer, { inferAxes } from '../charts/ChartRenderer';
import ChartTypeSwitcher from '../charts/ChartTypeSwitcher';
import VizSettingsRail from '../charts/VizSettingsRail';
import { recommend } from '../charts/ChartRecommender';
import { typeFields } from '../charts/_chartConfig';
import QueryBuilderPanel from '../query-builder/QueryBuilderPanel';
import useReportContextStore from '../../store/reportContextStore';
import restoreButtonSx from '../shared/restoreButtonSx';
import AppToast from '../shared/AppToast';
import BrandedDialogTitle from '../shared/BrandedDialogTitle';

/**
 * Full-bleed modal for viewing AND editing a saved report. The modal is the
 * sole UI for working with an existing report — there is no separate page.
 *
 * Layout:
 *   - Sticky AppBar with title + chips and Tabs (Preview · Query · History).
 *   - Two-column body:
 *       Left rail: editable name, description, layout selector, "Explain this
 *                  result" Ask-AI launcher, Re-run, Save, last-updated.
 *       Right pane: active tab body (chart/table, editable query builder,
 *                   metadata, version list).
 *
 * Save persists name, description, chart layout, and the (editable) query
 * builder state via PUT /questions/:id. No backend changes required.
 */
const TABS = [
  { key: 'preview', label: 'Preview' },
  { key: 'query', label: 'Query' },
  { key: 'history', label: 'History' },
];

export default function ReportPreviewDialog({ open, reportId, isNew = false, onClose, onSaved }) {
  const [tab, setTab] = useState('preview');
  const [report, setReport] = useState(null);
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  // Editable working copy — separate from `report` so we can detect dirty state.
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [chartConfig, setChartConfig] = useState({ chartType: 'table' });
  const [vizRailOpen, setVizRailOpen] = useState(true);

  // Auto-inferred X/Y (so the viz rail prefills) + recommended chart types,
  // based on the current chart type's own field assignments.
  const vizInferred = useMemo(() => {
    const tf = typeFields(chartConfig, chartConfig.chartType);
    return inferAxes(results?.data || [], tf.xField, tf.yFields);
  }, [results, chartConfig]);
  const vizRecommended = useMemo(
    () => recommend({ data: results?.data || [], x: vizInferred.x, y: vizInferred.y, allKeys: results?.columns || [] }),
    [results, vizInferred.x, vizInferred.y]
  );
  const [collection, setCollection] = useState('');
  const [pipelineJson, setPipelineJson] = useState('[]');
  const [builderState, setBuilderState] = useState(null);
  const [source, setSource] = useState({ kind: 'collection', name: '', datasetId: null });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [queryDoneMsg, setQueryDoneMsg] = useState('');
  const [restoredMsg, setRestoredMsg] = useState('');
  // Internal id used for save/version/restore. For an unsaved "new" report
  // this is null until the first save creates the record.
  const [activeId, setActiveId] = useState(null);
  // Name+description are locked (greyed) by default for an existing report;
  // a brand-new report starts unlocked. After save we re-lock.
  const [metaEditing, setMetaEditing] = useState(false);
  const [nameError, setNameError] = useState(false);

  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(true);

  const setReportCtx = useReportContextStore((s) => s.setReport);
  const clearReportCtx = useReportContextStore((s) => s.clearReport);

  // Publish active report context for the global AI drawer.
  useEffect(() => {
    if (!open) { clearReportCtx(); return; }
    const cols = results?.columns || [];
    setReportCtx({
      kind: 'report',
      name,
      description,
      collection,
      pipeline: (() => { try { return JSON.parse(pipelineJson); } catch { return []; } })(),
      builderState,
      chartType: chartConfig?.chartType || 'table',
      columns: cols,
      sampleRows: (results?.data || []).slice(0, 50),
      rowCount: results?.data?.length ?? null,
    });
  }, [open, name, description, collection, pipelineJson, builderState, chartConfig, results]); // eslint-disable-line
  useEffect(() => () => clearReportCtx(), [clearReportCtx]);
  // Snapshot of the editable values at hydrate time. Dirty = current !== snapshot.
  const baselineRef = useRef('');
  const snapshot = (vals) => JSON.stringify({
    name: vals.name || '',
    description: vals.description || '',
    chartConfig: vals.chartConfig || {},
    collection: vals.collection || '',
    pipelineJson: vals.pipelineJson || '[]',
    builderState: vals.builderState || null,
  });

  // Hydrate when opened with a new id, or initialize a blank "new" report.
  useEffect(() => {
    if (!open) return;
    setTab('preview'); setError(''); setDirty(false); setNameError(false);

    if (isNew || !reportId) {
      // Blank new-report state — fields editable by default, no save until
      // the user types a name and (optionally) wires up a query.
      setActiveId(null);
      setReport(null);
      setResults(null);
      setName('');
      setDescription('');
      setChartConfig({ chartType: 'table' });
      setCollection('');
      setPipelineJson('[]');
      setBuilderState(null);
      setSource({ kind: 'collection', name: '', datasetId: null });
      setMetaEditing(true);
      baselineRef.current = snapshot({
        name: '', description: '', chartConfig: { chartType: 'table' },
        collection: '', pipelineJson: '[]', builderState: null,
      });
      return;
    }

    setReport(null); setResults(null); setActiveId(reportId);
    setMetaEditing(false);
    api.get(`/questions/${reportId}`)
      .then(({ data }) => {
        setReport(data);
        const nm = data.name || '';
        const desc = data.description || '';
        const cc = { ...(data.chartConfig || {}), chartType: data.chartConfig?.chartType || 'table' };
        const col = data.queryConfig?.collection || '';
        const pj = JSON.stringify(data.queryConfig?.pipeline || [], null, 2);
        const bs = data.queryConfig?.builderState || null;
        setName(nm);
        setDescription(desc);
        setChartConfig(cc);
        setCollection(col);
        setPipelineJson(pj);
        setBuilderState(bs);
        setSource(data.queryConfig?.source || { kind: 'collection', name: col, datasetId: null });
        baselineRef.current = snapshot({
          name: nm, description: desc, chartConfig: cc,
          collection: col, pipelineJson: pj, builderState: bs,
        });
        runQueryWith(col, data.queryConfig?.pipeline || []);
      })
      .catch((e) => setError(e.response?.data?.error || e.message));
  }, [open, reportId, isNew]);

  // Compute dirty by comparing the current editable values to the baseline
  // captured at hydrate. This sidesteps the race where QueryBuilderPanel
  // pushes its own state up asynchronously after mount, which would
  // otherwise trip a time-based "ready" flag and mark a fresh open dirty.
  useEffect(() => {
    if (!baselineRef.current) return;
    const current = snapshot({ name, description, chartConfig, collection, pipelineJson, builderState });
    setDirty(current !== baselineRef.current);
  }, [name, description, chartConfig, collection, pipelineJson, builderState]);

  const runQueryWith = async (col, pipeline, showToast = false) => {
    if (!col) return;
    setRunning(true); setError('');
    try {
      const { data } = await api.post('/query/run', { collection: col, pipeline: pipeline || [] });
      setResults(data);
      if (showToast) {
        setQueryDoneMsg(`Query complete · ${data.data?.length ?? 0} rows returned`);
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setRunning(false);
    }
  };

  const runCurrent = () => {
    let parsed = [];
    try { parsed = JSON.parse(pipelineJson); } catch { /* keep empty */ }
    setTab('preview');
    runQueryWith(collection, parsed, true);
  };

  const save = async () => {
    if (!name?.trim()) { setNameError(true); setMetaEditing(true); return; }
    setSaving(true); setError('');
    try {
      let parsedPipeline = [];
      try { parsedPipeline = JSON.parse(pipelineJson); } catch { /* keep empty */ }
      const payload = {
        name,
        description,
        type: report?.type || 'builder',
        queryConfig: {
          collection,
          pipeline: parsedPipeline,
          ...(builderState ? { builderState } : {}),
          ...(source?.datasetId ? { source } : {}),
        },
        chartConfig,
      };
      let data;
      if (activeId) {
        ({ data } = await api.put(`/questions/${activeId}`, payload));
      } else {
        ({ data } = await api.post('/questions', payload));
        setActiveId(data._id);
      }
      setReport(data);
      baselineRef.current = snapshot({ name, description, chartConfig, collection, pipelineJson, builderState });
      setDirty(false);
      setSavedMsg('Report saved successfully');
      setTimeout(() => setSavedMsg(''), 2500);
      onSaved?.(data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  // Lazy-load version history.
  useEffect(() => {
    if (tab !== 'history' || !activeId) return;
    setVersionsLoading(true);
    api.get(`/questions/${activeId}/versions`)
      .then(({ data }) => setVersions([...(data || [])].reverse()))
      .catch(() => setVersions([]))
      .finally(() => setVersionsLoading(false));
  }, [tab, activeId]);

  const askAiExplain = () => {
    const colList = (results?.columns || []).join(', ') || 'unknown';
    const rowCount = results?.data?.length ?? 0;
    window.dispatchEvent(new CustomEvent('fyntrac:ai:open', {
      detail: {
        prompt: `Analyse the data shown in the results grid of the report "${name || report?.name || 'Untitled'}".${collection ? ` Source: "${collection}".` : ''} The grid has ${rowCount} row(s) with columns: ${colList}.

Give me the key insights from these numbers — totals, averages, the highest and lowest values, trends over any period column, and anything notable — citing specific figures in **bold**. Base it on the rows in front of me, keep it concise, and end with a couple of useful follow-up questions.`,
      },
    }));
  };


  const sourceChip = useMemo(() => {
    if (source?.datasetId) {
      return (
        <Chip
          icon={source.verified ? <VerifiedIcon sx={{ fontSize: 14 }} /> : <StorageIcon sx={{ fontSize: 14 }} />}
          label={`Built on ${source.name}`}
          size="small" variant="outlined"
          color={source.verified ? 'success' : 'default'}
        />
      );
    }
    return collection
      ? <Chip icon={<StorageIcon sx={{ fontSize: 14 }} />} label={collection} size="small" variant="outlined" />
      : null;
  }, [source, collection]);

  const handleClose = () => {
    if (dirty) { setConfirmCloseOpen(true); return; }
    onClose?.();
  };

  const confirmDiscard = () => {
    setConfirmCloseOpen(false);
    onClose?.();
  };

  return (
    <Dialog
      open={open} onClose={handleClose} fullWidth
      maxWidth={false}
      PaperProps={{
        sx: {
          width: '96vw', height: '95vh', maxWidth: 'none', borderRadius: 4,
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
              label="Report"
              size="small"
              sx={{
                height: 20, fontSize: '0.6rem', fontWeight: 700, letterSpacing: 0.8,
                textTransform: 'uppercase', bgcolor: 'rgba(99, 102, 241, 0.1)',
                color: '#6366F1', mb: 0.5, borderRadius: '8px',
              }}
            />
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2, color: 'text.primary' }} noWrap>
                {name || (isNew ? 'New Report' : (activeId ? 'Loading…' : ''))}
              </Typography>
              {sourceChip}
              {report?.verified && (
                <Chip icon={<VerifiedIcon sx={{ fontSize: 14 }} />} label="Verified" size="small" color="success" variant="outlined" sx={{ height: 18, fontSize: '0.65rem', borderRadius: 1 }} />
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
        value={tab} onChange={(_, v) => setTab(v)}
        variant="scrollable" allowScrollButtonsMobile
        sx={{ px: 3, minHeight: 44, flexShrink: 0, borderBottom: '1px solid #e2e8f0', bgcolor: '#fff', '& .MuiTab-root': { fontWeight: 500 }, '& .MuiTab-root.Mui-selected': { color: '#1e40af', fontWeight: 700 }, '& .MuiTabs-indicator': { bgcolor: '#3b82f6' } }}
      >
        {TABS.map((t) => (
          <Tab key={t.key} value={t.key} label={t.label} sx={{ minHeight: 44, py: 0.5, textTransform: 'none' }} />
        ))}
      </Tabs>

      <DialogContent sx={{ p: 0, display: 'flex', overflow: 'hidden' }}>
        {/* Left rail */}
        <Box sx={{
          width: railOpen ? 320 : 44, flexShrink: 0, borderRight: '1px solid #e2e8f0',
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
          <Box sx={{ p: 3, pt: 2, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, width: 320 }}>
          <Stack direction="row" justifyContent="flex-end" sx={{ mt: -1, mb: -1 }}>
            <Tooltip title="Collapse panel" placement="left">
              <IconButton size="small" onClick={() => setRailOpen(false)}>
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
          <Stack spacing={1}>
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
                placeholder="Report name"
                error={nameError}
                helperText={nameError ? 'Report name is required' : ''}
              />
            ) : (
              <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                {name || <Box component="span" sx={{ fontStyle: 'italic', color: 'text.disabled' }}>Untitled report</Box>}
              </Typography>
            )}
          </Stack>

          <Stack spacing={1}>
            <Typography variant="body2" fontWeight={700} color="#0f172a">Description</Typography>
            {metaEditing ? (
              <TextField
                size="small" fullWidth multiline minRows={2} maxRows={6}
                value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this report show?"
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
            <Button
              size="small" variant="outlined" fullWidth
              startIcon={<AutoAwesomeIcon fontSize="small" />}
              onClick={askAiExplain} disabled={!results}
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
              onClick={runCurrent} disabled={running || !collection}
              sx={{
                borderRadius: 2, fontWeight: 600, justifyContent: 'flex-start', textTransform: 'none',
                color: '#15803d', borderColor: '#bbf7d0', bgcolor: '#f0fdf4',
                '&:hover': { bgcolor: '#dcfce7', borderColor: '#86efac' },
                '&.Mui-disabled': { bgcolor: '#f0fdf4', borderColor: '#bbf7d0', color: '#15803d' },
              }}
            >
              {running ? 'Running…' : 'Run Preview'}
            </Button>
            <Button
              size="small" variant="contained" fullWidth
              startIcon={saving ? <CircularProgress size={13} color="inherit" /> : null}
              onClick={save} disabled={saving || (!dirty && !!activeId)}
              sx={{
                borderRadius: 2, fontWeight: 700, textTransform: 'none',
                bgcolor: '#14213d', boxShadow: 'none',
                '&:hover': { bgcolor: '#0a1628', boxShadow: 'none' },
              }}
            >
              {saving ? 'Saving…' : 'Save report'}
            </Button>
          </Stack>

          {report?.updatedAt && (
            <>
              <Divider />
              <Typography variant="caption" color="text.secondary">
                Last updated {new Date(report.updatedAt).toLocaleString()}
              </Typography>
            </>
          )}
          </Box>
          )}
        </Box>

        {/* Right pane */}
        <Box sx={{ flex: 1, px: 4, pt: 2, pb: 4, overflow: 'auto', minWidth: 0, bgcolor: '#f8fafc' }}>
          {error && <Typography color="error" variant="body2" sx={{ mb: 2 }}>{error}</Typography>}

          {tab === 'preview' && (
            running && !results
              ? (
                <Stack spacing={1.25}>
                  {[...Array(8)].map((_, i) => (
                    <Skeleton key={i} variant="rectangular" height={36} sx={{ borderRadius: '8px', opacity: 1 - i * 0.1 }} />
                  ))}
                </Stack>
              )
              : !results ? (
                <EmptyCard
                  icon={<PlayArrowIcon sx={{ fontSize: 32, color: '#94A3B8' }} />}
                  title="No preview yet"
                  subtitle="Press Run Preview in the side panel to execute the query and see your results — as a table or chart — here."
                />
              ) : (
                <>
                  {results.truncated && (
                    <Box sx={{ px: 1.5, py: 0.75, mb: 1.5, bgcolor: '#fffbeb', border: 1, borderColor: '#fde68a', borderRadius: 1 }}>
                      <Typography variant="caption" sx={{ color: '#92400e' }}>
                        Result capped at {results.data?.length?.toLocaleString()} rows — there is more data. Add a "Sort &amp; Limit" step or filter your data further.
                      </Typography>
                    </Box>
                  )}
                  {/* Visualization switcher + chart + settings rail */}
                  <Box sx={{ mb: 1.5 }}>
                    <ChartTypeSwitcher
                      current={chartConfig.chartType || 'table'}
                      recommended={vizRecommended}
                      onPick={(type) => setChartConfig({ ...chartConfig, chartType: type })}
                    />
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'stretch' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <ChartRenderer
                        data={results.data}
                        columns={results.columns}
                        config={chartConfig}
                        onConfigChange={setChartConfig}
                        controls="external"
                        exportFilename={`${(name || 'report').replace(/[^\w\-]+/g, '_').toLowerCase()}.csv`}
                      />
                    </Box>
                    {vizRailOpen ? (
                      <Box sx={{ width: 300, flexShrink: 0, border: '1px solid #e2e8f0', borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 560 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.75, borderBottom: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
                          <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', flex: 1 }}>Visualization</Typography>
                          <Tooltip title="Hide settings"><IconButton size="small" onClick={() => setVizRailOpen(false)}><ChevronRightIcon fontSize="small" /></IconButton></Tooltip>
                        </Box>
                        <Box sx={{ flex: 1, minHeight: 0 }}>
                          <VizSettingsRail
                            config={chartConfig}
                            onChange={setChartConfig}
                            data={results.data}
                            columns={results.columns}
                            chartType={chartConfig.chartType || 'table'}
                            inferred={vizInferred}
                          />
                        </Box>
                      </Box>
                    ) : (
                      <Tooltip title="Visualization settings" placement="left">
                        <IconButton onClick={() => setVizRailOpen(true)} sx={{ alignSelf: 'flex-start', border: '1px solid #e2e8f0', borderRadius: 2, color: '#4f46e5' }}>
                          <TuneIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </>
              )
          )}

          {tab === 'query' && (report || isNew) && (
            <Stack spacing={2}>
              <QueryBuilderPanel
                collection={collection}
                datasetId={source?.datasetId}
                onCollectionChange={setCollection}
                onSourceChange={setSource}
                onPipelineChange={setPipelineJson}
                initialState={builderState}
                onStateChange={setBuilderState}
                collapseAll
              />
              <Typography variant="caption" color="text.secondary">
                Edit the query, then press Save changes in the side panel — or Re-run to preview without saving.
              </Typography>
            </Stack>
          )}

          {tab === 'history' && (
            <Stack spacing={2}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <HistoryIcon fontSize="small" />
                <Typography variant="subtitle2">Versions</Typography>
              </Stack>
              {versionsLoading && <CircularProgress size={20} />}
              {!versionsLoading && versions.length === 0 && (
                <EmptyCard
                  icon={<HistoryIcon sx={{ fontSize: 32, color: '#94A3B8' }} />}
                  title="No history yet"
                  subtitle="Save changes to this report to start capturing version snapshots. You'll be able to restore any earlier version from here."
                />
              )}
              {!versionsLoading && versions.length > 0 && (
                <List dense disablePadding>
                  {versions.map((v, i) => {
                    // versions array is reversed for display; map back to backend index.
                    const originalIndex = versions.length - 1 - i;
                    return (
                      <ListItem
                        key={`${v.snapshottedAt}-${i}`}
                        secondaryAction={
                          <Button
                            size="small" startIcon={<RestoreIcon fontSize="small" />}
                            onClick={async () => {
                              try {
                                await api.post(`/questions/${activeId}/restore/${originalIndex}`);
                                const { data } = await api.get(`/questions/${activeId}`);
                                setReport(data);
                                setName(data.name || '');
                                setDescription(data.description || '');
                                setChartConfig({ ...(data.chartConfig || {}), chartType: data.chartConfig?.chartType || 'table' });
                                setCollection(data.queryConfig?.collection || '');
                                setPipelineJson(JSON.stringify(data.queryConfig?.pipeline || [], null, 2));
                                setBuilderState(data.queryConfig?.builderState || null);
                                runQueryWith(data.queryConfig?.collection, data.queryConfig?.pipeline || []);
                                setDirty(false);
                                setTab('preview');
                                setRestoredMsg(`Restored to version from ${v.snapshottedAt ? new Date(v.snapshottedAt).toLocaleString() : 'previous version'}`);
                                setTimeout(() => setRestoredMsg(''), 3000);
                              } catch (e) {
                                setError(e.response?.data?.error || e.message);
                              }
                            }}
                            sx={restoreButtonSx}
                          >
                            Restore
                          </Button>
                        }
                        sx={{ borderBottom: 1, borderColor: 'divider', pr: 12, py: 1.25 }}
                      >
                        <ListItemText
                          primary={v.name || '(untitled)'}
                          secondary={v.snapshottedAt ? new Date(v.snapshottedAt).toLocaleString() : ''}
                          primaryTypographyProps={{ fontWeight: 600, fontSize: '0.9rem' }}
                          secondaryTypographyProps={{ fontSize: '0.75rem' }}
                        />
                      </ListItem>
                    );
                  })}
                </List>
              )}
            </Stack>
          )}
        </Box>
      </DialogContent>

      <Dialog
        open={confirmCloseOpen}
        onClose={() => setConfirmCloseOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <BrandedDialogTitle label="Report" title="Discard Changes" onClose={() => setConfirmCloseOpen(false)} />
        <DialogContent>
          <DialogContentText>
            You have unsaved changes to this report. If you close now, those changes will be lost.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={confirmDiscard} color="error" variant="contained">Discard changes</Button>
        </DialogActions>
      </Dialog>

      <AppToast open={!!savedMsg} onClose={() => setSavedMsg('')} message={savedMsg} modal />
      <AppToast open={!!queryDoneMsg} onClose={() => setQueryDoneMsg('')} message={queryDoneMsg} modal />
      <AppToast open={!!restoredMsg} onClose={() => setRestoredMsg('')} message={restoredMsg} modal />
    </Dialog>
  );
}

// Shared animated empty-state card used across the Preview / History
// tabs. Soft slate "tint" icon on a pastel circle, with a gentle fade-in-up on
// mount and a slow float loop on the icon.
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
