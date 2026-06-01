import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, Stack,
  TextField, List, ListItemButton, ListItemText, Chip, CircularProgress, Tabs, Tab,
  FormControl, InputLabel, Select, MenuItem, IconButton, Tooltip,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import HighlightOffOutlinedIcon from '@mui/icons-material/HighlightOffOutlined';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import SpeedIcon from '@mui/icons-material/Speed';
import VerifiedIcon from '@mui/icons-material/Verified';
import SearchIcon from '@mui/icons-material/Search';
import api from '../../hooks/useQuery';
import { CHART_TYPES } from '../charts/ChartRenderer';

const DIALOG_PAPER_SX = {
  borderRadius: 4,
  border: '1px solid #dbe4f0',
  backgroundImage: 'linear-gradient(180deg, rgba(248,251,255,0.98) 0%, rgba(255,255,255,1) 36%)',
  boxShadow: '0 28px 64px rgba(15, 23, 42, 0.18)',
};

const TAB_SX = {
  minHeight: 42,
  borderRadius: 999,
  textTransform: 'none',
  fontWeight: 700,
  color: '#475569',
  '&.Mui-selected': {
    color: '#14213d',
  },
};

const ITEM_META = {
  0: {
    icon: <QuestionAnswerIcon fontSize="small" sx={{ color: '#2563eb' }} />,
    label: 'Reports',
    empty: 'No saved reports yet. Create a report first, then add it as a card.',
    search: 'Search reports…',
    helper: 'Choose an existing report and optionally override its chart layout for this dashboard only.',
    footprint: '6 x 4 grid card',
  },
  1: {
    icon: <SpeedIcon fontSize="small" sx={{ color: '#d97706' }} />,
    label: 'KPIs',
    empty: 'No KPIs yet. Define a KPI first, then add it as a card.',
    search: 'Search KPIs…',
    helper: 'KPI cards stay compact by default so you can fit more signal into the dashboard.',
    footprint: '3 x 3 grid card',
  },
};

/**
 * Picks an existing saved Report (question) or KPI (metric) to add as a card
 * on the dashboard. For reports, lets the user override the chart type used
 * for this card without mutating the underlying report.
 */
