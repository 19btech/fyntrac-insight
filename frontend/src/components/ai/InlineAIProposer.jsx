import React, { useState } from 'react';
import {
  Box, TextField, IconButton, Stack, Typography, Paper, Chip, Button, CircularProgress, Tooltip, Collapse, Alert,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SendIcon from '@mui/icons-material/Send';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import api from '../../hooks/useQuery';

const SUGGEST = [
  'Add a filter for the last 90 days',
  'Group by month',
  'Top 10 by total amount',
  'Compare actual vs budget',
];

/**
 * Inline AI co-pilot — sits ABOVE the step stack inside the editor (not in a
 * drawer). Lets the user describe a step in plain English; AI returns a
 * proposed builderState patch the user accepts or rejects.
 */
export default function InlineAIProposer({ collection, datasetName, builderState, onApply }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState(null);
  const [error, setError] = useState('');

  const ask = async (q) => {
    const text = (q ?? prompt).trim();
    if (!text) return;
    setLoading(true);
    setError('');
    setProposal(null);
    try {
      const res = await api.post('/ai/plan', {
        prompt: text,
        intent: 'report-step',
        currentContext: { collection, datasetName, builderState },
      });
      setProposal({ ...res.data, prompt: text });
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const accept = () => {
    if (!proposal) return;
    const merged = mergeBuilderState(builderState || {}, proposal.builderState || {});
    onApply?.({ builderState: merged, chartType: proposal.chartType, plan: proposal.plan });
    setPrompt('');
    setProposal(null);
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5, borderColor: 'primary.light', bgcolor: '#fafaff' }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <AutoAwesomeIcon sx={{ color: '#7c3aed', fontSize: 20 }} />
        <TextField
          fullWidth
          size="small"
          placeholder={collection
            ? `Tell AI what to add — e.g. "filter to North America and group by month"`
            : 'Pick a source above first…'}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
          disabled={!collection || loading}
          variant="outlined"
        />
        <Tooltip title="Propose a step">
          <span>
            <IconButton color="primary" onClick={() => ask()} disabled={!collection || loading || !prompt.trim()}>
              {loading ? <CircularProgress size={18} /> : <SendIcon />}
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {!proposal && !loading && (
        <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap' }}>
          {SUGGEST.map((s) => (
            <Chip key={s} label={s} size="small" variant="outlined" onClick={() => ask(s)} sx={{ cursor: 'pointer' }} disabled={!collection} />
          ))}
        </Stack>
      )}

      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}

      <Collapse in={!!proposal}>
        {proposal && (
          <Box sx={{ mt: 1.25, p: 1.25, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Chip size="small" label="Proposed" color="primary" />
              <Typography variant="body2" sx={{ flex: 1 }}>{proposal.plan || 'Apply these changes?'}</Typography>
              <Button size="small" startIcon={<CloseIcon />} onClick={() => setProposal(null)}>Reject</Button>
              <Button size="small" variant="contained" startIcon={<CheckIcon />} onClick={accept}>Accept</Button>
            </Stack>
            {proposal.builderState && <ProposalSummary patch={proposal.builderState} />}
          </Box>
        )}
      </Collapse>
    </Paper>
  );
}

function ProposalSummary({ patch }) {
  const items = [];
  if (patch.filters?.length) items.push(`${patch.filters.length} filter${patch.filters.length > 1 ? 's' : ''}`);
  if (patch.groupBys?.filter(Boolean).length) items.push(`group by ${patch.groupBys.filter(Boolean).join(', ')}`);
  if (patch.metrics?.length) items.push(`${patch.metrics.length} metric${patch.metrics.length > 1 ? 's' : ''}`);
  if (patch.sortField) items.push(`sort by ${patch.sortField}`);
  if (patch.limit) items.push(`limit ${patch.limit}`);
  if (!items.length) return null;
  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap">
      {items.map((it) => <Chip key={it} size="small" label={it} variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />)}
    </Stack>
  );
}

/** Shallow-merge a proposed builderState patch onto the current one. */
function mergeBuilderState(current, patch) {
  const out = { ...current };
  if (patch.filters !== undefined) out.filters = patch.filters;
  if (patch.groupBys !== undefined) out.groupBys = patch.groupBys;
  if (patch.metrics !== undefined) out.metrics = patch.metrics;
  if (patch.sortField !== undefined) out.sortField = patch.sortField;
  if (patch.sortDir !== undefined) out.sortDir = patch.sortDir;
  if (patch.limit !== undefined) out.limit = patch.limit;
  return out;
}
