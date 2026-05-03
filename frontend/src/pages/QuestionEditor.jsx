import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Button, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, DialogContentText, Typography, CircularProgress, Chip, Stack,
  Switch, FormControlLabel, FormControl, InputLabel, Select, MenuItem, Divider, Collapse,
  IconButton, Tooltip, List, ListItem, ListItemText, Skeleton,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import VerifiedIcon from '@mui/icons-material/Verified';
import StorageIcon from '@mui/icons-material/Storage';
import CodeIcon from '@mui/icons-material/Code';
import HistoryIcon from '@mui/icons-material/History';
import RestoreIcon from '@mui/icons-material/Restore';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PipelineEditor from '../components/native-editor/PipelineEditor';
import QueryBuilderPanel from '../components/query-builder/QueryBuilderPanel';
import ChartRenderer, { CHART_TYPES } from '../components/charts/ChartRenderer';
import StarterChooser, { intentDefaults } from '../components/question-starter/StarterChooser';
import AIExplainPanel from '../components/ai/AIExplainPanel';
import ReplaceWithCuratedStrip from '../components/question-helpers/ReplaceWithCuratedStrip';
import api from '../hooks/useQuery';
import usePageTitleStore from '../store/pageTitleStore';
import useReportContextStore from '../store/reportContextStore';

