import React, { useState } from 'react';
import {
  Box, Typography, Paper, Stack, Chip, Button, Divider, Collapse, IconButton, Tooltip, CircularProgress,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SaveIcon from '@mui/icons-material/Save';
import CodeIcon from '@mui/icons-material/Code';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useNavigate } from 'react-router-dom';

/**
 * Render a structured plan returned by /api/ai/plan as named slots:
 *   - Plan (one sentence)
 *   - Sources used (chips)
 *   - Actions (Open as Report, Save as KPI, Show pipeline)
 *
 * No more parsing markdown code fences in the UI.
 */
export default function AIPlanCard({ prompt, plan, loading, error, onRefine, mode, onInsertCard }) {
  const [showPipeline, setShowPipeline] = useState(false);
  const navigate = useNavigate();

  if (loading) {
    return (
      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <CircularProgress size={14} />
          <Typography variant="caption" color="text.secondary">Drafting plan…</Typography>
        </Stack>
        {prompt && <Typography variant="body2" sx={{ mt: 1 }}>{prompt}</Typography>}
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, borderColor: 'error.light' }}>
        <Typography variant="caption" color="error">Couldn't draft a plan</Typography>
        <Typography variant="body2" sx={{ mt: 0.5 }}>{error}</Typography>
      </Paper>
    );
  }
  if (!plan) return null;

  const sources = Array.isArray(plan.sources) ? plan.sources : [];
  const builderState = plan.builderState || null;
  const collection = plan.collection || builderState?.collection || '';
  const chartType = plan.chartType || 'table';

  const openAsReport = () => {
    const params = new URLSearchParams();
    if (collection) params.set('collection', collection);
    if (plan.pipeline?.length) params.set('pipeline', encodeURIComponent(JSON.stringify(plan.pipeline)));
    if (chartType) params.set('chart', chartType);
    if (builderState) {
      try { sessionStorage.setItem('fyntrac_ai_plan', JSON.stringify({ builderState, chartType, collection, format: plan.format })); }
      catch { /* noop */ }
      params.set('seed', 'ai');
    }
    navigate(`/question/new?${params.toString()}`);
  };

  const saveAsKpi = () => {
    try { sessionStorage.setItem('fyntrac_ai_kpi', JSON.stringify({ plan })); } catch { /* noop */ }
    navigate('/metrics?aiDraft=1');
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
        <AutoAwesomeIcon color="primary" sx={{ fontSize: 16 }} />
        <Typography variant="caption" color="primary.main" fontWeight={600}>Plan</Typography>
      </Stack>
      <Typography variant="body2" sx={{ mb: 1.25 }}>
        {plan.plan || plan.summary || 'No plan returned.'}
      </Typography>

      {sources.length > 0 && (
        <Box sx={{ mb: 1.25 }}>
          <Typography variant="caption" color="text.secondary">Sources</Typography>
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
            {sources.map((s, i) => (
              <Tooltip key={i} title={s.kind || 'source'}>
                <Chip size="small" variant="outlined"
                  label={`${s.kind === 'dataset' ? '◆' : s.kind === 'savedFilter' ? '⏱' : s.kind === 'kpi' ? '📊' : '▢'} ${s.name}`}
                  sx={{ fontSize: '0.72rem', height: 22 }} />
              </Tooltip>
            ))}
            {collection && !sources.some(s => s.name === collection) && (
              <Chip size="small" label={collection} sx={{ fontSize: '0.72rem', height: 22 }} />
            )}
            {chartType && (
              <Chip size="small" color="primary" label={`as ${chartType}`} sx={{ fontSize: '0.72rem', height: 22 }} />
            )}
          </Stack>
        </Box>
      )}

      <Divider sx={{ my: 1 }} />

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        {mode === 'dashboard' ? (
          <Button size="small" variant="contained" startIcon={<OpenInNewIcon />}
            onClick={() => {
              if (onInsertCard) onInsertCard(plan);
              else window.dispatchEvent(new CustomEvent('fyntrac:dashboard:insert-card', { detail: { plan } }));
            }}>
            Insert as card
          </Button>
        ) : (
          <Button size="small" variant="contained" startIcon={<OpenInNewIcon />} onClick={openAsReport}>
            Open as Report
          </Button>
        )}
        <Button size="small" variant="outlined" startIcon={<SaveIcon />} onClick={saveAsKpi}>
          Save as KPI
        </Button>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={showPipeline ? 'Hide pipeline' : 'Show pipeline'}>
          <IconButton size="small" onClick={() => setShowPipeline((v) => !v)}>
            <CodeIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      <Collapse in={showPipeline}>
        <Box sx={{
          mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1,
          fontFamily: 'monospace', fontSize: '0.72rem', maxHeight: 200, overflow: 'auto',
          whiteSpace: 'pre-wrap',
        }}>
          {plan.pipeline ? JSON.stringify(plan.pipeline, null, 2)
            : builderState ? JSON.stringify(builderState, null, 2)
            : 'No structured pipeline available.'}
        </Box>
      </Collapse>
    </Paper>
  );
}
