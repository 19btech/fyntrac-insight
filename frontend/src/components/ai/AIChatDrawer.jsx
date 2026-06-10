import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Drawer, Box, Typography, IconButton, Tooltip, Stack,
  Menu, MenuItem, ListItemText, Divider,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/AddCommentOutlined';
import HistoryIcon from '@mui/icons-material/HistoryOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import AISettingsDialog from './AISettingsDialog';
import AskInsightThread from './aui/AskInsightThread';
import { useFynbaseChatRuntime } from './aui/runtime';
import {
  listConversations, getConversation, upsertConversation, deleteConversation, toSavable, newId,
} from './aui/conversationStore';
import api from '../../hooks/useQuery';
import useReportContextStore from '../../store/reportContextStore';
import useDatasetContextStore from '../../store/datasetContextStore';
import useReconContextStore from '../../store/reconContextStore';
import useKpiContextStore from '../../store/kpiContextStore';

// Context-aware starter questions based on whichever entity is open.
function startersFor({ recon, kpi, report, dataset }) {
  if (recon) return ['Summarise the latest reconciliation run', 'What are the biggest breaks and why?', 'How do I set a materiality tolerance?'];
  if (kpi) return ['Explain what this KPI measures', 'Why might this number change month over month?', 'Suggest a sensible target for it'];
  if (report) return ['Summarise what this report shows', "What's the trend over time?", 'Which chart type fits this data best?'];
  if (dataset) return ['Explain what this dataset contains', 'Add a computed column for net amount', 'What KPIs could I build from this?'];
  return ['What datasets and reports do I have?', 'Write SQL for total amount by status', 'Build a KPI for average days open'];
}

function followupsFor({ recon, kpi, report, dataset }) {
  if (recon) return ['Top 10 breaks by amount', 'Draft a sign-off summary'];
  if (kpi) return ["What's driving the change?", 'Propose a target for this KPI'];
  if (report) return ['Show the underlying numbers', 'Compare to last period'];
  if (dataset) return ['Preview 10 rows', 'Create a KPI from this dataset'];
  return ['Total amount by month', 'Create a KPI for total amount'];
}

