import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Dialog, DialogContent, DialogTitle, DialogActions, DialogContentText,
  AppBar, Toolbar, IconButton, Typography, Stack, Chip,
  Tabs, Tab, Box, Button, Divider, Skeleton,
  TextField, List, ListItem, ListItemText, CircularProgress, Tooltip,
  Snackbar, Alert,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SaveIcon from '@mui/icons-material/Save';
import EditIcon from '@mui/icons-material/Edit';
import StorageIcon from '@mui/icons-material/Storage';
import VerifiedIcon from '@mui/icons-material/Verified';
import HistoryIcon from '@mui/icons-material/History';
import RestoreIcon from '@mui/icons-material/Restore';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import api from '../../hooks/useQuery';
import { streamSSE } from '../../hooks/useAI';
import ChartRenderer from '../charts/ChartRenderer';
import QueryBuilderPanel from '../query-builder/QueryBuilderPanel';

/**
 * Full-bleed modal for viewing AND editing a saved report. The modal is the
 * sole UI for working with an existing report — there is no separate page.
 *
 * Layout:
 *   - Sticky AppBar with title + chips and Tabs (Preview · Query · Details · History).
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
  { key: 'details', label: 'Details' },
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
  const [collection, setCollection] = useState('');
  const [pipelineJson, setPipelineJson] = useState('[]');
  const [builderState, setBuilderState] = useState(null);
  const [source, setSource] = useState({ kind: 'collection', name: '', datasetId: null });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [queryDoneMsg, setQueryDoneMsg] = useState('');
  // Internal id used for save/version/restore. For an unsaved "new" report
  // this is null until the first save creates the record.
  const [activeId, setActiveId] = useState(null);
  // Name+description are locked (greyed) by default for an existing report;
  // a brand-new report starts unlocked. After save we re-lock.
  const [metaEditing, setMetaEditing] = useState(false);

  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [narration, setNarration] = useState({ open: false, text: '', loading: false });
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
    setTab('preview'); setError(''); setDirty(false);

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
    if (!name?.trim()) { setError('Report name is required'); setMetaEditing(true); return; }
    if (!description?.trim()) { setError('Report description is required'); setMetaEditing(true); return; }
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
      setMetaEditing(false);
      setSavedMsg('Saved');
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
        prompt: `I have the report "${name || report?.name || 'Untitled'}" open in front of me.${collection ? ` It reads from "${collection}".` : ''} The results show ${rowCount} row(s) with columns: ${colList}.

I can help you with:
1. How each tab in this report modal works (Build, Results, History)
2. Questions like "how do I filter the data?" or "how do I sort by posting date?"
3. Data analysis — ask me "what is the total?", "which period is the highest?", "what is the average interest accrual?", or anything about the numbers in front of you

What would you like to know?`,
      },
    }));
  };

  const narrate = async () => {
    if (!results?.data) return;
    const preview = JSON.stringify((results.data || []).slice(0, 50));
    const cols = (results.columns || []).join(', ');
    const prompt = `Write a 3-5 sentence business narrative summary for this report.

Report: "${name || 'Untitled'}"
${description ? `Description: ${description}` : ''}
Chart type: ${chartConfig?.chartType || 'table'}
Columns: ${cols}
Row count: ${results.data.length}${results.truncated ? ' (truncated)' : ''}
Data (first 50 rows): ${preview}

Write for a non-technical finance audience. Cite specific numbers (totals, top items, notable trends). Use plain English prose, no bullet lists. Do not mention MongoDB or pipelines.`;

    setNarration({ open: true, text: '', loading: true });
    try {
      let acc = '';
      await streamSSE('/ai/chat', { messages: [{ role: 'user', content: prompt }], dashboardContext: {} }, (chunk) => {
        acc += chunk;
        setNarration((prev) => ({ ...prev, text: acc }));
      });
    } catch (err) {
      setNarration((prev) => ({ ...prev, text: `Error: ${err.message}` }));
    } finally {
      setNarration((prev) => ({ ...prev, loading: false }));
    }
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
      PaperProps={{ sx: { width: '96vw', height: '95vh', maxWidth: 'none', borderRadius: 2 } }}
    >
      <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', pt: 2 }}>
        <Toolbar variant="dense" sx={{ gap: 1.5, alignItems: 'center', minHeight: 64, px: 3 }}>
          <Stack direction="column" sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={700} noWrap>
              {name || (isNew ? 'New report' : (activeId ? 'Loading…' : ''))}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap' }}>
              {sourceChip}
              {report?.verified && (
                <Chip icon={<VerifiedIcon sx={{ fontSize: 14 }} />} label="Verified" size="small" color="success" variant="outlined" />
              )}
              {results && (
                <Chip
                  size="small" variant="outlined"
                  label={`${results.data?.length || 0} rows · ${results.executionTime ?? '—'}ms`}
                />
              )}
              {dirty && (
                <Chip size="small" color="warning" variant="outlined" label="Unsaved changes" />
              )}
            </Stack>
          </Stack>
          <IconButton size="small" onClick={handleClose}><CloseIcon /></IconButton>
        </Toolbar>
        <Tabs
          value={tab} onChange={(_, v) => setTab(v)}
          variant="scrollable" allowScrollButtonsMobile
          sx={{ px: 3, minHeight: 44, '& .MuiTab-root': { fontWeight: 500 }, '& .MuiTab-root.Mui-selected': { color: '#1e40af', fontWeight: 700 }, '& .MuiTabs-indicator': { bgcolor: '#3b82f6' } }}
        >
          {TABS.map((t) => (
            <Tab key={t.key} value={t.key} label={t.label} sx={{ minHeight: 44, py: 0.5, textTransform: 'none' }} />
          ))}
        </Tabs>
      </AppBar>

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
                value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Report name"
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
                size="small" fullWidth multiline minRows={2} maxRows={5}
                value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this report show?"
              />
            ) : (
              <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'pre-wrap' }}>
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
              {running ? 'Running…' : 'Re-run query'}
            </Button>
            <Button
              size="small" variant="contained" fullWidth
              startIcon={saving ? <CircularProgress size={13} color="inherit" /> : <SaveIcon fontSize="small" />}
              onClick={save} disabled={saving || (!dirty && !!activeId) || !name?.trim() || !description?.trim()}
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
        <Box sx={{ flex: 1, p: 4, overflow: 'auto', minWidth: 0, bgcolor: '#f8fafc' }}>
          {error && <Typography color="error" variant="body2" sx={{ mb: 2 }}>{error}</Typography>}

          {tab === 'preview' && (
            running && !results
              ? (
                <Stack spacing={1.25}>
                  {[...Array(8)].map((_, i) => (
                    <Skeleton key={i} variant="rectangular" height={36} sx={{ borderRadius: 1, opacity: 1 - i * 0.1 }} />
                  ))}
                </Stack>
              )
              : results && (
                <>
                  <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
                    <Button
                      size="small" variant="outlined"
                      startIcon={narration.loading ? <CircularProgress size={13} sx={{ color: '#7c3aed' }} /> : <AutoAwesomeIcon fontSize="small" />}
                      onClick={narrate}
                      disabled={narration.loading}
                      sx={{
                        borderRadius: 2, fontWeight: 600, textTransform: 'none',
                        color: '#7c3aed', borderColor: '#ddd6fe', bgcolor: '#faf5ff',
                        '&:hover': { bgcolor: '#ede9fe', borderColor: '#c4b5fd' },
                        '&.Mui-disabled': { bgcolor: '#faf5ff', borderColor: '#ddd6fe', color: '#7c3aed' },
                      }}
                    >
                      {narration.loading ? 'Writing…' : 'Narrate results'}
                    </Button>
                  </Stack>
                  {narration.open && (
                    <Box sx={{ mb: 2, p: 2, bgcolor: '#faf5ff', border: '1px solid #ddd6fe', borderRadius: 2.5 }}>
                      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1 }}>
                        <AutoAwesomeIcon sx={{ fontSize: 16, color: '#7c3aed' }} />
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#4c1d95' }}>AI Narrative</Typography>
                        {narration.loading && <CircularProgress size={12} sx={{ color: '#7c3aed' }} />}
                        <Box sx={{ flex: 1 }} />
                        <IconButton size="small" onClick={() => setNarration({ open: false, text: '', loading: false })}>
                          <CloseIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Stack>
                      <Typography variant="body2" sx={{ lineHeight: 1.7, color: '#1e293b' }}>
                        {narration.text || (narration.loading ? 'Writing narrative…' : '')}
                      </Typography>
                    </Box>
                  )}
                  {results.truncated && (
                    <Box sx={{ px: 1.5, py: 0.75, mb: 1.5, bgcolor: '#fffbeb', border: 1, borderColor: '#fde68a', borderRadius: 1 }}>
                      <Typography variant="caption" sx={{ color: '#92400e' }}>
                        Result capped at {results.data?.length?.toLocaleString()} rows — there is more data. Add a "Sort &amp; Limit" step or filter your data further.
                      </Typography>
                    </Box>
                  )}
                  <ChartRenderer
                    data={results.data}
                    columns={results.columns}
                    config={chartConfig}
                    onConfigChange={setChartConfig}
                    exportFilename={`${(name || 'report').replace(/[^\w\-]+/g, '_').toLowerCase()}.csv`}
                  />
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

          {tab === 'details' && report && (
            <Stack spacing={2.25} sx={{ maxWidth: 720 }}>
              <Detail label="Name" value={name} />
              <Detail label="Description" value={description || '—'} />
              <Detail label="Collection" value={collection || '—'} />
              <Detail label="Type" value={report.type || 'builder'} />
              <Detail label="Created" value={report.createdAt ? new Date(report.createdAt).toLocaleString() : '—'} />
              <Detail label="Updated" value={report.updatedAt ? new Date(report.updatedAt).toLocaleString() : '—'} />
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
                <Typography variant="body2" color="text.secondary">No previous versions.</Typography>
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
                              } catch (e) {
                                setError(e.response?.data?.error || e.message);
                              }
                            }}
                            sx={{
                              borderRadius: 2, fontWeight: 600, textTransform: 'none',
                              color: '#1e40af', borderColor: '#bfdbfe', bgcolor: '#eff6ff',
                              border: '1px solid #bfdbfe',
                              '&:hover': { bgcolor: '#dbeafe', borderColor: '#93c5fd' },
                            }}
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
        <DialogTitle sx={{ fontWeight: 700 }}>Discard unsaved changes?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have unsaved changes to this report. If you close now, those changes will be lost.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmCloseOpen(false)}>Keep editing</Button>
          <Button onClick={confirmDiscard} color="error" variant="contained">Discard changes</Button>
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
            bgcolor: '#d1fae5',
            color: '#065f46',
            fontWeight: 600,
            border: '1px solid #a7f3d0',
            boxShadow: '0 6px 16px rgba(16,185,129,0.18)',
            '& .MuiAlert-action': { color: '#065f46' },
          }}
        >
          {savedMsg}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!queryDoneMsg}
        autoHideDuration={3000}
        onClose={() => setQueryDoneMsg('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ mt: savedMsg ? 22 : 8, zIndex: (theme) => theme.zIndex.modal + 20 }}
      >
        <Alert
          severity="success"
          variant="filled"
          icon={<CheckCircleOutlineIcon fontSize="inherit" />}
          onClose={() => setQueryDoneMsg('')}
          sx={{
            bgcolor: '#bbf7d0',
            color: '#14532d',
            fontWeight: 600,
            border: '1px solid #86efac',
            boxShadow: '0 6px 16px rgba(16,185,129,0.18)',
            '& .MuiAlert-action': { color: '#14532d' },
          }}
        >
          {queryDoneMsg}
        </Alert>
      </Snackbar>
    </Dialog>
  );
}

function Detail({ label, value }) {
  return (
    <Stack direction="row" spacing={3}>
      <Typography variant="body2" sx={{ width: 120, color: 'text.secondary' }}>{label}</Typography>
      <Typography variant="body2" sx={{ flex: 1 }}>{value}</Typography>
    </Stack>
  );
}
