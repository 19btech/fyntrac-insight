import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  Box, Typography, Button, Skeleton, IconButton, Tooltip, Select, MenuItem, Stack, Divider,
  Card, Dialog, DialogContent,
} from '@mui/material';
import GridViewIcon from '@mui/icons-material/GridView';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ShareIcon from '@mui/icons-material/Share';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/TurnedInNot';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
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
import ADD_BUTTON_SX from '../components/shared/addButtonSx';


const REFRESH_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '1 min', value: 60 },
  { label: '5 min', value: 300 },
  { label: '10 min', value: 600 },
  { label: '30 min', value: 1800 },
  { label: '1 hour', value: 3600 },
];

// Reuse the shared circular icon-button implementation (white circle,
// boxShadow 1→3, scale 1.08 hover / 0.94 active, grey.50 hover, action-grey
// icon). The toolbar keeps a fixed 40×40 footprint for alignment.
const ICON_BTN_SX = { ...ADD_BUTTON_SX, width: 40, height: 40 };

const SEP_SX = { height: 18, alignSelf: 'center', borderColor: '#e2e8f0', mx: 0.5 };

export default function DashboardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [editMode, setEditMode] = useState(searchParams.get('edit') === '1');
  const [shareOpen, setShareOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(null);
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [headerOpen, setHeaderOpen] = useState(false);
  const [sources, setSources] = useState(null);
  // P5: refreshTick drives card data refetches on auto-refresh.
  const [refreshTick, setRefreshTick] = useState(0);
  const { dashboard, setDashboard, loading, fetchError, save, refresh, isNew } = useDashboard(id);
  const resetFilters = useFilterStore((s) => s.reset);
  // For a brand-new dashboard, start in edit mode, expand toolbar, and apply the name from the create modal
  useEffect(() => {
    if (isNew) {
      setEditMode(true);
      setHeaderOpen(true);
      const initialName = location.state?.name;
      if (initialName) {
        setDashboard((prev) => prev ? { ...prev, name: initialName } : prev);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Update local state immediately for smooth UI — and so an explicit Save
    // on a new (unsaved) dashboard captures the latest resized/dragged layout.
    setDashboard((prev) => (prev ? { ...prev, layout: newLayout } : prev));
    // New dashboards have no backend record yet; handleSave POSTs current state.
    if (isNew) return;
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

  const handleSave = useCallback(async () => {
    if (isNew) {
      // First explicit save: create the dashboard in the backend
      await api.post('/dashboards', dashboard);
    } else {
      await save(dashboard);
    }
    navigate('/dashboards', { state: { toast: `"${dashboard.name || 'Dashboard'}" saved` } });
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
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ pt: 1.5, pl: 1.5, pb: 2, mb: 4, borderBottom: '1.5px solid rgba(148, 163, 184, 0.2)' }}
      >
        <Typography variant="h5" sx={{ fontWeight: 600, letterSpacing: '-0.5px', color: 'text.primary' }}>
          {dashboard.name || 'Untitled Dashboard'}
        </Typography>

        {/* Right: action row */}
        <Stack direction="row" alignItems="center" spacing={1}>
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
            <IconButton onClick={refresh} sx={ICON_BTN_SX}>
              <RefreshIcon sx={{ fontSize: 24 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Details">
            <IconButton onClick={() => setInfoOpen(true)} sx={ICON_BTN_SX}>
              <InfoOutlinedIcon sx={{ fontSize: 24 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Share">
            <IconButton onClick={() => setShareOpen(true)} sx={ICON_BTN_SX}>
              <ShareIcon sx={{ fontSize: 24 }} />
            </IconButton>
          </Tooltip>

          {editMode && (
            <>
              <Divider orientation="vertical" flexItem sx={SEP_SX} />
              <Tooltip title="Add card">
                <IconButton onClick={() => setAddCardOpen(true)} sx={ICON_BTN_SX}>
                  <AddIcon sx={{ fontSize: 24 }} />
                </IconButton>
              </Tooltip>
            </>
          )}

          <Divider orientation="vertical" flexItem sx={SEP_SX} />

          {editMode ? (
            <>
              <Tooltip title="Discard changes">
                <IconButton onClick={handleDiscard} sx={ICON_BTN_SX}>
                  <CloseIcon sx={{ fontSize: 24 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Save dashboard">
                <IconButton onClick={handleSave} sx={ICON_BTN_SX}>
                  <SaveIcon sx={{ fontSize: 24 }} />
                </IconButton>
              </Tooltip>
            </>
          ) : (
            <Tooltip title="Edit dashboard">
              <IconButton onClick={() => setEditMode(true)} sx={ICON_BTN_SX}>
                <EditIcon sx={{ fontSize: 24 }} />
              </IconButton>
            </Tooltip>
          )}
          </>)}
          <Divider orientation="vertical" flexItem sx={SEP_SX} />
          <Tooltip title={headerOpen ? 'Collapse toolbar' : 'Expand toolbar'}>
            <IconButton onClick={() => setHeaderOpen((o) => !o)} sx={ICON_BTN_SX}>
              {headerOpen ? <ExpandLessIcon sx={{ fontSize: 24 }} /> : <ExpandMoreIcon sx={{ fontSize: 24 }} />}
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

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
        <Card elevation={0} sx={{ textAlign: 'center', py: 10, px: 4, borderRadius: 4, border: '1px solid #E5E7EB', bgcolor: '#FFFFFF' }}>
          <Stack alignItems="center" spacing={1.5}>
            <GridViewIcon sx={{ fontSize: 40, color: '#94A3B8' }} />
            <Typography sx={{ fontFamily: 'Inter', fontSize: '1rem', fontWeight: 600, color: '#64748B', textAlign: 'center' }}>No cards to display</Typography>
            <Typography sx={{ fontFamily: 'Inter', fontSize: '0.875rem', fontWeight: 400, color: '#94A3B8', maxWidth: 340, textAlign: 'center' }}>
              Use the + button above to add your first card.
            </Typography>
          </Stack>
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
        onChange={(d) => { setDashboard(d); save(d); }}
        onRestore={restoreVersion}
      />
    </Box>
  );
}