export default function QuestionEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = !id || id === 'new';

  // Redirect shim — reports now open via ReportPreviewDialog modal.
  // This handles legacy deep-links like /question/:id and /question/new.
  useEffect(() => {
    navigate('/reports', { replace: true });
    window.dispatchEvent(new CustomEvent('fyntrac:open:report', {
      detail: isNew ? { isNew: true } : { id },
    }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [powerMode, setPowerMode] = useState(false);
  const [question, setQuestion] = useState(null);
  const [pipeline, setPipeline] = useState('[]');
  const [collection, setCollection] = useState('');
  const [source, setSource] = useState({ kind: 'collection', name: '', datasetId: null, verified: false });
  const [variables, setVariables] = useState({});
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveMsg, setSaveMsg] = useState(''); // brief "Saved" confirmation label
  const [chartConfig, setChartConfig] = useState({ chartType: 'table' });
  const [builderState, setBuilderState] = useState(null);
  const [error, setError] = useState('');
  const [showStarter, setShowStarter] = useState(false);
  const [draftedByAI, setDraftedByAI] = useState(false);
  const [lastRunAt, setLastRunAt] = useState(null);
  const [runMs, setRunMs] = useState(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [restoreConfirmIdx, setRestoreConfirmIdx] = useState(null);
  const setPageTitle = usePageTitleStore((s) => s.setTitle);
  const setReportCtx = useReportContextStore((s) => s.setReport);
  const clearReportCtx = useReportContextStore((s) => s.clearReport);

  // Push the active report's title into the topbar breadcrumb store.
  useEffect(() => {
    setPageTitle(isNew ? 'New report' : (question?.name || ''));
    return () => setPageTitle('');
  }, [isNew, question?.name, setPageTitle]);

  // Publish the current report context so the global AI drawer can ground
  // its answers in what the user is actually looking at. We trim sample
  // rows to the first 50 to keep the prompt small.
  useEffect(() => {
    let parsedPipeline = [];
    try { parsedPipeline = JSON.parse(pipeline); } catch { /* ignore */ }
    setReportCtx({
      kind: 'report',
      name: isNew ? (saveName || 'New report') : (question?.name || ''),
      description: question?.description || '',
      collection,
      pipeline: parsedPipeline,
      builderState,
      chartType: chartConfig?.chartType,
      columns: results?.columns || [],
      sampleRows: Array.isArray(results?.data) ? results.data.slice(0, 50) : [],
      rowCount: results?.data?.length || 0,
    });
    return () => clearReportCtx();
  }, [collection, pipeline, builderState, chartConfig?.chartType, results, question?.name, question?.description, saveName, isNew, setReportCtx, clearReportCtx]);

  useEffect(() => {
    if (!isNew) {
      api.get(`/questions/${id}`).then((r) => {
        const q = r.data;
        setQuestion(q);
        setSaveName(q.name);
        setSaveDescription(q.description || '');
        setPipeline(JSON.stringify(q.queryConfig?.pipeline || [], null, 2));
        setCollection(q.queryConfig?.collection || '');
        setBuilderState(q.queryConfig?.builderState || null);
        // Always start saved reports in table mode regardless of last saved
        // chart type — user can switch via the layout dropdown.
        setChartConfig({ ...(q.chartConfig || {}), chartType: 'table' });
        if (q.queryConfig?.source) setSource(q.queryConfig.source);
        // Power mode auto-on for native questions so the raw pipeline editor is visible.
        if (q.type === 'native') setPowerMode(true);
        document.title = `${q.name} · Fyntrac Insight`;

        // Run the query immediately with the fresh values from the API
        // response. State updates above won't be committed until the next
        // render, so we read directly from `q` instead of relying on a
        // separate useEffect that would fire one render cycle later.
        const freshCollection = q.queryConfig?.collection || '';
        const freshPipeline = q.queryConfig?.pipeline || [];
        if (freshCollection && freshPipeline.length > 0) {
          setRunning(true);
          const attemptRun = (retries = 1) =>
            api.post('/query/run', { collection: freshCollection, pipeline: freshPipeline })
              .then((res) => {
                setResults(res.data);
                setLastRunAt(new Date());
                setRunMs(res.data?.executionTime || null);
              })
              .catch((e) => {
                // Retry once on cold-start backend connection errors so the
                // user never sees a raw internal error on page load.
                if (retries > 0) {
                  return new Promise((resolve) => setTimeout(resolve, 800))
                    .then(() => attemptRun(retries - 1));
                }
                setError(e.response?.data?.error || e.message);
              })
              .finally(() => setRunning(false));
          attemptRun();
        }
      });
    } else {
      document.title = 'New report · Fyntrac Insight';
      // AI co-pilot handoff: seed=ai reads sessionStorage.fyntrac_ai_plan
      if (searchParams.get('seed') === 'ai') {
        try {
          const seed = JSON.parse(sessionStorage.getItem('fyntrac_ai_plan') || 'null');
          if (seed) {
            if (seed.collection) setCollection(seed.collection);
            if (seed.builderState) setBuilderState(seed.builderState);
            if (seed.pipeline) setPipeline(JSON.stringify(seed.pipeline, null, 2));
            if (seed.chartType) setChartConfig({ chartType: seed.chartType });
            if (seed.name) setSaveName(seed.name);
            setDraftedByAI(true);
            sessionStorage.removeItem('fyntrac_ai_plan');
          }
        } catch { /* ignore */ }
        return;
      }
      const urlPipeline = searchParams.get('pipeline');
      const urlCollection = searchParams.get('collection');
      const urlIntent = searchParams.get('intent');
      if (urlPipeline) {
        try {
          const parsed = JSON.parse(decodeURIComponent(urlPipeline));
          setPipeline(JSON.stringify(parsed, null, 2));
          setPowerMode(true);
        } catch { /* ignore */ }
      }
      if (urlCollection) setCollection(decodeURIComponent(urlCollection));
      if (urlIntent) {
        const d = intentDefaults(urlIntent);
        if (d.builderState) setBuilderState(d.builderState);
        if (d.chartType) setChartConfig({ chartType: d.chartType });
      } else if (!urlPipeline && !urlCollection) {
        setShowStarter(true);
      }
    }
  }, [id, isNew, searchParams]);

  const runQuery = async () => {
    setError('');
    setRunning(true);
    try {
      let parsed;
      try { parsed = JSON.parse(pipeline); } catch {
        setError('Invalid JSON pipeline'); setRunning(false); return;
      }
      const res = await api.post('/query/run', { collection, pipeline: parsed, variables });
      setResults(res.data);
      setLastRunAt(new Date());
      setRunMs(res.data?.executionTime || null);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setRunning(false);
    }
  };

  const saveQuestion = async () => {
    const isBuilder = !powerMode;
    const payload = {
      name: saveName,
      description: saveDescription,
      type: isBuilder ? 'builder' : 'native',
      queryConfig: {
        collection,
        pipeline: JSON.parse(pipeline),
        ...(isBuilder && builderState ? { builderState } : {}),
        ...(source.datasetId ? { source } : {}),
        ...(draftedByAI ? { draftedByAI: true } : {}),
      },
      chartConfig,
    };
    try {
      if (isNew) {
        const res = await api.post('/questions', payload);
        navigate(`/question/${res.data._id}`, { replace: true });
      } else {
        const res = await api.put(`/questions/${id}`, payload);
        setQuestion((q) => res?.data || (q ? { ...q, name: saveName, description: saveDescription } : q));
      }
      setSaveOpen(false);
      document.title = `${saveName} · Fyntrac Insight`;
      setSaveMsg('Report saved');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to save report');
    }
  };

  // Auto-run when a saved report finishes loading. Triggers once per
  // mount: we wait for question + collection + pipeline to be hydrated
  // and only fire if results haven't been produced yet.
  // NOTE: the primary auto-run is now inline in the load effect above
  // (using fresh API values). This effect is a safety net for edge cases
  // where the load effect didn't fire a run (e.g. empty pipeline).
  useEffect(() => {
    if (isNew) return;
    if (!question || !collection || results || running) return;
    runQuery();
  }, [question?._id, collection]); // eslint-disable-line

  /** Open the version history drawer (last 10 saved snapshots). */
  const openVersions = async () => {
    if (isNew) return;
    setVersionsOpen(true);
    setVersionsLoading(true);
    try {
      const { data } = await api.get(`/questions/${id}/versions`);
      // Backend keeps newest at the END of the array; show newest first.
      setVersions([...(data || [])].reverse());
    } catch {
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  };

  const restoreVersion = async (originalIndex) => {
    if (isNew) return;
    setRestoreConfirmIdx(originalIndex);
  };

  const confirmRestoreVersion = async () => {
    const originalIndex = restoreConfirmIdx;
    setRestoreConfirmIdx(null);
    if (originalIndex == null) return;
    try {
      const { data } = await api.post(`/questions/${id}/restore/${originalIndex}`);
      setQuestion(data);
      setSaveName(data.name);
      setPipeline(JSON.stringify(data.queryConfig?.pipeline || [], null, 2));
      setCollection(data.queryConfig?.collection || '');
      setBuilderState(data.queryConfig?.builderState || null);
      setChartConfig({ ...(data.chartConfig || {}), chartType: 'table' });
      if (data.queryConfig?.source) setSource(data.queryConfig.source);
      setVersionsOpen(false);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  if (!isNew && !question) {
    return (
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Skeleton variant="text" width={280} height={44} />
        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
        <Skeleton variant="rectangular" height={260} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  if (showStarter && isNew) {
    return (
      <StarterChooser
        onSkip={() => setShowStarter(false)}
        onPick={({ intent, collection: c, datasetId, datasetName, datasetVerified }) => {
          const d = intentDefaults(intent);
          if (c) setCollection(c);
          if (datasetId) setSource({ kind: 'dataset', name: datasetName, datasetId, sourceCollection: c, verified: !!datasetVerified });
          else setSource({ kind: 'collection', name: c, datasetId: null });
          if (d.builderState) setBuilderState(d.builderState);
          if (d.chartType) setChartConfig({ chartType: d.chartType });
          if (intent === 'ai') {
            // Surface the AI co-pilot — but inline, since the proposer is now
            // mounted above the step stack. No drawer needed for the default flow.
          }
          setShowStarter(false);
        }}
      />
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ mb: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Typography variant="h2" sx={{ lineHeight: 1.2 }}>
            {isNew ? 'New report' : (question?.name || 'Loading…')}
          </Typography>
          {source.datasetId && (
            <Chip
              icon={source.verified ? <VerifiedIcon sx={{ fontSize: 14 }} /> : <StorageIcon sx={{ fontSize: 14 }} />}
              label={source.verified ? `Built on certified dataset · ${source.name}` : `Built on ${source.name}`}
              size="small"
              color={source.verified ? 'success' : 'default'}
              variant="outlined"
            />
          )}
          {(draftedByAI || question?.queryConfig?.draftedByAI) && (
            <Chip
              icon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />}
              label="Drafted by AI"
              size="small"
              sx={{ bgcolor: '#ede9fe', color: '#6d28d9', fontWeight: 600 }}
            />
          )}
          {question?.verified && (
            <Chip icon={<VerifiedIcon sx={{ fontSize: 14 }} />} label="Verified" size="small" color="success" variant="outlined" />
          )}
          {results && (
            <Chip
              size="small" variant="outlined"
              label={`${results.data?.length || 0} rows · ${runMs != null ? `${runMs}ms` : '—'}${lastRunAt ? ` · ${timeAgo(lastRunAt)}` : ''}`}
              sx={{ fontSize: '0.72rem', height: 22 }}
            />
          )}
        </Stack>
        {!isNew && question?.description && (
          <Typography variant="body2" color="text.secondary">{question.description}</Typography>
        )}
      </Box>

      {/* Toolbar — layout picker + power-user switch + Run + Save */}
      <Stack
        direction="row" alignItems="center" spacing={1.5}
        sx={{ mb: 2, py: 1, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap' }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>Layout</Typography>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <Select
            value={chartConfig.chartType || 'table'}
            onChange={(e) => setChartConfig({ ...chartConfig, chartType: e.target.value })}
          >
            {CHART_TYPES.map((ct) => <MenuItem key={ct.key} value={ct.key}>{ct.label}</MenuItem>)}
          </Select>
        </FormControl>

        <Divider orientation="vertical" flexItem />

        <FormControlLabel
          control={<Switch size="small" checked={powerMode} onChange={(e) => setPowerMode(e.target.checked)} />}
          label={<Stack direction="row" spacing={0.5} alignItems="center"><CodeIcon sx={{ fontSize: 16 }} /><Typography variant="body2">Power user (raw pipeline)</Typography></Stack>}
        />

        <Box sx={{ flex: 1 }} />

        <Button
          startIcon={running ? <CircularProgress size={14} /> : <PlayArrowIcon />}
          variant="contained" size="small" onClick={runQuery} disabled={running || !collection}
        >
          Run
        </Button>
        <Button startIcon={<SaveIcon />} variant="outlined" size="small" onClick={() => setSaveOpen(true)} disabled={!collection}>
          Save
        </Button>
        {saveMsg && (
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: 'success.main' }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 16 }} />
            <Typography variant="caption" fontWeight={600}>{saveMsg}</Typography>
          </Stack>
        )}
        {!isNew && (
          <Tooltip title="Version history">
            <span>
              <IconButton size="small" onClick={openVersions}><HistoryIcon fontSize="small" /></IconButton>
            </span>
          </Tooltip>
        )}
      </Stack>

      <Box sx={{ flex: '0 0 auto' }}>
        <Collapse in={powerMode}>
          <Box sx={{ mb: powerMode ? 2 : 0 }}>
            <PipelineEditor
              value={pipeline}
              onChange={setPipeline}
              collection={collection}
              onCollectionChange={setCollection}
              variables={variables}
              onVariablesChange={setVariables}
            />
          </Box>
        </Collapse>

        {!powerMode && (
          <>
            <ReplaceWithCuratedStrip
              collection={collection}
              builderState={builderState}
              onApplyKpi={(kpi) => {
                const num = kpi.definition?.numerator;
                if (!num) return;
                setBuilderState((prev) => ({
                  ...(prev || {}),
                  metrics: [{ agg: num.agg || '$sum', field: num.field || '', alias: kpi.name }],
                }));
              }}
              onApplySavedFilter={(sf) => {
                setBuilderState((prev) => ({
                  ...(prev || {}),
                  filters: [...(prev?.filters || []), { savedFilterRef: { id: sf._id, name: sf.name, match: sf.definition?.match || sf.definition } }],
                }));
              }}
            />
            <QueryBuilderPanel
              collection={collection}
              datasetId={source.datasetId}
              onCollectionChange={setCollection}
              onSourceChange={setSource}
              onPipelineChange={setPipeline}
              initialState={builderState}
              onStateChange={setBuilderState}
              collapseAll={!isNew}
            />
            {/* Explain-this-result panel sits right under the step stack so
                users see it immediately after Sort & Limit without having
                to scroll past the rendered chart/table. */}
            {results && (
              <Box sx={{ mt: 1.5 }}>
                <AIExplainPanel
                  data={results.data}
                  chartConfig={chartConfig}
                  onFollowUp={(q) => {
                    window.dispatchEvent(new CustomEvent('fyntrac:ai:open', { detail: { prompt: q } }));
                  }}
                />
              </Box>
            )}
          </>
        )}
      </Box>

      {error && <Typography color="error" variant="body2" sx={{ px: 1, mt: 1 }}>{error}</Typography>}
      {running && !results && (
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Skeleton variant="rectangular" height={36} sx={{ borderRadius: 1 }} />
          <Skeleton variant="rectangular" height={36} sx={{ borderRadius: 1, opacity: 0.7 }} />
          <Skeleton variant="rectangular" height={36} sx={{ borderRadius: 1, opacity: 0.5 }} />
          <Skeleton variant="rectangular" height={36} sx={{ borderRadius: 1, opacity: 0.3 }} />
        </Box>
      )}
      {results && (
        <Box sx={{ flex: 1, mt: 2, overflow: 'auto' }}>
          {results.truncated && (
            <Box sx={{ px: 1.5, py: 0.75, mb: 1, bgcolor: '#fffbeb', border: 1, borderColor: '#fde68a', borderRadius: 1 }}>
              <Typography variant="caption" sx={{ color: '#92400e' }}>
                Result capped at {results.data?.length?.toLocaleString()} rows — there is more data. Add a "Sort &amp; Limit" step to paginate precisely, or filter your data further.
              </Typography>
            </Box>
          )}
          <ChartRenderer
            data={results.data}
            columns={results.columns}
            config={chartConfig}
            onConfigChange={setChartConfig}
            exportFilename={`${(question?.name || 'report').replace(/[^\w\-]+/g, '_').toLowerCase()}.csv`}
          />
        </Box>
      )}

      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Save Report</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Name"
            fullWidth
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            sx={{ mt: 1 }}
          />
          <TextField
            label="Description"
            placeholder="What does this report show? Who is it for?"
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
            value={saveDescription}
            onChange={(e) => setSaveDescription(e.target.value)}
            helperText="Shown on the report card and in search results."
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveQuestion} disabled={!saveName}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Restore version confirmation dialog */}
      <Dialog open={restoreConfirmIdx != null} onClose={() => setRestoreConfirmIdx(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Restore this version?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Your current version will be saved as a new snapshot first, then this version will be restored.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRestoreConfirmIdx(null)}>Cancel</Button>
          <Button onClick={confirmRestoreVersion} variant="contained" color="primary">Restore</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={versionsOpen} onClose={() => setVersionsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <HistoryIcon fontSize="small" />
            <span>Version history</span>
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block">
            Showing the last {versions.length} of up to 10 saved snapshots. Restoring will save your current state as a new snapshot first.
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {versionsLoading && <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress size={24} /></Box>}
          {!versionsLoading && versions.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              No previous versions yet — save a change to start a history.
            </Typography>
          )}
          {!versionsLoading && versions.length > 0 && (
            <List dense disablePadding>
              {versions.map((v, displayIdx) => {
                // versions array was reversed for display; map back to backend index.
                const originalIndex = versions.length - 1 - displayIdx;
                const when = v.snapshottedAt ? new Date(v.snapshottedAt) : null;
                return (
                  <ListItem
                    key={`${v.snapshottedAt}-${displayIdx}`}
                    secondaryAction={
                      <Button size="small" startIcon={<RestoreIcon fontSize="small" />} onClick={() => restoreVersion(originalIndex)}>
                        Restore
                      </Button>
                    }
                    sx={{ borderBottom: 1, borderColor: 'divider', pr: 12 }}
                  >
                    <ListItemText
                      primary={v.name || '(untitled)'}
                      secondary={when ? `${when.toLocaleString()} · ${timeAgo(when)}` : '—'}
                      primaryTypographyProps={{ fontWeight: 600, fontSize: '0.9rem' }}
                      secondaryTypographyProps={{ fontSize: '0.75rem' }}
                    />
                  </ListItem>
                );
              })}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVersionsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function timeAgo(d) {
  const ms = Date.now() - new Date(d).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}
