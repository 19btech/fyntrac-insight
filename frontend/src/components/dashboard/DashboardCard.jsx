import React, { useRef, useEffect, useState } from 'react';
import { Card, CardContent, Box, Typography, IconButton, Tooltip, CircularProgress, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import VerifiedIcon from '@mui/icons-material/Verified';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DownloadMenu from '../shared/DownloadMenu';
import AIInsightBadge from '../ai/AIInsightBadge';
import ChartRenderer from '../charts/ChartRenderer';
import TextCard from './TextCard';
import api from '../../hooks/useQuery';
import useFilterStore from '../../store/filterStore';
import { useNavigate } from 'react-router-dom';
import KpiTile from '../shared/KpiTile';

// Stable stagger delay per card so simultaneous refreshes spread over ~800 ms.
function cardStaggerMs(cardId) {
  if (!cardId) return 0;
  const hash = cardId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return (hash % 5) * 200;
}

export default function DashboardCard({ card, editMode, onDelete, refreshKey }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [downloadAnchor, setDownloadAnchor] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState(null);
  const [metric, setMetric] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const cardRef = useRef(null);
  const navigate = useNavigate();
  const filters = useFilterStore((s) => s.filters);
  const setFilter = useFilterStore((s) => s.setFilter);

  // P2: debounce cross-filter changes so cards don't all re-fetch on every keystroke.
  const [debouncedFilters, setDebouncedFilters] = useState(filters);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilters(filters), 150);
    return () => clearTimeout(t);
  }, [filters]);

  const handleDeleteCard = () => {
    setMenuAnchor(null);
    if (!onDelete) return;
    setRemoveConfirmOpen(true);
  };

  const confirmRemove = () => {
    setRemoveConfirmOpen(false);
    onDelete(card.i);
  };

  // B7: use destructured useEffect (not React.useEffect).
  // P4: cancelled flag prevents state updates after unmount / effect re-run.
  useEffect(() => {
    // KPI cards: fetch metric metadata + evaluate.
    if (card.type === 'metric') {
      let cancelled = false;
      setLoading(true);
      Promise.all([
        api.get(`/metrics/${card.metricId}`).then((r) => r.data).catch(() => null),
        api.post(`/metrics/${card.metricId}/evaluate`).then((r) => r.data).catch(() => ({ error: true })),
      ]).then(([m, ev]) => {
        if (cancelled) return;
        setMetric(m);
        setEvaluation(ev);
        setRefreshedAt(new Date());
        setLoading(false);
      });
      return () => { cancelled = true; };
    }
    if (card.type !== 'question') { setLoading(false); return; }

    let cancelled = false;
    // P5: stagger concurrent refreshes by a stable per-card delay.
    const delay = cardStaggerMs(card.i);
    const fetchQuestion = async () => {
      try {
        setLoading(true);
        const qRes = await api.get(`/questions/${card.questionId}`);
        if (cancelled) return;
        const q = qRes.data;
        setQuestion(q);
        const pipeline = q.queryConfig?.pipeline || [];

        // P2: use debounced filters to avoid re-fetching on every keystroke.
        const filterStages = Object.entries(debouncedFilters).map(([field, value]) => ({
          $match: { [field]: value },
        }));

        const runRes = await api.post('/query/run', {
          collection: q.queryConfig?.collection,
          // P1: cap rows at 10 000 — enough for any chart, protects against millions-row collections.
          pipeline: [...filterStages, ...pipeline, { $limit: 10000 }],
        });
        if (cancelled) return;
        setResults(runRes.data);
        setRefreshedAt(new Date());
      } catch {
        // no-op
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const timer = setTimeout(fetchQuestion, delay);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [card.questionId, card.metricId, card.type, card.i, debouncedFilters, refreshKey]);

  // KPI card render — modern shared KpiTile widget with sparkline + trend chip.
  if (card.type === 'metric') {
    return (
      <Box ref={cardRef} sx={{ height: '100%' }}>
        <KpiTile
          title={card.title || metric?.name || '…'}
          verified={!!metric?.verified}
          value={evaluation?.value}
          trendValue={evaluation?.trendValue}
          comparisonLabel={evaluation?.comparison}
          format={metric?.format}
          legacyFormat={metric?.displayFormat}
          prefix={metric?.prefix}
          suffix={metric?.suffix}
          direction={metric?.targets?.direction || 'higherBetter'}
          goal={metric?.targets?.value ? { value: Number(metric.targets.value) } : null}
          sparklineSeries={Array.isArray(evaluation?.trendSeries) ? evaluation.trendSeries : null}
          loading={loading}
          error={!!evaluation?.error}
          actions={
            <Tooltip title="More options">
              <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)}>
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          }
        />
        <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
          <MenuItem onClick={() => { window.dispatchEvent(new CustomEvent('fyntrac:open:metric', { detail: { id: card.metricId } })); setMenuAnchor(null); }}>
            <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
            <ListItemText>View KPI</ListItemText>
          </MenuItem>
          {editMode && onDelete && (
            <MenuItem onClick={handleDeleteCard}>
              <ListItemIcon><DeleteOutlineIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Remove card</ListItemText>
            </MenuItem>
          )}
        </Menu>
      </Box>
    );
  }

  if (card.type !== 'question') {
    return (
      <Card ref={cardRef} sx={{ height: '100%', position: 'relative' }}>
        {editMode && onDelete && (
          <Box sx={{ position: 'absolute', top: 4, right: 4, zIndex: 2 }}>
            <Tooltip title="More options">
              <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)}>
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
              <MenuItem onClick={handleDeleteCard}>
                <ListItemIcon><DeleteOutlineIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Remove card</ListItemText>
              </MenuItem>
            </Menu>
          </Box>
        )}
        <CardContent sx={{ height: '100%', p: 0, '&:last-child': { pb: 0 } }}>
          <TextCard text={card.text} variant={card.type} linkUrl={card.linkUrl} />
        </CardContent>
      </Card>
    );
  }

  const chartConfig = { ...question?.chartConfig, ...card.chartConfigOverride };

  // v60 drill-through click behavior wrapper
  const handleCardChartClick = (point) => {
    const cb = card.clickBehavior;
    if (!cb || !cb.type) return;
    if (cb.type === 'crossfilter' && cb.field) {
      setFilter(cb.field, point[cb.field] ?? point.value);
    } else if (cb.type === 'url' && cb.url) {
      const resolved = String(cb.url).replace(/\{\{(\w+)\}\}/g, (_, k) => point[k] ?? '');
      window.open(resolved, '_blank', 'noopener,noreferrer');
    } else if (cb.type === 'dashboard' && cb.dashboardId) {
      navigate(`/dashboard/${cb.dashboardId}`);
    } else if (cb.type === 'question' && cb.questionId) {
      window.dispatchEvent(new CustomEvent('fyntrac:open:report', { detail: { id: cb.questionId } }));
    }
  };

  return (
    <Card ref={cardRef} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Card header */}
      <Box
        sx={{
          display: 'flex', alignItems: 'center', px: 2, height: 40,
          borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0, gap: 0.5,
        }}
      >
        <Typography variant="body1" fontWeight={700} noWrap sx={{ flex: 1, fontSize: '0.8125rem' }}>
          {card.title || question?.name || '…'}
        </Typography>

        {/* Slice F — provenance chips */}
        {question?.verified && (
          <Tooltip title="Verified report"><VerifiedIcon sx={{ fontSize: 14, color: '#16a34a' }} /></Tooltip>
        )}
        {question?.queryConfig?.draftedByAI && (
          <Tooltip title="Drafted by AI"><AutoAwesomeIcon sx={{ fontSize: 14, color: '#7c3aed' }} /></Tooltip>
        )}
        {refreshedAt && (
          <Tooltip title={`Refreshed ${refreshedAt.toLocaleTimeString()}`}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              {fmtAgo(refreshedAt)}
            </Typography>
          </Tooltip>
        )}

        {results && <AIInsightBadge data={results.data} chartConfig={chartConfig} />}

        <Tooltip title="More options">
          <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)}>
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Card body */}
      <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <CircularProgress size={24} />
          </Box>
        ) : results ? (
          <ChartRenderer
            data={results.data}
            columns={results.columns}
            config={chartConfig}
            onPointClick={handleCardChartClick}
            compact
          />
        ) : (
          <Typography variant="body2" color="error" sx={{ p: 1 }}>Failed to load</Typography>
        )}
      </Box>

      {/* Overflow menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => { window.dispatchEvent(new CustomEvent('fyntrac:open:report', { detail: { id: card.questionId } })); setMenuAnchor(null); }}>
          <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
          <ListItemText>View Report</ListItemText>
        </MenuItem>
        <MenuItem onClick={(e) => { setDownloadAnchor(e.currentTarget); setMenuAnchor(null); }}>
          <ListItemIcon><FullscreenIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Download</ListItemText>
        </MenuItem>
        {editMode && onDelete && (
          <MenuItem onClick={handleDeleteCard}>
            <ListItemIcon><DeleteOutlineIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Remove card</ListItemText>
          </MenuItem>
        )}
      </Menu>

      <DownloadMenu
        anchorEl={downloadAnchor}
        onClose={() => setDownloadAnchor(null)}
        data={results?.data || []}
        cardRef={cardRef}
      />

      <Dialog open={removeConfirmOpen} onClose={() => setRemoveConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Remove card?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will remove the card from the dashboard. The underlying report is not affected.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={confirmRemove}>Remove</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

function fmtAgo(d) {
  const ms = Date.now() - d.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}