function relativeTime(ts) {
  if (!ts) return '';
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

/**
 * Owns ONE persistent assistant-ui runtime. Conversations are switched in place
 * via `runtime.thread.reset(messages)` (no remount, so the composer keeps
 * working), and persisted by subscribing to thread changes.
 */
function ChatPanel({ getContext, loadKey, getMessagesToLoad, activeIdRef, onSave, starters, followups, initialPrompt, seedKey, open, onSeeded }) {
  const runtime = useFynbaseChatRuntime(getContext);

  // Load the active conversation into the runtime whenever it changes.
  useEffect(() => {
    try {
      const msgs = getMessagesToLoad();
      runtime.thread.reset(msgs && msgs.length ? msgs : undefined);
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey]);

  // Persist the conversation (debounced) on every thread change.
  useEffect(() => {
    let timer = null;
    const handler = () => {
      const id = activeIdRef.current;
      let snapshot = [];
      try { snapshot = runtime.thread.getState().messages; } catch { snapshot = []; }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onSave(id, snapshot), 500);
    };
    let unsub;
    try { unsub = runtime.thread.subscribe(handler); } catch { /* noop */ }
    return () => { if (timer) clearTimeout(timer); if (unsub) unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime]);

  // Auto-send a seeded prompt (after the reset above settles).
  useEffect(() => {
    if (!open || !initialPrompt) return undefined;
    const t = setTimeout(() => {
      try { runtime.thread.append({ role: 'user', content: [{ type: 'text', text: initialPrompt }] }); onSeeded?.(); } catch { /* noop */ }
    }, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPrompt, seedKey]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AskInsightThread starters={starters} followups={followups} />
    </AssistantRuntimeProvider>
  );
}

export default function AIChatDrawer({ open, onClose, context, initialPrompt, seedKey }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState(null);
  // Conversation history — default to the most recent saved conversation.
  const [conversations, setConversations] = useState(() => listConversations());
  const [activeId, setActiveId] = useState(() => listConversations()[0]?.id || newId());
  const [loadKey, setLoadKey] = useState(0); // bump to (re)load the active conversation
  const [historyAnchor, setHistoryAnchor] = useState(null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  // Resizable width — drag the left edge. Resets to the default each time the
  // drawer is reopened (the resize is intentionally not persisted).
  const DEFAULT_WIDTH = 520;
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const startResize = useCallback((e) => {
    e.preventDefault();
    const onMove = (ev) => {
      const w = Math.max(360, Math.min(window.innerWidth - 80, window.innerWidth - ev.clientX));
      setWidth(w);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const activeReport = useReportContextStore((s) => s.report);
  const activeDataset = useDatasetContextStore((s) => s.dataset);
  const activeRecon = useReconContextStore((s) => s.recon);
  const activeKpi = useKpiContextStore((s) => s.kpi);

  const contextRef = useRef(context);
  contextRef.current = context;
  const sentSeedRef = useRef(null);
  const seedToSend = (initialPrompt && seedKey !== sentSeedRef.current) ? initialPrompt : null;

  const getContext = useCallback(() => ({
    ...(contextRef.current || {}),
    activeReport: useReportContextStore.getState().report || null,
    activeDataset: useDatasetContextStore.getState().dataset || null,
    activeRecon: useReconContextStore.getState().recon || null,
    activeKpi: useKpiContextStore.getState().kpi || null,
  }), []);

  const entity = { recon: activeRecon, kpi: activeKpi, report: activeReport, dataset: activeDataset };
  const starters = useMemo(() => startersFor(entity), [activeRecon, activeKpi, activeReport, activeDataset]); // eslint-disable-line react-hooks/exhaustive-deps
  const followups = useMemo(() => followupsFor(entity), [activeRecon, activeKpi, activeReport, activeDataset]); // eslint-disable-line react-hooks/exhaustive-deps

  const getMessagesToLoad = useCallback(() => {
    const c = getConversation(activeIdRef.current);
    return c ? c.messages : [];
  }, []);

  const handleSave = useCallback((id, messages) => {
    const saved = toSavable(messages);
    if (saved.length === 0) return;
    const firstUser = saved.find((m) => m.role === 'user');
    const title = (firstUser ? firstUser.content : 'New chat').replace(/\s+/g, ' ').trim().slice(0, 60);
    upsertConversation(id, saved, title);
    setConversations(listConversations());
  }, []);

  const newChat = useCallback(() => { setActiveId(newId()); setLoadKey((k) => k + 1); }, []);
  const selectConvo = (id) => { setHistoryAnchor(null); if (id === activeIdRef.current) return; setActiveId(id); setLoadKey((k) => k + 1); };
  const deleteConvo = (id, e) => {
    e?.stopPropagation();
    deleteConversation(id);
    setConversations(listConversations());
    if (id === activeIdRef.current) newChat();
  };

  const refreshSettings = async () => {
    try { const { data } = await api.get('/ai-settings'); setAiSettings(data); } catch { /* noop */ }
  };
  useEffect(() => {
    if (open) { refreshSettings(); setConversations(listConversations()); setWidth(DEFAULT_WIDTH); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A new "Ask AI to explain" seed starts its own fresh conversation.
  useEffect(() => {
    if (open && initialPrompt && seedKey !== sentSeedRef.current) newChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPrompt, seedKey]);

  // Only show a model name the client has explicitly selected in AI Settings —
  // never a "<provider> · default" placeholder.
  const modelLabel = aiSettings && (
    aiSettings.activeModel
    || aiSettings.providers?.[aiSettings.activeProvider]?.model
    || null
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{ zIndex: (theme) => theme.zIndex.modal + 10 }}
      PaperProps={{ sx: { width, maxWidth: '100vw', display: 'flex', flexDirection: 'column', bgcolor: '#fafbff', backgroundImage: 'none', overflow: 'visible' } }}
    >
      {/* Drag-to-resize handle on the left edge */}
      <Box
        onMouseDown={startResize}
        sx={{
          position: 'absolute', left: -3, top: 0, bottom: 0, width: 8, cursor: 'col-resize', zIndex: 20,
          '&:hover .grip, &:active .grip': { opacity: 1, bgcolor: alpha('#6366f1', 0.6) },
        }}
      >
        <Box className="grip" sx={{ position: 'absolute', left: 3, top: 0, bottom: 0, width: 2, bgcolor: alpha('#6366f1', 0.25), opacity: 0, transition: 'opacity .15s, background-color .15s' }} />
      </Box>

      {/* ── Header ── */}
      <Box sx={{
        display: 'flex', alignItems: 'center', px: 2.5, py: 1.75, gap: 1.5, flexShrink: 0,
        background: 'linear-gradient(135deg, rgba(30,64,175,0.06) 0%, rgba(99,102,241,0.05) 100%)',
        borderBottom: '1px solid', borderColor: 'divider',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0 }}>
          <Box sx={{ width: 36, height: 36, borderRadius: 2.5, flexShrink: 0, bgcolor: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AutoAwesomeIcon sx={{ fontSize: 18, color: '#7c3aed' }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.15, color: 'text.primary' }}>Ask Insight</Typography>
            {modelLabel && (
              <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                {modelLabel}
              </Typography>
            )}
          </Box>
        </Box>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Tooltip title="Conversation history">
            <IconButton size="small" onClick={(e) => { setConversations(listConversations()); setHistoryAnchor(e.currentTarget); }} sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: alpha('#6366f1', 0.08) } }}>
              <HistoryIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="New chat">
            <IconButton size="small" onClick={newChat} sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: alpha('#6366f1', 0.08) } }}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Close">
            <IconButton size="small" onClick={onClose} sx={{ color: 'text.secondary', '&:hover': { color: 'error.main', bgcolor: alpha('#ef4444', 0.08) } }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {/* ── History menu ── */}
      <Menu
        anchorEl={historyAnchor}
        open={Boolean(historyAnchor)}
        onClose={() => setHistoryAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ zIndex: (theme) => theme.zIndex.modal + 20 }}
        slotProps={{ paper: { sx: { width: 320, maxHeight: 420, borderRadius: 2, mt: 0.5 } } }}
      >
        <MenuItem onClick={() => { setHistoryAnchor(null); newChat(); }} sx={{ gap: 1 }}>
          <AddIcon fontSize="small" sx={{ color: '#7c3aed' }} />
          <ListItemText primary="New chat" primaryTypographyProps={{ fontWeight: 700, fontSize: '0.85rem' }} />
        </MenuItem>
        <Divider />
        {conversations.length === 0 ? (
          <MenuItem disabled><ListItemText primary="No past conversations" primaryTypographyProps={{ fontSize: '0.8rem' }} /></MenuItem>
        ) : conversations.map((c) => (
          <MenuItem key={c.id} selected={c.id === activeId} onClick={() => selectConvo(c.id)} sx={{ gap: 1, alignItems: 'flex-start', py: 0.75 }}>
            <ListItemText
              primary={c.title || 'New chat'}
              secondary={relativeTime(c.ts)}
              primaryTypographyProps={{ fontSize: '0.82rem', fontWeight: c.id === activeId ? 700 : 500, noWrap: true }}
              secondaryTypographyProps={{ fontSize: '0.68rem' }}
              sx={{ my: 0, pr: 1 }}
            />
            <Tooltip title="Delete">
              <IconButton size="small" onClick={(e) => deleteConvo(c.id, e)} sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' }, mt: -0.25 }}>
                <DeleteOutlineIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </MenuItem>
        ))}
      </Menu>

      <AISettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={refreshSettings} />

      {/* ── Thread (single persistent runtime; conversations switch via reset) ── */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ChatPanel
          getContext={getContext}
          loadKey={loadKey}
          getMessagesToLoad={getMessagesToLoad}
          activeIdRef={activeIdRef}
          onSave={handleSave}
          starters={starters}
          followups={followups}
          initialPrompt={seedToSend}
          seedKey={seedKey}
          open={open}
          onSeeded={() => { sentSeedRef.current = seedKey; }}
        />
      </Box>
    </Drawer>
  );
}