export default function AddCardDialog({ open, onClose, onAdd }) {
  const [tab, setTab] = useState(0); // 0 = Reports, 1 = KPIs
  const [questions, setQuestions] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [chartTypeOverride, setChartTypeOverride] = useState(''); // '' = use report's saved type
  const [cardTitle, setCardTitle] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelectedId(null);
    setFilter('');
    setChartTypeOverride('');
    setCardTitle('');
    Promise.all([
      api.get('/questions').then((r) => r.data || []).catch(() => []),
      api.get('/metrics').then((r) => r.data || []).catch(() => []),
    ])
      .then(([qs, ms]) => { setQuestions(qs); setMetrics(ms); })
      .finally(() => setLoading(false));
  }, [open]);

  // Reset selection when switching tabs so we don't carry an id across kinds.
  useEffect(() => {
    setSelectedId(null);
    setChartTypeOverride('');
    setCardTitle('');
  }, [tab]);

  const items = tab === 0 ? questions : metrics;
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => (it.name || '').toLowerCase().includes(q));
  }, [items, filter]);

  const selectedQuestion = tab === 0 ? questions.find((x) => x._id === selectedId) : null;
  const selectedMetric = tab === 1 ? metrics.find((x) => x._id === selectedId) : null;

  const add = () => {
    if (!selectedId) return;
    if (tab === 0) {
      const q = questions.find((x) => x._id === selectedId);
      if (!q) return;
      const card = {
        i: `c_${Date.now()}`,
        questionId: q._id,
        type: 'question',
        x: 0, y: 0, w: 6, h: 4,
        ...(cardTitle && cardTitle !== q.name ? { title: cardTitle } : {}),
      };
      // Only attach an override when the user explicitly picked a different
      // chart type so the report's own default keeps working everywhere else.
      if (chartTypeOverride && chartTypeOverride !== (q.chartConfig?.chartType || 'table')) {
        card.chartConfigOverride = { chartType: chartTypeOverride };
      }
      onAdd(card);
    } else {
      const m = metrics.find((x) => x._id === selectedId);
      if (!m) return;
      onAdd({
        i: `c_${Date.now()}`,
        metricId: m._id,
        type: 'metric',
        // KPI cards are compact by default — single number plus label/trend.
        x: 0, y: 0, w: 3, h: 3,
        ...(cardTitle && cardTitle !== m.name ? { title: cardTitle } : {}),
      });
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
      PaperProps={{
        sx: {
          borderRadius: 4,
          boxShadow: '0 32px 64px rgba(0,0,0,0.14)',
          overflow: 'hidden',
          border: '1px solid',
          borderColor: 'divider',
        },
      }}
    >
      <DialogTitle sx={{ p: 0 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            px: 3,
            pt: 3,
            pb: 2.5,
            background: 'linear-gradient(135deg, rgba(30,64,175,0.05) 0%, rgba(99,102,241,0.04) 100%)',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <img src="/fyntrac9.png" alt="Fyntrac" style={{ width: 72, height: 'auto' }} />
            <Box>
              <Chip
                label="Dashboard"
                size="small"
                sx={{
                  height: 18, fontSize: '0.6rem', fontWeight: 700, letterSpacing: 0.8,
                  textTransform: 'uppercase', bgcolor: alpha('#3f51b5', 0.1),
                  color: '#3f51b5', mb: 0.5, borderRadius: 1,
                }}
              />
              <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2, color: 'text.primary' }}>
                Add Dashboard Card
              </Typography>
            </Box>
          </Box>
          <Tooltip title="Close" placement="left">
            <IconButton
              onClick={onClose}
              size="small"
              sx={{
                color: 'text.secondary', bgcolor: 'action.hover', borderRadius: 2,
                '&:hover': { bgcolor: 'error.50', color: 'error.main' },
              }}
            >
              <HighlightOffOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab icon={<QuestionAnswerIcon fontSize="small" />} iconPosition="start" label="Reports" />
          <Tab icon={<SpeedIcon fontSize="small" />} iconPosition="start" label="KPIs" />
        </Tabs>

        <Stack spacing={2}>
          <TextField
            size="small"
            fullWidth
            autoFocus
            placeholder={tab === 0 ? 'Search reports…' : 'Search KPIs…'}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            slotProps={{ input: { startAdornment: <SearchIcon sx={{ color: '#94a3b8', mr: 1 }} /> } }}
          />

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
              <CircularProgress size={24} />
            </Box>
          ) : filtered.length === 0 ? (
            <Box sx={{ p: 3, border: '1px dashed #e2e8f0', borderRadius: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {items.length === 0
                  ? (tab === 0 ? 'No saved reports yet. Create a report first.' : 'No KPIs yet. Define a KPI first.')
                  : `No ${tab === 0 ? 'reports' : 'KPIs'} match your search.`}
              </Typography>
            </Box>
          ) : (
            <List disablePadding sx={{ maxHeight: 320, overflow: 'auto' }}>
              {filtered.map((it) => {
                const isSelected = selectedId === it._id;
                return (
                  <ListItemButton
                    key={it._id}
                    selected={isSelected}
                    onClick={() => {
                      setSelectedId(it._id);
                      setCardTitle(it.name || '');
                      if (tab === 0) setChartTypeOverride(it.chartConfig?.chartType || 'table');
                    }}
                    sx={{ borderRadius: 1.5, mb: 0.5 }}
                  >
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          {tab === 0
                            ? <QuestionAnswerIcon fontSize="small" sx={{ color: '#2563eb' }} />
                            : <SpeedIcon fontSize="small" sx={{ color: '#d97706' }} />}
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{it.name}</Typography>
                          {it.verified && <VerifiedIcon sx={{ fontSize: 14, color: '#16a34a' }} />}
                        </Stack>
                      }
                      secondary={
                        <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                          {tab === 0 && it.chartConfig?.chartType && (
                            <Chip size="small" label={it.chartConfig.chartType} sx={{ height: 20, fontSize: '0.68rem' }} />
                          )}
                          {tab === 1 && it.collection && (
                            <Chip
                              size="small"
                              label={
                                it.source && it.source.kind && it.source.kind !== 'collection'
                                  ? `${it.source.kind === 'dataset' ? 'Dataset' : 'Report'}: ${it.source.name || it.collection}`
                                  : it.collection
                              }
                              sx={{ height: 20, fontSize: '0.68rem' }}
                            />
                          )}
                          <Typography variant="caption" color="text.secondary">
                            {it.updatedAt ? new Date(it.updatedAt).toLocaleDateString() : '—'}
                          </Typography>
                        </Stack>
                      }
                    />
                  </ListItemButton>
                );
              })}
            </List>
          )}

          {selectedQuestion && (
            <FormControl size="small" fullWidth>
              <InputLabel>Chart layout override (this card only)</InputLabel>
              <Select
                label="Chart layout override (this card only)"
                value={chartTypeOverride || (selectedQuestion.chartConfig?.chartType || 'table')}
                onChange={(e) => setChartTypeOverride(e.target.value)}
              >
                {CHART_TYPES.map((t) => (
                  <MenuItem key={t.key} value={t.key}>{t.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {selectedId && (
            <TextField
              size="small"
              fullWidth
              label="Card title"
              value={cardTitle}
              onChange={(e) => setCardTitle(e.target.value)}
              helperText="Rename this card on the dashboard (leave unchanged to use the default name)"
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={add} disabled={!selectedId}>Add card</Button>
      </DialogActions>
    </Dialog>
  );
}
