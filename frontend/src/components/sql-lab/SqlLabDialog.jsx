import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogActions, TextField, InputAdornment,
  Box, Stack, Tabs, Tab, IconButton, Button, Tooltip, Badge, Typography,
  CircularProgress, Chip, Divider, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import HighlightOffOutlinedIcon from '@mui/icons-material/HighlightOffOutlined';
import PlayCircleOutlineOutlinedIcon from '@mui/icons-material/PlayCircleOutlineOutlined';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import SaveOutlinedIcon from '@mui/icons-material/TurnedInNot';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import TerminalIcon from '@mui/icons-material/Terminal';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import api from '../../hooks/useQuery';
import CollectionsSidebar from './CollectionsSidebar';
import SavedQueriesPanel from './SavedQueriesPanel';
import SqlEditor from './SqlEditor';
import ResultsGrid from './ResultsGrid';
import DownloadsDialog from './DownloadsDialog';
import AppToast from '../shared/AppToast';
import ADD_BUTTON_SX from '../shared/addButtonSx';

// Circular header icon buttons — identical to the Dashboard page toolbar.
const ICON_BTN_SX = { ...ADD_BUTTON_SX, width: 40, height: 40 };

// Green-tinted "Execute Query" button — same circular shell, green palette.
const RUN_BTN_SX = {
  width: 40, height: 40, borderRadius: '50%',
  bgcolor: 'rgba(22,163,74,0.1)',
  color: '#16a34a',
  border: '1px solid rgba(21,128,61,0.35)',
  boxShadow: 1,
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    bgcolor: 'rgba(22,163,74,0.2)',
    borderColor: '#15803d',
    boxShadow: 3,
    transform: 'scale(1.08)',
  },
  '&:active': { transform: 'scale(0.94)' },
};

// Red-tinted "Stop query" button, shown while a query is running.
const STOP_BTN_SX = {
  width: 40, height: 40, borderRadius: '50%',
  bgcolor: 'rgba(220,38,38,0.1)',
  color: '#dc2626',
  border: '1px solid rgba(185,28,28,0.35)',
  boxShadow: 1,
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    bgcolor: 'rgba(220,38,38,0.2)',
    borderColor: '#b91c1c',
    boxShadow: 3,
    transform: 'scale(1.08)',
  },
  '&:active': { transform: 'scale(0.94)' },
};

const LS_KEY = 'sqllab_worksheets_v1';
const PAGE_SIZE = 100;
const SIDEBAR_W = 264;

let seq = 1;
const newWorksheet = (sql = '') => ({ id: `ws-${Date.now()}-${seq++}`, name: `Query ${seq - 1}`, sql });

function loadWorksheets() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY));
    if (Array.isArray(raw) && raw.length) return raw;
  } catch { /* ignore corrupt state */ }
  return [newWorksheet('SELECT 1;')];
}

/**
 * Full-bleed SQL Lab modal — a Snowflake-style worksheet that opens over the
 * app (mounted globally in AppShell). Branded header + rounded paper match the
 * Report / Dataset dialogs; worksheet state persists in localStorage so it
 * survives close/reopen.
 */
