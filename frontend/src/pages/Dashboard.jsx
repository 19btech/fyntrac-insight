import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Button, Skeleton, IconButton, Tooltip, Select, MenuItem, Stack, TextField, Divider,
  Card, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  Snackbar, Alert,
} from '@mui/material';
import GridViewIcon from '@mui/icons-material/GridView';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ShareIcon from '@mui/icons-material/Share';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import useDashboard from '../hooks/useDashboard';
import DashboardGrid from '../components/dashboard/DashboardGrid';
import DashboardSections from '../components/dashboard/DashboardSections';
import DashboardFilters from '../components/dashboard/DashboardFilters';
import DashboardTabs from '../components/dashboard/DashboardTabs';
import ActiveFiltersStrip from '../components/dashboard/ActiveFiltersStrip';
import DashboardInfoSidebar from '../components/dashboard/DashboardInfoSidebar';
import AddCardDialog from '../components/dashboard/AddCardDialog';
import AIChatDrawer from '../components/ai/AIChatDrawer';
import ShareModal from '../components/shared/ShareModal';
import useFilterStore from '../store/filterStore';
import api from '../hooks/useQuery';

const REFRESH_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '1 min', value: 60 },
  { label: '5 min', value: 300 },
  { label: '10 min', value: 600 },
  { label: '30 min', value: 1800 },
  { label: '1 hour', value: 3600 },
];

const ICON_BTN_SX = {
  width: 32,
  height: 32,
  borderRadius: 1.5,
  color: '#94a3b8',
  '&:hover': { bgcolor: '#f1f5f9', color: '#334155' },
};

const SEP_SX = { height: 18, alignSelf: 'center', borderColor: '#e2e8f0', mx: 0.5 };

