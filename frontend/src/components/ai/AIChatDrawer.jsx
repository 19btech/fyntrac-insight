import React, { useState, useRef, useEffect } from 'react';
import {
  Drawer, Box, Typography, IconButton, TextField, Divider,
  CircularProgress, Tooltip, Stack, Button, Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import AIChatMessage from './AIChatMessage';
import AISettingsDialog from './AISettingsDialog';
import AIIntentChooser, { INTENT_TEMPLATES } from './AIIntentChooser';
import AIPlanCard from './AIPlanCard';
import { streamSSE } from '../../hooks/useAI';
import api from '../../hooks/useQuery';
import useReportContextStore from '../../store/reportContextStore';
import useDatasetContextStore from '../../store/datasetContextStore';
import useReconContextStore from '../../store/reconContextStore';
import useKpiContextStore from '../../store/kpiContextStore';

/**
 * Fyntrac AI co-pilot drawer.
 *
 * Two surfaces share this drawer:
 *  1) Intent launcher (default on open) — user picks "Build a report",
 *     "Explain this number", etc. Each tile maps to a structured tool call
 *     that returns a plan card instead of free-form prose.
 *  2) Free chat — escape hatch for power users; streams as before.
 *
 * Turns are an array of { kind: 'chat'|'plan', role, content, plan?, prompt? }.
 * 'plan' turns render via AIPlanCard with named slots and a refine bar.
 */
export default function AIChatDrawer({ open, onClose, context, initialPrompt, seedKey }) {
  const [turns, setTurns] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [showLauncher, setShowLauncher] = useState(false);
  const [activeIntent, setActiveIntent] = useState('free');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState(null);
  const bottomRef = useRef(null);
  // Always-fresh reference to sendChat — avoids stale-closure bugs in the
  // initialPrompt effect (sendChat is defined later in the function body).
  const sendChatRef = useRef(null);
  // Active report (if any) — published by QuestionEditor. Lets the drawer
  // ground answers in the report the user is currently viewing.
  const activeReport = useReportContextStore((s) => s.report);
  const activeDataset = useDatasetContextStore((s) => s.dataset);
  const activeRecon = useReconContextStore((s) => s.recon);
  const activeKpi = useKpiContextStore((s) => s.kpi);

  const refreshSettings = async () => {
    try {
      const { data } = await api.get('/ai-settings');
      setAiSettings(data);
    } catch { /* noop */ }
  };

  useEffect(() => {
    if (open) {
      refreshSettings();
    }
  }, [open]);

  // When the drawer opens with a pre-seeded prompt (e.g. from a follow-up
  // chip in the AI Explain panel), hide the intent launcher and auto-send.
  // We use sendChatRef (updated every render) to avoid stale-closure issues,
  // and `seedKey` as a dep so clicking the same text twice still fires.
  useEffect(() => {
    if (open && initialPrompt) {
      setShowLauncher(false);
      setActiveIntent('free');
      // Defer one tick so React has flushed state updates from opening the
      // drawer before we push the first message onto the turns list.
      setTimeout(() => sendChatRef.current?.(initialPrompt), 0);
    }
  }, [open, initialPrompt, seedKey]); // eslint-disable-line

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns]);

  const reset = () => { setTurns([]); setShowLauncher(false); setActiveIntent('free'); };

  const friendlyAIError = (err) => {
    const raw = (err?.response?.data?.error || err?.message || '').toLowerCase();
    if (raw.includes('no api key') || raw.includes('api key') || raw.includes('api_key') || raw.includes('unauthorized') || raw.includes('401'))
      return "No AI key is set up yet. Go to AI Settings and add your API key to get started.";
    if (raw.includes('quota') || raw.includes('rate limit') || raw.includes('429') || raw.includes('too many request'))
      return "You've hit the usage limit for this AI model. Wait a minute and try again, or switch to a different model in AI Settings.";
    if (raw.includes('billing') || raw.includes('payment') || raw.includes('insufficient_quota'))
      return "Your AI provider account has a billing issue. Please check your account balance or upgrade your plan.";
    if (raw.includes('connect') || raw.includes('network') || raw.includes('econnrefused') || raw.includes('fetch') || raw.includes('timeout'))
      return "Couldn't reach the AI service. Check your internet connection and try again in a moment.";
    if (raw.includes('model') && (raw.includes('not found') || raw.includes('does not exist') || raw.includes('invalid')))
      return "The selected AI model isn't available. Try switching to a different model in AI Settings.";
    if (raw.includes('context') || raw.includes('token') || raw.includes('too long') || raw.includes('maximum'))
      return "The conversation is too long for this model to handle. Try starting a fresh chat.";
    if (raw.includes('content') || raw.includes('safety') || raw.includes('blocked') || raw.includes('policy'))
      return "The AI couldn't respond to that request due to content restrictions. Try rephrasing your question.";
    if (raw.includes('500') || raw.includes('server') || raw.includes('internal'))
      return "The AI service ran into a problem on its end. This is usually temporary — try again in a moment.";
    return "Something went wrong while talking to the AI. Please try again.";
  };

  const sendChat = async (text) => {
    const userText = (text ?? input).trim();
    if (!userText) return;
    // If an explicit text is passed (follow-up / seed), allow it even while
    // streaming — just skip if actively streaming to avoid double messages.
    if (streaming && !text) return;
    if (streaming) return;
    setInput('');
    const next = [...turns, { kind: 'chat', role: 'user', content: userText }];
    setTurns(next);
    setStreaming(true);
    setTurns((prev) => [...prev, { kind: 'chat', role: 'assistant', content: '' }]);
    try {
      const apiMessages = next
        .filter((t) => t.kind === 'chat')
        .map(({ role, content }) => ({ role, content }));
      let acc = '';
      const mergedContext = { ...(context || {}), activeReport: activeReport || null, activeDataset: activeDataset || null, activeRecon: activeRecon || null, activeKpi: activeKpi || null };
      await streamSSE('/ai/chat', { messages: apiMessages, dashboardContext: mergedContext }, (chunk) => {
        acc += chunk;
        setTurns((prev) => {
          const out = [...prev];
          out[out.length - 1] = { kind: 'chat', role: 'assistant', content: acc };
          return out;
        });
      });
    } catch (err) {
      setTurns((prev) => {
        const out = [...prev];
        out[out.length - 1] = { kind: 'chat', role: 'assistant', content: friendlyAIError(err) };
        return out;
      });
    } finally {
      setStreaming(false);
    }
  };
  // Keep the ref in sync so the initialPrompt effect always calls the
  // latest version of sendChat (avoids stale closure over `streaming`/`turns`).
  sendChatRef.current = sendChat;

  const sendPlan = async ({ prompt, intent }) => {
    if (!prompt || planning) return;
    setShowLauncher(false);
    setActiveIntent(intent);
    setInput('');
    setTurns((prev) => [...prev, { kind: 'chat', role: 'user', content: prompt }]);
    setPlanning(true);
    setTurns((prev) => [...prev, { kind: 'plan', role: 'assistant', loading: true, prompt, intent }]);
    try {
      const mergedCtx = { ...(context || {}), activeReport: activeReport || null, activeDataset: activeDataset || null, activeRecon: activeRecon || null, activeKpi: activeKpi || null };
      const { data } = await api.post('/ai/plan', { prompt, intent, currentContext: mergedCtx });
      setTurns((prev) => {
        const out = [...prev];
        out[out.length - 1] = { kind: 'plan', role: 'assistant', loading: false, prompt, intent, plan: data };
        return out;
      });
    } catch (err) {
      setTurns((prev) => {
        const out = [...prev];
        out[out.length - 1] = { kind: 'plan', role: 'assistant', loading: false, prompt, intent, error: friendlyAIError(err) };
        return out;
      });
    } finally {
      setPlanning(false);
    }
  };

  const handleIntentPick = ({ intent, prompt }) => {
    sendPlan({ intent, prompt });
  };

  const handleRefine = (chip, lastPlan) => {
    const refinePrompt = `${lastPlan?.prompt || 'this report'} — ${chip.refinement}`;
    sendPlan({ intent: 'refine', prompt: refinePrompt });
  };

  const handleSubmit = () => {
    const text = input.trim();
    if (!text) return;
    if (activeIntent && activeIntent !== 'free') sendPlan({ intent: activeIntent, prompt: text });
    else sendChat();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const lastPlanTurn = [...turns].reverse().find((t) => t.kind === 'plan' && t.plan);
  const placeholder = activeIntent === 'free'
    ? 'Ask anything…'
    : activeIntent
      ? (INTENT_TEMPLATES[activeIntent]?.placeholder || 'Refine your request…')
      : 'Pick a starting point above, or type freely';

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{ zIndex: (theme) => theme.zIndex.modal + 10 }}
      PaperProps={{ sx: { width: 520, display: 'flex', flexDirection: 'column' } }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', gap: 1 }}>
        <Typography variant="h4" sx={{ flex: 1 }}>Ask Insight</Typography>
        {aiSettings && (
          <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {aiSettings.activeModel
              || aiSettings.providers[aiSettings.activeProvider]?.model
              || `${aiSettings.activeProvider} · default`}
          </Typography>
        )}
        {turns.length > 0 && (
          <Tooltip title="Start over"><IconButton size="small" onClick={reset}><RestartAltIcon fontSize="small" /></IconButton></Tooltip>
        )}
        <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
      </Box>

      <AISettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={refreshSettings}
      />

      {/* Body */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 1.5 }}>
        {showLauncher && turns.length === 0 ? (
          <AIIntentChooser onPick={handleIntentPick} onFree={() => { setShowLauncher(false); setActiveIntent('free'); }} context={context} />
        ) : (
          <>
            {turns.map((t, i) => {
              if (t.kind === 'plan') {
                return (
                  <AIPlanCard
                    key={i}
                    prompt={t.prompt}
                    plan={t.plan}
                    loading={t.loading}
                    error={t.error}
                    mode={context?.mode}
                    onRefine={(chip) => handleRefine(chip, t)}
                  />
                );
              }
              return <AIChatMessage key={i} message={t} />;
            })}
            {streaming && turns[turns.length - 1]?.role === 'assistant' && turns[turns.length - 1]?.content === '' && (
              <CircularProgress size={16} sx={{ ml: 1, mt: 1 }} />
            )}
          </>
        )}
        <div ref={bottomRef} />
      </Box>

      {/* Refine bar — visible after we have a plan */}
      {lastPlanTurn?.plan && !planning && (
        <Box sx={{ px: 2, pb: 1 }}>
          <Typography variant="caption" color="text.secondary">Refine:</Typography>
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
            {REFINE_CHIPS.map((c) => (
              <Chip key={c.label} label={c.label} size="small" clickable
                onClick={() => handleRefine(c, lastPlanTurn)}
                sx={{ fontSize: '0.72rem', height: 22 }} />
            ))}
          </Stack>
        </Box>
      )}

      <Divider />

      {/* Input */}
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, px: 2, py: 1.5 }}>
        <TextField
          multiline
          maxRows={4}
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          fullWidth
          size="small"
          disabled={streaming || planning}
        />
        <IconButton color="primary" onClick={handleSubmit} disabled={!input.trim() || streaming || planning}>
          {planning ? <CircularProgress size={18} /> : <SendIcon />}
        </IconButton>
      </Box>
      {!showLauncher && turns.length === 0 && (
        <Box sx={{ px: 2, pb: 1.5 }}>
          <Button size="small" onClick={() => { setShowLauncher(true); setActiveIntent(null); }}>← Back to starters</Button>
        </Box>
      )}
    </Drawer>
  );
}

const REFINE_CHIPS = [
  { label: 'Last quarter', refinement: 'apply Last quarter as the time period' },
  { label: 'YTD', refinement: 'apply Year to date as the time period' },
  { label: 'Last year', refinement: 'apply Last year as the time period' },
  { label: 'By region', refinement: 'group the result by region' },
  { label: 'By account', refinement: 'group the result by account' },
  { label: 'Top 10', refinement: 'limit to the top 10 rows by the main metric' },
  { label: 'As bar', refinement: 'show as a bar chart' },
  { label: 'As line', refinement: 'show as a line chart over time' },
  { label: 'As table', refinement: 'show as a table' },
  { label: 'Compact', refinement: 'use compact (K/M) number formatting' },
];
