import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Typography, TextField, Button, Chip, IconButton, Tooltip, Switch,
  FormControlLabel, Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress,
  Paper, Link as MuiLink, Snackbar,
} from '@mui/material';
import VerifiedIcon from '@mui/icons-material/Verified';
import SaveIcon from '@mui/icons-material/TurnedIn';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CodeIcon from '@mui/icons-material/Code';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import api from '../hooks/useQuery';
import { StepCard, StepArrow, AddStepButton } from '../components/dataset-builder/StepCard';
import { compileSteps } from '../components/dataset-builder/compileSteps';
import { isHiddenColumn } from '../components/charts/_columnRules';
import DataTable from '../components/charts/DataTable';
import useDatasetContextStore from '../store/datasetContextStore';
import AppToast from '../components/shared/AppToast';
import SearchSelect from '../components/shared/SearchSelect';
export default function DatasetEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = !id || id === 'new';

  // Redirect shim — datasets now open via DatasetPreviewDialog modal.
  // This handles legacy deep-links like /dataset/:id and /dataset/new.
  useEffect(() => {
    navigate('/models', { replace: true });
    window.dispatchEvent(new CustomEvent('fyntrac:open:dataset', {
      detail: isNew ? { isNew: true } : { id },
    }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceCollection, setSourceCollection] = useState('');
  const [steps, setSteps] = useState([]);
  const [columnOrder, setColumnOrder] = useState([]);
  const [verified, setVerified] = useState(false);
  const [collections, setCollections] = useState([]);
  const [sampleMode, setSampleMode] = useState(true);
  const [sampleSize, setSampleSize] = useState(10000);

  const [previewData, setPreviewData] = useState(null);
  const [stepCounts, setStepCounts] = useState([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [previewMsg, setPreviewMsg] = useState('');

  const [pipelineDialog, setPipelineDialog] = useState(false);
  const [lineage, setLineage] = useState(null);

  const [aiPrompt, setAiPrompt] = useState('');

  const askAIForStep = () => {
    const text = aiPrompt.trim();
    if (!text) return;
    setAiPrompt('');
    window.dispatchEvent(new CustomEvent('fyntrac:ai:open', { detail: { prompt: text } }));
  };

  // Initial load
  useEffect(() => {
    api.get('/schema/collections')
      .then((r) => setCollections(r.data))
      .catch(() => setError('Failed to load collections'));
    if (!isNew) {
      api.get(`/models/${id}`).then((r) => {
        const m = r.data;
        setName(m.name); setDescription(m.description || '');
        setSourceCollection(m.sourceCollection); setVerified(!!m.verified);
        setSteps(Array.isArray(m.steps) && m.steps.length > 0 ? m.steps : []);
        setColumnOrder(Array.isArray(m.columnOrder) ? m.columnOrder : []);
        document.title = `${m.name} · Dataset · Fyntrac Insight`;
      }).catch((e) => setError(e?.response?.data?.error || 'Failed to load dataset'));
      api.get(`/models/${id}/lineage`).then((r) => setLineage(r.data)).catch(() => {});
    } else {
      document.title = 'New dataset · Fyntrac Insight';
      const params = new URLSearchParams(location.search);
      const starter = params.get('starter');
      const fromColl = params.get('source');
      if (fromColl) setSourceCollection(fromColl);
      if (starter === 'combine') setSteps([{ kind: 'combine', relationship: 'one', unmatched: 'keep' }]);
      if (starter === 'rollup') setSteps([{ kind: 'summarize', groupBys: [], metrics: [{ agg: '$count' }] }]);
      const fromQuestion = params.get('fromQuestion');
      if (fromQuestion) {
        api.get(`/questions/${fromQuestion}`).then((r) => {
          const q = r.data;
          setName(`${q.name} (dataset)`);
          setSourceCollection(q.queryConfig?.collection || '');
          // best-effort: hydrate steps from builderState if present
          const bs = q.queryConfig?.builderState;
          if (bs) {
            const seeded = [];
            if (bs.filters?.length) seeded.push({ kind: 'filter', filters: bs.filters });
            if ((bs.groupBys && bs.groupBys.length) || (bs.metrics && bs.metrics.length)) {
              seeded.push({ kind: 'summarize', groupBys: bs.groupBys || [], metrics: bs.metrics || [] });
            }
            if (bs.sortField) seeded.push({ kind: 'sort', field: bs.sortField, dir: bs.sortDir });
            if (bs.limit) seeded.push({ kind: 'keepTopN', limit: bs.limit });
            setSteps(seeded);
          }
        }).catch(() => {}); // best-effort seeding; non-critical
      }
    }
  }, [id, isNew, location.search]);

  const compiledPipeline = useMemo(() => compileSteps(steps), [steps]);

  // Publish dataset context for the global AI drawer.
  const setDatasetCtx = useDatasetContextStore((s) => s.setDataset);
  const clearDatasetCtx = useDatasetContextStore((s) => s.clearDataset);
  useEffect(() => {
    const cols = (previewData?.columns || []).filter((c) => !isHiddenColumn(c));
    setDatasetCtx({
      id: isNew ? null : id,
      name,
      description,
      sourceCollection,
      verified,
      steps,
      pipeline: compiledPipeline,
      columns: cols,
      rowCount: previewData?.data?.length ?? null,
      sampleRows: (previewData?.data || []).slice(0, 25),
    });
  }, [id, isNew, name, description, sourceCollection, verified, steps, compiledPipeline, previewData, setDatasetCtx]);
  useEffect(() => () => clearDatasetCtx(), [clearDatasetCtx]);

  const runPreview = useCallback(async () => {
    if (!sourceCollection) { setError('Pick a source table first'); return; }
    setError(''); setRunning(true);
    try {
      const res = await api.post('/models/preview-steps', {
        sourceCollection,
        steps,
        sampleSize: sampleMode ? sampleSize : 0,
        previewLimit: 100,
      });
      setPreviewData(res.data);
      setStepCounts(res.data.stepCounts || []);
      setPreviewMsg(`Preview ready — ${res.data.data?.length || 0} rows · ${res.data.executionTime ?? 0}ms`);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setRunning(false);
    }
  }, [sourceCollection, steps, sampleMode, sampleSize]);

  // Auto-run a preview when source / step set changes (debounced).
  useEffect(() => {
    if (!sourceCollection) return;
    const t = setTimeout(() => { runPreview(); }, 600);
    return () => clearTimeout(t);
  }, [sourceCollection, JSON.stringify(steps), sampleMode, sampleSize]); // eslint-disable-line

  const save = async () => {
    if (!name) { setError('Give your dataset a name first'); return; }
    if (!sourceCollection) { setError('Pick a source table'); return; }
    try {
      const payload = { name, description, sourceCollection, steps, columnOrder, verified };
      if (isNew) {
        const r = await api.post('/models', payload);
        navigate(`/dataset/${r.data._id}`, { replace: true });
      } else {
        await api.put(`/models/${id}`, payload);
      }
      document.title = `${name} · Dataset · Fyntrac Insight`;
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const updateStep = (i, next) => setSteps((arr) => arr.map((s, idx) => (idx === i ? next : s)));
  const deleteStep = (i) => setSteps((arr) => arr.filter((_, idx) => idx !== i));
  // Track the index of the most recently-added step so its card can render
  // expanded by default — clicking a toolbar button should reveal the editor
  // strip immediately rather than requiring a second click to expand.
  const [justAddedIndex, setJustAddedIndex] = useState(null);
  const addStep = (s) => setSteps((arr) => {
    const next = [...arr, s];
    setJustAddedIndex(next.length - 1);
    return next;
  });

  const enabledIndex = useMemo(() => {
    const m = []; let j = 0;
    for (let i = 0; i < steps.length; i++) m[i] = steps[i].disabled ? null : j++;
    return m;
  }, [steps]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 280 }}>
          <TextField
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Untitled dataset"
            variant="standard"
            inputProps={{ style: { fontSize: 28, fontWeight: 700 } }}
            fullWidth
          />
          <TextField
            value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this dataset for?"
            variant="standard" fullWidth
            sx={{ mt: 0.5 }}
            inputProps={{ style: { fontSize: 14, color: '#64748b' } }}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip
            icon={<VerifiedIcon />}
            label={verified ? 'Certified' : 'Mark as certified'}
            onClick={() => setVerified((v) => !v)}
            color={verified ? 'success' : 'default'}
            variant={verified ? 'filled' : 'outlined'}
            clickable
          />
          <FormControlLabel
            control={<Switch checked={sampleMode} onChange={(e) => setSampleMode(e.target.checked)} />}
            label={`Sample mode${sampleMode ? ` (${sampleSize.toLocaleString()})` : ''}`}
          />
          <Tooltip title="View compiled MongoDB pipeline">
            <IconButton onClick={() => setPipelineDialog(true)}><CodeIcon /></IconButton>
          </Tooltip>
          <Button startIcon={<PlayArrowIcon sx={{ color: running || !sourceCollection ? 'inherit' : '#16a34a' }} />} onClick={() => runPreview(true)} disabled={running || !sourceCollection}>
            Run
          </Button>
          <Button startIcon={<SaveIcon />} variant="contained" onClick={save}>Save</Button>
        </Box>
      </Box>

      <AppToast open={!!error} onClose={() => setError('')} message={error} severity="error" />

      {/* Source picker */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Chip size="small" label="From" sx={{ fontWeight: 700 }} />
          <SearchSelect
            value={sourceCollection}
            onChange={setSourceCollection}
            options={collections.map((c) => ({ value: c, label: c }))}
            label="Source table"
            width={240}
          />
          {previewData?.stepCounts !== undefined && sourceCollection && (
            <Typography variant="caption" color="text.secondary">
              {sampleMode ? `Working on a sample of ${sampleSize.toLocaleString()} rows` : 'Working on the full table'}
            </Typography>
          )}
        </Box>
      </Paper>

      {/* Step stack */}
      {sourceCollection && (
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
      )}

      {/* Inline Ask AI */}
      {sourceCollection && (
        <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#fafaff' }}>
          <AutoAwesomeIcon sx={{ color: '#7c3aed', fontSize: 20 }} />
          <TextField
            size="small"
            placeholder="Ask AI anything… (e.g. how do I join transactions with subledger? what's the sum of amount?)"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') askAIForStep(); }}
            sx={{ flex: 1 }}
          />
          <Button
            size="small"
            variant="contained"
            onClick={askAIForStep}
            disabled={!aiPrompt.trim()}
          >
            Ask AI
          </Button>
        </Paper>
      )}

      {/* Live preview */}
      {sourceCollection && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="subtitle2">Live preview</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {running && <CircularProgress size={14} />}
              {previewData && (
                <Typography variant="caption" color="text.secondary">
                  {previewData.data?.length || 0} rows shown · {previewData.executionTime}ms · drag a column header to reorder
                </Typography>
              )}
            </Box>
          </Box>
          {previewData?.data?.length > 0 ? (
            <DataTable
              data={previewData.data}
              columns={(previewData.columns || []).filter((c) => !isHiddenColumn(c))}
              columnOrder={columnOrder}
              onColumnOrderChange={setColumnOrder}
              filename={`${name || 'dataset'}-preview.csv`}
              enableExport
              defaultRowsPerPage={15}
            />
          ) : (
            <Typography variant="body2" color="text.secondary">No rows yet — pick a source and add steps.</Typography>
          )}
        </Paper>
      )}

      {/* Lineage */}
      {!isNew && lineage && lineage.questions?.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Used by {lineage.questions.length} question{lineage.questions.length === 1 ? '' : 's'}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {lineage.questions.map((q) => (
              <MuiLink key={q._id} href={`/question/${q._id}`} underline="hover">
                {q.name}
              </MuiLink>
            ))}
          </Box>
        </Paper>
      )}

      <AppToast open={!!previewMsg} onClose={() => setPreviewMsg('')} message={previewMsg} />

      {/* Pipeline dialog */}
      <Dialog open={pipelineDialog} onClose={() => setPipelineDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Compiled MongoDB pipeline</DialogTitle>
        <DialogContent>
          <pre style={{ fontFamily: 'monospace', fontSize: 12, background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 6 }}>
            {JSON.stringify(compiledPipeline, null, 2)}
          </pre>
        </DialogContent>
        <DialogActions><Button onClick={() => setPipelineDialog(false)}>Close</Button></DialogActions>
      </Dialog>
    </Box>
  );
}