export default function SqlLabDialog({ open, onClose }) {
  const [collections, setCollections] = useState([]);
  const [collectionsLoading, setCollectionsLoading] = useState(true);

  const [worksheets, setWorksheets] = useState(loadWorksheets);
  const [activeId, setActiveId] = useState(() => worksheets[0]?.id);

  const [resultMap, setResultMap] = useState({});
  const [errorMap, setErrorMap] = useState({});
  const [loadingMap, setLoadingMap] = useState({});
  const [sortMap, setSortMap] = useState({}); // per-worksheet grid sort model

  const [exporting, setExporting] = useState(false);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [activeDownloads, setActiveDownloads] = useState(0);
  const [exportRefreshKey, setExportRefreshKey] = useState(0);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  // Left rail: 'tables' (collections) | 'saved' (saved queries)
  const [leftTab, setLeftTab] = useState('tables');
  const [railOpen, setRailOpen] = useState(true);
  const [savedQueries, setSavedQueries] = useState([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);

  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const editorApi = useRef(null);
  const abortRef = useRef(null); // in-flight query AbortController
  const active = worksheets.find((w) => w.id === activeId) || worksheets[0];

  useEffect(() => { localStorage.setItem(LS_KEY, JSON.stringify(worksheets)); }, [worksheets]);

  const loadSaved = useCallback(async () => {
    setSavedLoading(true);
    try {
      const { data } = await api.get('/query/saved');
      const queries = data.queries || [];
      setSavedQueries(queries);
      // Self-heal stale tabs: a worksheet whose saved query no longer exists
      // (deleted on this or another device) keeps a cached name + "Saved" chip
      // in localStorage. Detach it and reset the label so it stops showing the
      // deleted query's name in the header/tab.
      const liveIds = new Set(queries.map((q) => q._id));
      setWorksheets((all) => {
        let changed = false;
        const next = all.map((w) => {
          if (w.savedId && !liveIds.has(w.savedId)) {
            changed = true;
            return { ...w, savedId: undefined, name: 'Untitled query' };
          }
          return w;
        });
        return changed ? next : all;
      });
    } catch {
      setSavedQueries([]);
    } finally {
      setSavedLoading(false);
    }
  }, []);

  useEffect(() => { if (open) loadSaved(); }, [open, loadSaved]);

  // Seed a new worksheet from elsewhere (e.g. "Open in Prism" on an Ask Insight
  // result). Fires regardless of open state since this dialog is always mounted.
  useEffect(() => {
    const onSeed = (e) => {
      const sql = e.detail?.sql;
      if (!sql) return;
      const w = { ...newWorksheet(sql), name: e.detail.name || 'From Insight' };
      setWorksheets((ws) => [...ws, w]);
      setActiveId(w.id);
    };
    window.addEventListener('fyntrac:prism:seed', onSeed);
    return () => window.removeEventListener('fyntrac:prism:seed', onSeed);
  }, []);

  // Load collections lazily the first time the modal is opened.
  useEffect(() => {
    if (!open || collections.length) return;
    setCollectionsLoading(true);
    api.get('/query/collections')
      .then((r) => setCollections(r.data.collections || []))
      .catch(() => setCollections([]))
      .finally(() => setCollectionsLoading(false));
  }, [open, collections.length]);

  const setActiveSql = useCallback((sql) => {
    setWorksheets((ws) => ws.map((w) => (w.id === activeId ? { ...w, sql } : w)));
  }, [activeId]);

  const runQuery = useCallback(async (page = 0, sortOverride) => {
    const ws = worksheets.find((w) => w.id === activeId);
    if (!ws || !ws.sql.trim()) return;
    const sort = sortOverride !== undefined ? sortOverride : (sortMap[activeId] || []);
    // Abort any previous in-flight query for this run, then track the new one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingMap((m) => ({ ...m, [activeId]: true }));
    setErrorMap((m) => ({ ...m, [activeId]: null }));
    try {
      const { data } = await api.post('/query/sql', { sql: ws.sql, page, pageSize: PAGE_SIZE, sort }, { signal: controller.signal });
      setResultMap((m) => ({ ...m, [activeId]: data }));
    } catch (e) {
      if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') {
        setErrorMap((m) => ({ ...m, [activeId]: null })); // user stopped it
      } else {
        setErrorMap((m) => ({ ...m, [activeId]: e?.response?.data?.error || e.message }));
        setResultMap((m) => ({ ...m, [activeId]: null }));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoadingMap((m) => ({ ...m, [activeId]: false }));
    }
  }, [worksheets, activeId, sortMap]);

  // Stop the running query (aborts the request; the UI is freed immediately).
  const stopQuery = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoadingMap((m) => ({ ...m, [activeId]: false }));
    setToast({ open: true, severity: 'success', message: 'Query stopped.' });
  }, [activeId]);

  // Grid header click -> set this worksheet's sort model and re-run from page 0.
  const handleSortChange = useCallback((model) => {
    setSortMap((m) => ({ ...m, [activeId]: model }));
    runQuery(0, model);
  }, [activeId, runQuery]);

  const exportCsv = useCallback(async () => {
    const ws = worksheets.find((w) => w.id === activeId);
    if (!ws || !ws.sql.trim()) return;
    setExporting(true);
    try {
      const { data } = await api.post('/query/export', { sql: ws.sql });
      const n = data.estimatedRows;
      setToast({
        open: true,
        severity: 'success',
        message: `CSV is being generated${n != null ? ` (~${n.toLocaleString()} rows)` : ''}. It'll be ready in the Downloads section shortly.`,
      });
      setExportRefreshKey((k) => k + 1);
      setDownloadsOpen(true);
    } catch (e) {
      setToast({ open: true, severity: 'error', message: e?.response?.data?.error || 'Export failed' });
    } finally {
      setExporting(false);
    }
  }, [worksheets, activeId]);

  // ── Saved queries ──────────────────────────────────────────────────────────
  // Save button: update in place if this worksheet is already a saved query,
  // otherwise prompt for a name.
  const handleSaveClick = () => {
    const ws = worksheets.find((w) => w.id === activeId);
    if (!ws || !ws.sql.trim()) {
      setToast({ open: true, severity: 'error', message: 'Nothing to save — the query is empty.' });
      return;
    }
    if (ws.savedId) {
      updateSaved(ws);
    } else {
      setSaveName(ws.name || 'Untitled query');
      setSaveDialogOpen(true);
    }
  };

  const updateSaved = async (ws) => {
    setSaving(true);
    try {
      await api.put(`/query/saved/${ws.savedId}`, { sql: ws.sql });
      setToast({ open: true, severity: 'success', message: `Saved “${ws.name}”.` });
      loadSaved();
    } catch (e) {
      setToast({ open: true, severity: 'error', message: e?.response?.data?.error || 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const createSaved = async () => {
    const ws = worksheets.find((w) => w.id === activeId);
    const name = saveName.trim();
    if (!ws || !name) return;
    setSaving(true);
    try {
      const { data } = await api.post('/query/saved', { name, sql: ws.sql });
      setWorksheets((all) => all.map((w) => (w.id === activeId ? { ...w, name: data.name, savedId: data._id } : w)));
      setSaveDialogOpen(false);
      setToast({ open: true, severity: 'success', message: `Saved “${data.name}”.` });
      setLeftTab('saved');
      loadSaved();
    } catch (e) {
      setToast({ open: true, severity: 'error', message: e?.response?.data?.error || 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const openSaved = (q) => {
    // If already open in a tab, just focus it; otherwise open a new worksheet.
    const existing = worksheets.find((w) => w.savedId === q._id);
    if (existing) {
      setActiveId(existing.id);
      return;
    }
    const w = { ...newWorksheet(q.sql), name: q.name, savedId: q._id };
    setWorksheets((ws) => [...ws, w]);
    setActiveId(w.id);
  };

  const deleteSaved = async (q) => {
    try {
      await api.delete(`/query/saved/${q._id}`);
      setSavedQueries((all) => all.filter((x) => x._id !== q._id));
      // Detach any open worksheet that pointed at this saved query, and reset
      // its title so the (now-deleted) name no longer shows in the header/tab.
      setWorksheets((all) => all.map((w) => (w.savedId === q._id ? { ...w, savedId: undefined, name: 'Untitled query' } : w)));
    } catch { /* ignore */ }
  };

  const addWorksheet = () => {
    const w = newWorksheet('');
    setWorksheets((ws) => [...ws, w]);
    setActiveId(w.id);
  };
  const closeWorksheet = (id, e) => {
    e.stopPropagation();
    setWorksheets((ws) => {
      const next = ws.filter((w) => w.id !== id);
      const safe = next.length ? next : [newWorksheet('SELECT 1;')];
      if (id === activeId) setActiveId(safe[0].id);
      return safe;
    });
    setResultMap((m) => { const c = { ...m }; delete c[id]; return c; });
    setErrorMap((m) => { const c = { ...m }; delete c[id]; return c; });
  };

  // AI: natural language -> SQL, dropped into the active worksheet for review.
  // Sends the worksheet's current query + result-grid context so the model is
  // aware of what the user is looking at and can refine their own query.
  const askAi = useCallback(async () => {
    const prompt = aiPrompt.trim();
    if (!prompt || aiLoading) return;
    setAiLoading(true);
    try {
      const ws = worksheets.find((w) => w.id === activeId);
      const currentSql = ws?.sql?.trim() || '';
      const res = resultMap[activeId];
      const gridContext = res && Array.isArray(res.columns) && res.columns.length
        ? {
            columns: res.columns,
            rowCount: res.rowCount,
            sampleRows: Array.isArray(res.rows) ? res.rows.slice(0, 5) : [],
          }
        : null;
      const { data } = await api.post('/query/ai-sql', { prompt, currentSql, gridContext });
      if (data.sql) {
        setActiveSql(data.sql);
        setAiPrompt('');
        editorApi.current?.focus();
        setToast({ open: true, severity: 'success', message: 'Query generated — review it, then run.' });
      }
    } catch (e) {
      setToast({ open: true, severity: 'error', message: e?.response?.data?.error || 'AI request failed' });
    } finally {
      setAiLoading(false);
    }
  }, [aiPrompt, aiLoading, setActiveSql, worksheets, activeId, resultMap]);

  // Stable callbacks so the (memoized) collections sidebar doesn't re-render —
  // and flicker — every time the query loading state changes.
  const insertSelect = useCallback((coll) => {
    setActiveSql(`SELECT *\nFROM ${coll.name}\nLIMIT 100;`);
    editorApi.current?.focus();
  }, [setActiveSql]);
  const insertText = useCallback((text) => editorApi.current?.insertText(text), []);

  const result = resultMap[activeId];
  const error = errorMap[activeId];
  const loading = !!loadingMap[activeId];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      keepMounted
      fullWidth
      maxWidth={false}
      PaperProps={{
        sx: {
          width: '96vw', height: '95vh', m: 0, borderRadius: 4, maxWidth: 'none',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 32px 64px rgba(0,0,0,0.16)',
          border: '1px solid', borderColor: 'divider',
        },
      }}
    >
      {/* ── Branded header ── */}
      <Box
        sx={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          px: 3, pt: 3, pb: 2.5, flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(30,64,175,0.05) 0%, rgba(99,102,241,0.04) 100%)',
          borderBottom: '1px solid', borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <img src="/fyntrac9.png" alt="Fyntrac" style={{ width: 72, height: 'auto' }} />
          <Box>
            <Chip
              label="Prism"
              size="small"
              sx={{
                height: 20, fontSize: '0.6rem', fontWeight: 700, letterSpacing: 0.8,
                textTransform: 'uppercase', bgcolor: 'rgba(99, 102, 241, 0.1)',
                color: '#6366F1', mb: 0.5, borderRadius: '8px',
              }}
            />
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2, color: 'text.primary' }} noWrap>
                {active?.name || 'Worksheet'}
              </Typography>
              <Chip
                icon={<TerminalIcon sx={{ fontSize: 14 }} />}
                label="Read-only"
                size="small"
                color="success"
                variant="outlined"
                sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600, borderRadius: 1 }}
              />
              {active?.savedId && (
                <Chip
                  icon={<BookmarkBorderIcon sx={{ fontSize: 14 }} />}
                  label="Saved"
                  size="small"
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600, borderRadius: 1 }}
                />
              )}
            </Stack>
          </Box>
        </Box>

        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title={active?.savedId ? 'Update saved query' : 'Save query'}>
            <span>
              <IconButton onClick={handleSaveClick} disabled={saving} sx={ICON_BTN_SX}>
                {saving ? <CircularProgress size={18} /> : <SaveOutlinedIcon sx={{ fontSize: 22 }} />}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Downloads">
            <IconButton onClick={() => setDownloadsOpen(true)} sx={ICON_BTN_SX}>
              <Badge badgeContent={activeDownloads} color="primary" sx={{ '& .MuiBadge-badge': { right: 0, top: 0 } }}>
                <FileDownloadOutlinedIcon sx={{ fontSize: 22 }} />
              </Badge>
            </IconButton>
          </Tooltip>
          {loading ? (
            <Tooltip title="Stop query">
              <IconButton onClick={stopQuery} sx={STOP_BTN_SX}>
                <CircularProgress size={16} sx={{ color: '#dc2626', position: 'absolute' }} />
                <StopRoundedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title="Execute Query">
              <span>
                <IconButton onClick={() => runQuery(0)} sx={RUN_BTN_SX}>
                  <PlayCircleOutlineOutlinedIcon sx={{ fontSize: 24 }} />
                </IconButton>
              </span>
            </Tooltip>
          )}
          <Divider orientation="vertical" flexItem sx={{ height: 22, alignSelf: 'center', borderColor: '#e2e8f0', mx: 0.5 }} />
          <Tooltip title="Close" placement="left">
            <IconButton
              onClick={onClose}
              size="small"
              sx={{ color: 'text.secondary', bgcolor: 'action.hover', borderRadius: 2, '&:hover': { bgcolor: 'error.50', color: 'error.main' } }}
            >
              <HighlightOffOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {/* ── Worksheet tabs ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider', bgcolor: '#f8fafc' }}>
        <Tabs
          value={activeId}
          onChange={(_, v) => setActiveId(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 40, flex: 1, px: 1,
            '& .MuiTab-root': { minHeight: 40, textTransform: 'none', fontSize: '0.8rem', fontWeight: 500, color: '#64748b' },
            '& .MuiTab-root.Mui-selected': { color: '#1e40af', fontWeight: 700 },
            '& .MuiTabs-indicator': { backgroundColor: '#3b82f6', height: 2.5 },
          }}
        >
          {worksheets.map((w) => (
            <Tab
              key={w.id}
              value={w.id}
              component="div"
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {w.name}
                  <CloseIcon
                    sx={{ fontSize: 14, color: '#cbd5e1', borderRadius: '50%', '&:hover': { color: '#dc2626', bgcolor: 'rgba(220,38,38,0.08)' } }}
                    onClick={(e) => closeWorksheet(w.id, e)}
                  />
                </Box>
              }
            />
          ))}
        </Tabs>
        {/* Aligned directly under the header's X close button (same 24px inset). */}
        <Tooltip title="New worksheet">
          <IconButton size="small" onClick={addWorksheet} sx={{ ...ADD_BUTTON_SX, ml: 0.75, mr: 3, width: 30, height: 30 }}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* ── Body: sidebar | editor + results ── */}
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Box
          sx={{
            width: railOpen ? SIDEBAR_W : 44, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider',
            display: 'flex', flexDirection: 'column', bgcolor: '#fafbfc',
            transition: 'width 0.2s ease', overflow: 'hidden',
          }}
        >
          {!railOpen ? (
            <Tooltip title="Expand panel" placement="right">
              <IconButton size="small" onClick={() => setRailOpen(true)} sx={{ m: 1, alignSelf: 'center', color: '#64748b' }}>
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pl: 1, pr: 0.5, pt: 1, width: SIDEBAR_W }}>
                <ToggleButtonGroup
                  value={leftTab}
                  exclusive
                  size="small"
                  onChange={(_, v) => v && setLeftTab(v)}
                  sx={{
                    flex: 1,
                    '& .MuiToggleButton-root': { flex: 1, textTransform: 'none', fontSize: '0.72rem', fontWeight: 600, py: 0.5, border: '1px solid #e2e8f0', color: '#64748b' },
                    '& .Mui-selected': { bgcolor: '#eef2ff !important', color: '#4f46e5 !important', borderColor: '#c7d2fe !important' },
                  }}
                >
                  <ToggleButton value="tables">
                    <StorageOutlinedIcon sx={{ fontSize: 15, mr: 0.5 }} /> Tables
                  </ToggleButton>
                  <ToggleButton value="saved">
                    <BookmarkBorderIcon sx={{ fontSize: 15, mr: 0.5 }} /> Saved
                    {savedQueries.length > 0 && (
                      <Chip label={savedQueries.length} size="small" sx={{ ml: 0.5, height: 16, fontSize: '0.6rem', bgcolor: '#e0e7ff', color: '#4338ca' }} />
                    )}
                  </ToggleButton>
                </ToggleButtonGroup>
                <Tooltip title="Collapse panel" placement="left">
                  <IconButton size="small" onClick={() => setRailOpen(false)} sx={{ color: '#94a3b8' }}>
                    <ChevronLeftIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>

              <Box sx={{ flex: 1, minHeight: 0, width: SIDEBAR_W }}>
                {leftTab === 'tables' ? (
                  <CollectionsSidebar
                    collections={collections}
                    loading={collectionsLoading}
                    onInsertSelect={insertSelect}
                    onInsertText={insertText}
                    showHeader={false}
                  />
                ) : (
                  <SavedQueriesPanel
                    queries={savedQueries}
                    loading={savedLoading}
                    onOpen={openSaved}
                    onDelete={deleteSaved}
                  />
                )}
              </Box>
            </>
          )}
        </Box>

        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* ── Ask-AI bar ── */}
          <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: '#faf5ff' }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Ask AI to write SQL — e.g. “total EOD events by status for Jan 2025”"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askAi(); } }}
              disabled={aiLoading}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AutoAwesomeIcon sx={{ fontSize: 18, color: '#7c3aed' }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Generate SQL">
                      <span>
                        <IconButton size="small" onClick={askAi} disabled={aiLoading || !aiPrompt.trim()} sx={{ color: '#7c3aed' }}>
                          {aiLoading ? <CircularProgress size={16} sx={{ color: '#7c3aed' }} /> : <SendRoundedIcon sx={{ fontSize: 18 }} />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </InputAdornment>
                ),
                sx: {
                  borderRadius: 2, bgcolor: '#fff', fontSize: '0.82rem',
                  // Purple tint to match the "Ask AI to explain" affordance elsewhere.
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#ddd6fe' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#c4b5fd', borderWidth: 1 },
                },
              }}
            />
          </Box>
          <Box sx={{ height: '42%', minHeight: 150, borderBottom: '1px solid', borderColor: 'divider' }}>
            <SqlEditor
              value={active?.sql || ''}
              onChange={setActiveSql}
              onRun={() => runQuery(0)}
              collections={collections}
              apiRef={editorApi}
            />
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, bgcolor: '#fff' }}>
            <ResultsGrid
              result={result}
              loading={loading}
              error={error}
              sortModel={sortMap[activeId] || []}
              onSortChange={handleSortChange}
              onPageChange={(page) => runQuery(page)}
              onExport={exportCsv}
              exporting={exporting}
            />
          </Box>
        </Box>
      </Box>

      <DownloadsDialog
        open={downloadsOpen}
        onClose={() => setDownloadsOpen(false)}
        refreshKey={exportRefreshKey}
        onActiveCountChange={setActiveDownloads}
      />
      {/* ── Save query name dialog ── */}
      <Dialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        sx={{ zIndex: (t) => t.zIndex.modal + 20 }}
        PaperProps={{ sx: { borderRadius: 4, overflow: 'hidden', boxShadow: '0 32px 64px rgba(0,0,0,0.16)', border: '1px solid', borderColor: 'divider' } }}
      >
        {/* Branded header */}
        <Box
          sx={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            px: 3, pt: 3, pb: 2.5,
            background: 'linear-gradient(135deg, rgba(30,64,175,0.05) 0%, rgba(99,102,241,0.04) 100%)',
            borderBottom: '1px solid', borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <img src="/fyntrac9.png" alt="Fyntrac" style={{ width: 64, height: 'auto' }} />
            <Box>
              <Chip
                label="Prism"
                size="small"
                sx={{
                  height: 20, fontSize: '0.6rem', fontWeight: 700, letterSpacing: 0.8,
                  textTransform: 'uppercase', bgcolor: 'rgba(99, 102, 241, 0.1)', color: '#6366F1', mb: 0.5, borderRadius: '8px',
                }}
              />
              <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2, color: 'text.primary' }}>
                {active?.savedId ? 'Update query' : 'Save query'}
              </Typography>
            </Box>
          </Box>
          <Tooltip title="Close" placement="left">
            <IconButton
              onClick={() => setSaveDialogOpen(false)}
              size="small"
              sx={{ color: 'text.secondary', bgcolor: 'action.hover', borderRadius: 2, '&:hover': { bgcolor: 'error.50', color: 'error.main' } }}
            >
              <HighlightOffOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <DialogContent sx={{ pt: 3 }}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Query name"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && saveName.trim()) createSaved(); }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            onClick={createSaved}
            disabled={!saveName.trim() || saving}
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : null}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, px: 3, bgcolor: '#14213d', boxShadow: 'none', '&:hover': { bgcolor: '#0a1628', boxShadow: 'none' } }}
          >
            {saving ? 'Saving…' : 'Save query'}
          </Button>
        </DialogActions>
      </Dialog>

      <AppToast
        open={toast.open}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        message={toast.message}
        severity={toast.severity}
        modal
      />
    </Dialog>
  );
}
