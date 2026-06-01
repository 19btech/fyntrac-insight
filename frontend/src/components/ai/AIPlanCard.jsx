import React, { useState } from 'react';
import {
  Box, Typography, Paper, Stack, Chip, Button, Divider, Collapse, IconButton, Tooltip, CircularProgress,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SaveIcon from '@mui/icons-material/Save';
import CodeIcon from '@mui/icons-material/Code';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import AddToPhotosIcon from '@mui/icons-material/AddToPhotos';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
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
      <Paper
        elevation={0}
        sx={{
          p: 2, mb: 2,
          bgcolor: '#fff',
          border: '1px solid',
          borderColor: alpha('#6366f1', 0.2),
          borderRadius: 3,
          boxShadow: '0 1px 6px rgba(79,70,229,0.08)',
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CircularProgress size={18} sx={{ color: '#6366f1' }} />
          <Box>
            <Typography variant="caption" color="primary.main" fontWeight={600}>Drafting plan…</Typography>
            {prompt && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, fontSize: '0.8rem' }}>
                {prompt}
              </Typography>
            )}
          </Box>
        </Stack>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper
        elevation={0}
        sx={{
          p: 2, mb: 2,
          bgcolor: '#fff8f8',
          border: '1px solid',
          borderColor: '#fecaca',
          borderRadius: 3,
        }}
      >
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <ErrorOutlineIcon sx={{ fontSize: 18, color: 'error.main', mt: 0.1, flexShrink: 0 }} />
          <Box>
            <Typography variant="caption" color="error.main" fontWeight={600}>Couldn't draft a plan</Typography>
            <Typography variant="body2" sx={{ mt: 0.25, color: '#7f1d1d', fontSize: '0.85rem' }}>{error}</Typography>
          </Box>
        </Stack>
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
    <Paper
      elevation={0}
      sx={{
        mb: 2,
        bgcolor: '#fff',
        border: '1px solid',
        borderColor: alpha('#6366f1', 0.2),
        borderRadius: 3,
        overflow: 'hidden',
        boxShadow: '0 1px 8px rgba(79,70,229,0.08)',
      }}
    >
      {/* Plan header */}
      <Box
        sx={{
          px: 2, py: 1.25,
          background: 'linear-gradient(135deg, rgba(79,70,229,0.06) 0%, rgba(124,58,237,0.05) 100%)',
          borderBottom: '1px solid',
          borderColor: alpha('#6366f1', 0.12),
          display: 'flex', alignItems: 'center', gap: 0.75,
        }}
      >
        <AutoAwesomeIcon sx={{ fontSize: 15, color: '#6366f1' }} />
        <Typography variant="caption" sx={{ color: '#4f46e5', fontWeight: 700, letterSpacing: 0.3 }}>
          INSIGHT PLAN
        </Typography>
      </Box>

      <Box sx={{ px: 2, py: 1.5 }}>
        {/* Plan summary */}
        <Typography variant="body2" sx={{ lineHeight: 1.65, color: 'text.primary', mb: 1.5, fontSize: '0.875rem' }}>
          {plan.plan || plan.summary || 'No plan returned.'}
        </Typography>

        {/* Sources */}
        {sources.length > 0 && (
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.6rem', display: 'block', mb: 0.75 }}>
              Sources used
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {sources.map((s, i) => (
                <Tooltip key={i} title={s.kind || 'source'}>
                  <Chip
                    size="small"
                    label={`${s.kind === 'dataset' ? '◆' : s.kind === 'savedFilter' ? '⏱' : s.kind === 'kpi' ? '📊' : '▢'} ${s.name}`}
                    sx={{
                      fontSize: '0.72rem', height: 22, borderRadius: 1.5,
                      bgcolor: alpha('#6366f1', 0.07), color: '#4f46e5',
                      border: '1px solid', borderColor: alpha('#6366f1', 0.18),
                    }}
                  />
                </Tooltip>
              ))}
              {collection && !sources.some((s) => s.name === collection) && (
                <Chip size="small" label={collection} sx={{ fontSize: '0.72rem', height: 22, borderRadius: 1.5 }} />
              )}
              {chartType && (
                <Chip
                  size="small"
                  label={`as ${chartType}`}
                  sx={{
                    fontSize: '0.72rem', height: 22, borderRadius: 1.5,
                    bgcolor: alpha('#10b981', 0.08), color: '#059669',
                    border: '1px solid', borderColor: alpha('#10b981', 0.2),
                  }}
                />
              )}
            </Box>
          </Box>
        )}

        <Divider sx={{ mb: 1.5 }} />

        {/* Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {mode === 'dashboard' ? (
            <Button
              size="small" variant="contained"
              startIcon={<AddToPhotosIcon fontSize="small" />}
              onClick={() => {
                if (onInsertCard) onInsertCard(plan);
                else window.dispatchEvent(new CustomEvent('fyntrac:dashboard:insert-card', { detail: { plan } }));
              }}
              sx={{
                borderRadius: 2, fontWeight: 600, textTransform: 'none', fontSize: '0.8rem',
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
              }}
            >
              Insert as card
            </Button>
          ) : (
            <Button
              size="small" variant="contained"
              startIcon={<OpenInNewIcon fontSize="small" />}
              onClick={openAsReport}
              sx={{
                borderRadius: 2, fontWeight: 600, textTransform: 'none', fontSize: '0.8rem',
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
              }}
            >
              Open as Report
            </Button>
          )}
          <Button
            size="small" variant="outlined"
            startIcon={<SaveIcon fontSize="small" />}
            onClick={saveAsKpi}
            sx={{
              borderRadius: 2, fontWeight: 600, textTransform: 'none', fontSize: '0.8rem',
              borderColor: alpha('#6366f1', 0.35), color: '#4f46e5',
              '&:hover': { bgcolor: alpha('#6366f1', 0.06), borderColor: '#6366f1' },
            }}
          >
            Save as KPI
          </Button>
          <Box sx={{ flex: 1 }} />
          <Tooltip title={showPipeline ? 'Hide pipeline' : 'Show pipeline'}>
            <IconButton
              size="small"
              onClick={() => setShowPipeline((v) => !v)}
              sx={{
                color: showPipeline ? '#6366f1' : 'text.secondary',
                bgcolor: showPipeline ? alpha('#6366f1', 0.08) : 'transparent',
                borderRadius: 2,
              }}
            >
              <CodeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Pipeline collapse */}
        <Collapse in={showPipeline}>
          <Box
            sx={{
              mt: 1.5, p: 1.5,
              bgcolor: '#1e1e2e', color: '#cdd6f4',
              borderRadius: 2,
              fontFamily: 'monospace', fontSize: '0.72rem',
              maxHeight: 220, overflow: 'auto',
              whiteSpace: 'pre-wrap', lineHeight: 1.6,
            }}
          >
            {plan.pipeline ? JSON.stringify(plan.pipeline, null, 2)
              : builderState ? JSON.stringify(builderState, null, 2)
              : 'No structured pipeline available.'}
          </Box>
        </Collapse>
      </Box>
    </Paper>
  );
}