export default function DashboardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [editMode, setEditMode] = useState(searchParams.get('edit') === '1');
  const [shareOpen, setShareOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(null);
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [headerOpen, setHeaderOpen] = useState(true);
  const [sources, setSources] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  // P5: refreshTick drives card data refetches on auto-refresh.
  const [refreshTick, setRefreshTick] = useState(0);
  const { dashboard, setDashboard, loading, fetchError, save, refresh, isNew } = useDashboard(id);
  const resetFilters = useFilterStore((s) => s.reset);

  // For a brand-new dashboard, start immediately in edit mode
  useEffect(() => {
    if (isNew) setEditMode(true);
  }, [isNew]);

  const restoreVersion = useCallback(async (idx) => {
    await api.post(`/dashboards/${id}/restore/${idx}`);
    refresh();
    setInfoOpen(false);
  }, [id, refresh]);

  // P5: auto-refresh — bump both dashboard metadata and card data tick.
  useEffect(() => {
    if (!refreshInterval) return;
    const timer = setInterval(() => {
      refresh();
      setRefreshTick((t) => t + 1);
    }, refreshInterval * 1000);
    return () => clearInterval(timer);
  }, [refreshInterval, refresh]);

  // Reset filters when dashboard changes
  useEffect(() => resetFilters(), [id, resetFilters]);

  // Slice A — fetch dashboard sources for AI grounding + provenance.
  // B4: guard against id==='new' (unsaved dashboards have no backend record yet).
  useEffect(() => {
    if (!id || id === 'new') return;
    api.get(`/dashboards/${id}/sources`).then((r) => setSources(r.data)).catch(() => {});
  }, [id]);

  // Slice D — auto-open AI drawer when arriving from chooser with intent=ai
  useEffect(() => {
    try {
      const seed = JSON.parse(sessionStorage.getItem('fyntrac_ai_open') || 'null');
      if (seed && seed.dashboardId === id) {
        setAiOpen(true);
        sessionStorage.removeItem('fyntrac_ai_open');
      }
    } catch { /* noop */ }
  }, [id]);

  // Slice D — listen for plan card "Insert as card" events
  useEffect(() => {
    const handler = async (e) => {
      const plan = e.detail?.plan;
      if (!plan || !dashboard) return;
      // Create a Question first, then add a card referencing it
      const qPayload = {
        name: plan.plan?.slice(0, 60) || 'AI card',
        type: plan.builderState ? 'builder' : 'native',
        queryConfig: {
          collection: plan.collection,
          pipeline: plan.pipeline || [],
          ...(plan.builderState ? { builderState: plan.builderState } : {}),
          draftedByAI: true,
        },
        chartConfig: { chartType: plan.chartType || 'table' },
      };
      try {
        const qRes = await api.post('/questions', qPayload);
        const newCard = {
          i: `c_${Date.now()}`,
          questionId: qRes.data._id,
          type: 'question',
          x: 0, y: 0, w: 6, h: 4,
        };
        const existingLayout = dashboard.layout || [];
        const maxY = existingLayout.reduce((m, l) => Math.max(m, (l.y || 0) + (l.h || 4)), 0);
        const next = {
          ...dashboard,
          cards: [...(dashboard.cards || []), newCard],
          layout: [...existingLayout, { i: newCard.i, x: 0, y: maxY, w: 6, h: 4 }],
        };
        setDashboard(next);
        // B5: don't try to PUT before the dashboard exists in the backend.
        if (!isNew) await save(next);
      } catch { /* noop */ }
    };
    window.addEventListener('fyntrac:dashboard:insert-card', handler);
    return () => window.removeEventListener('fyntrac:dashboard:insert-card', handler);
  }, [dashboard, setDashboard, save]);

  const addCard = (card) => {
    if (!dashboard) return;
    // Compute a safe Y for the new card so it lands below existing items.
    const existingLayout = dashboard.layout || [];
    const maxY = existingLayout.reduce((m, l) => Math.max(m, (l.y || 0) + (l.h || 4)), 0);
    const layoutEntry = {
      i: card.i,
      x: card.x ?? 0,
      y: card.y != null ? card.y : maxY,
      w: card.w ?? 6,
      h: card.h ?? 4,
    };
    const next = {
      ...dashboard,
      cards: [...(dashboard.cards || []), card],
      layout: [...existingLayout, layoutEntry],
    };
    setDashboard(next);
    if (!isNew) save(next); // don't auto-save for unsaved new dashboards
  };

  // P6: debounce layout saves so rapid drag/resize bursts don't flood the API.
  const saveLayoutTimer = useRef(null);
  const pendingLayoutRef = useRef(null);
  const saveLayout = useCallback((newLayout) => {
    if (isNew) return;
    // Update local state immediately for smooth UI.
    setDashboard((prev) => (prev ? { ...prev, layout: newLayout } : prev));
    // Debounce the API call.
    pendingLayoutRef.current = newLayout;
    if (saveLayoutTimer.current) clearTimeout(saveLayoutTimer.current);
    saveLayoutTimer.current = setTimeout(() => {
      setDashboard((prev) => {
        if (!prev) return prev;
        save({ ...prev, layout: pendingLayoutRef.current ?? newLayout });
        return prev;
      });
    }, 400);
  }, [isNew, save, setDashboard]);

  const deleteCard = (cardId) => {
    if (!dashboard || !cardId) return;
    const filterCards = (arr) => (arr || []).filter((c) => c.i !== cardId);
    const filterLayout = (arr) => (arr || []).filter((l) => l.i !== cardId);
    const next = {
      ...dashboard,
      cards: filterCards(dashboard.cards),
      layout: filterLayout(dashboard.layout),
      tabs: dashboard.tabs?.length
        ? dashboard.tabs.map((t) => ({
            ...t,
            cards: filterCards(t.cards),
            layout: filterLayout(t.layout),
          }))
        : dashboard.tabs,
    };
    setDashboard(next);
    if (!isNew) save(next);
  };

  const handleDelete = () => {
    if (!dashboard) return;
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    setDeleteConfirmOpen(false);
    try {
      await api.delete(`/dashboards/${id}`);
      navigate('/dashboards');
    } catch (e) {
      setDeleteError('Delete failed: ' + (e.response?.data?.error || e.message));
    }
  };

  const handleSave = useCallback(async () => {
    if (isNew) {
      // First explicit save: create the dashboard in the backend
      const res = await api.post('/dashboards', dashboard);
      navigate(`/dashboard/${res.data._id}`, { replace: true });
    } else {
      await save(dashboard);
      setEditMode(false);
      setSaveSuccessMsg('Dashboard saved successfully');
      setTimeout(() => setSaveSuccessMsg(''), 2500);
    }
  }, [dashboard, isNew, save, navigate]);

  const handleDiscard = useCallback(async () => {
    if (isNew) {
      navigate('/dashboards');
    } else {
      setEditMode(false);
    }
  }, [isNew, navigate]);

  if (loading) {
    return (
      <Box>
        <Skeleton height={40} width={300} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={400} />
      </Box>
    );
  }

  if (!dashboard) {
    return <Typography color="error">{fetchError || 'Dashboard not found.'}</Typography>;
  }

  const refreshLabel = REFRESH_OPTIONS.find((option) => option.value === refreshInterval)?.label || 'Off';
  const cardCount = dashboard.cards?.length || 0;

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 3,
          pb: 2,
          borderBottom: '1px solid #e2e8f0',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        {/* Left: title + quiet meta line */}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          {editMode ? (
            <TextField
              size="small"
              label="Dashboard name"
              value={dashboard.name}
              onChange={(e) => setDashboard({ ...dashboard, name: e.target.value })}
              placeholder="Untitled Dashboard"
              sx={{ maxWidth: 400, mb: 0.25 }}
            />
          ) : (
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
              {dashboard.name}
            </Typography>
          )}
          <Typography variant="caption" sx={{ color: '#94a3b8', mt: 0.5, display: 'block' }}>
            {cardCount} {cardCount === 1 ? 'card' : 'cards'}
            {refreshInterval > 0 && ` · Refreshes every ${refreshLabel}`}
            {dashboard.description && ` · ${dashboard.description}`}
          </Typography>
        </Box>

        {/* Right: flat action row */}
        <Stack direction="row" alignItems="center" spacing={0.5}>
          {headerOpen && (<>
          {/* Minimal refresh select */}
          <Select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(e.target.value)}
            variant="standard"
            disableUnderline
            renderValue={(v) => (
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <RefreshIcon sx={{ fontSize: 13, color: v > 0 ? '#3b82f6' : '#94a3b8' }} />
                <Typography variant="caption" sx={{ fontWeight: 600, color: v > 0 ? '#3b82f6' : '#94a3b8' }}>
                  {REFRESH_OPTIONS.find((o) => o.value === v)?.label}
                </Typography>
              </Stack>
            )}
            sx={{ '& .MuiSelect-select': { py: 0, pr: '20px !important', pl: 0 } }}
          >
            {REFRESH_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </Select>

          <Divider orientation="vertical" flexItem sx={SEP_SX} />

          <Tooltip title="Refresh now">
            <IconButton onClick={refresh} size="small" sx={ICON_BTN_SX}>
              <RefreshIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Details">
            <IconButton onClick={() => setInfoOpen(true)} size="small" sx={ICON_BTN_SX}>
              <InfoOutlinedIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Share">
            <IconButton onClick={() => setShareOpen(true)} size="small" sx={ICON_BTN_SX}>
              <ShareIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Ask AI">
            <IconButton
              onClick={() => setAiOpen(true)}
              size="small"
              sx={{ ...ICON_BTN_SX, '&:hover': { color: '#7c3aed', bgcolor: '#f5f3ff' } }}
            >
              <AutoAwesomeIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>

          {editMode && (
            <>
              <Divider orientation="vertical" flexItem sx={SEP_SX} />
              <Button
                startIcon={<AddIcon />}
                size="small"
                onClick={() => setAddCardOpen(true)}
                sx={{
                  bgcolor: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0',
                  borderRadius: 2, textTransform: 'none', fontWeight: 600, boxShadow: 'none',
                  '&:hover': { bgcolor: '#e2e8f0', boxShadow: 'none' },
                }}
              >
                Add card
              </Button>
            </>
          )}

          <Divider orientation="vertical" flexItem sx={SEP_SX} />

          {editMode ? (
            <>
              <Button
                size="small"
                onClick={handleDiscard}
                sx={{
                  bgcolor: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0',
                  borderRadius: 2, textTransform: 'none', fontWeight: 600, boxShadow: 'none',
                  '&:hover': { bgcolor: '#e2e8f0', boxShadow: 'none' },
                }}
              >
                Discard
              </Button>
              <Button
                startIcon={<SaveIcon />}
                size="small"
                variant="contained"
                onClick={handleSave}
                sx={{
                  px: 2, borderRadius: 2, fontWeight: 700, textTransform: 'none',
                  bgcolor: '#14213d', boxShadow: 'none',
                  '&:hover': { bgcolor: '#0a1628', boxShadow: 'none' },
                }}
              >
                Save
              </Button>
              <Tooltip title="Delete dashboard">
                <IconButton
                  onClick={handleDelete}
                  size="small"
                  sx={{ ...ICON_BTN_SX, ml: 0.25, '&:hover': { color: '#dc2626', bgcolor: '#fef2f2' } }}
                >
                  <DeleteOutlineIcon sx={{ fontSize: 17 }} />
                </IconButton>
              </Tooltip>
            </>
          ) : (
            <Tooltip title="Edit dashboard">
              <IconButton onClick={() => setEditMode(true)} size="small" sx={ICON_BTN_SX}>
                <EditIcon sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>
          )}
          </>)}
          <Divider orientation="vertical" flexItem sx={SEP_SX} />
          <Tooltip title={headerOpen ? 'Collapse toolbar' : 'Expand toolbar'}>
            <IconButton onClick={() => setHeaderOpen((o) => !o)} size="small" sx={ICON_BTN_SX}>
              {headerOpen ? <ExpandLessIcon sx={{ fontSize: 17 }} /> : <ExpandMoreIcon sx={{ fontSize: 17 }} />}
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {/* Filters */}
      {dashboard.filters?.length > 0 && (
        <DashboardFilters filters={dashboard.filters} />
      )}

      {/* Active cross-filters strip (from chart clicks) */}
      <ActiveFiltersStrip />

      {/* Tabs (v60) */}
      {dashboard.tabs?.length > 0 && (
        <DashboardTabs
          tabs={dashboard.tabs}
          activeTab={activeTab || dashboard.tabs[0].id}
          onChange={setActiveTab}
        />
      )}

      {/* Grid or Sections — or empty state */}
      {cardCount === 0 ? (
        <Card variant="outlined" sx={{ p: 6, textAlign: 'center', mt: 2, borderStyle: 'dashed' }}>
          <GridViewIcon sx={{ fontSize: 52, color: 'text.disabled', mb: 1 }} />
          <Typography variant="h4" sx={{ mb: 0.75 }}>No cards yet</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            Add your first card to start building this dashboard.
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => { setEditMode(true); setAddCardOpen(true); }}
            sx={{
              bgcolor: '#14213d', borderRadius: 2, px: 3, fontWeight: 700,
              textTransform: 'none', boxShadow: 'none',
              '&:hover': { bgcolor: '#0a1628', boxShadow: 'none' },
            }}
          >
            Add your first card
          </Button>
        </Card>
      ) : dashboard.layoutMode === 'sections' ? (
        <DashboardSections
          sections={dashboard.sections || []}
          cards={dashboard.cards || []}
          dashboardId={id}
          editMode={editMode}
          onDeleteCard={deleteCard}
          onLayoutChange={saveLayout}
          refreshKey={refreshTick}
        />
      ) : (
        <DashboardGrid
          layout={
            dashboard.tabs?.length
              ? dashboard.tabs.find((t) => t.id === (activeTab || dashboard.tabs[0].id))?.layout
              : dashboard.layout
          }
          cards={
            dashboard.tabs?.length
              ? dashboard.tabs.find((t) => t.id === (activeTab || dashboard.tabs[0].id))?.cards || []
              : dashboard.cards
          }
          editMode={editMode}
          dashboardId={id}
          onDeleteCard={deleteCard}
          onLayoutChange={saveLayout}
          refreshKey={refreshTick}
        />
      )}

      <AddCardDialog open={addCardOpen} onClose={() => setAddCardOpen(false)} onAdd={addCard} />

      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete dashboard?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <strong>{dashboard?.name}</strong> will be moved to Trash. You can restore it from there.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            onClick={() => setDeleteConfirmOpen(false)}
            sx={{
              borderRadius: 2, textTransform: 'none', fontWeight: 600, boxShadow: 'none',
              color: '#475569', bgcolor: '#f8fafc', border: '1px solid #e2e8f0',
              '&:hover': { bgcolor: '#e2e8f0', boxShadow: 'none' },
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={confirmDelete}
            sx={{
              borderRadius: 2, textTransform: 'none', fontWeight: 700, boxShadow: 'none',
              bgcolor: '#dc2626', color: '#fff',
              '&:hover': { bgcolor: '#b91c1c', boxShadow: 'none' },
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <AIChatDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        context={{
          mode: 'dashboard',
          dashboardId: id,
          dashboardName: dashboard.name,
          sources,
        }}
      />

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} dashboardId={id} />
      <DashboardInfoSidebar
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        dashboard={dashboard}
        onChange={(d) => save(d)}
        onRestore={restoreVersion}
      />

      {/* B6: MUI Snackbar replaces window.alert for delete errors */}
      <Snackbar
        open={!!saveSuccessMsg}
        autoHideDuration={2500}
        onClose={() => setSaveSuccessMsg('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" icon={false} onClose={() => setSaveSuccessMsg('')}
          sx={{ bgcolor: '#dcfce7', color: '#166534', fontWeight: 600, border: '1px solid #bbf7d0', '& .MuiAlert-action': { color: '#166534' } }}>
          {saveSuccessMsg}
        </Alert>
      </Snackbar>
      <Snackbar
        open={!!deleteError}
        autoHideDuration={5000}
        onClose={() => setDeleteError('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" variant="filled" icon={false} onClose={() => setDeleteError('')}
          sx={{ bgcolor: '#fee2e2', color: '#991b1b', fontWeight: 600, border: '1px solid #fecaca', '& .MuiAlert-action': { color: '#991b1b' } }}>
          {deleteError}
        </Alert>
      </Snackbar>
    </Box>
  );
}
