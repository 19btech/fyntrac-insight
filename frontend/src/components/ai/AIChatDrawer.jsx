import React, { useState, useRef, useEffect } from 'react';
import {
  Drawer, Box, Typography, IconButton, TextField, Divider,
  Tooltip, Stack, Avatar, Paper,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import AIChatMessage from './AIChatMessage';
import AISettingsDialog from './AISettingsDialog';
import { streamSSE } from '../../hooks/useAI';
import api from '../../hooks/useQuery';
import useReportContextStore from '../../store/reportContextStore';
import useDatasetContextStore from '../../store/datasetContextStore';
import useReconContextStore from '../../store/reconContextStore';
import useKpiContextStore from '../../store/kpiContextStore';

export default function AIChatDrawer({ open, onClose, context, initialPrompt, seedKey }) {
  const [turns, setTurns] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState(null);
  const bottomRef = useRef(null);
  const sendChatRef = useRef(null);
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

  // When the drawer opens with a pre-seeded prompt, auto-send it.
  useEffect(() => {
    if (open && initialPrompt) {
      setTimeout(() => sendChatRef.current?.(initialPrompt), 0);
    }
  }, [open, initialPrompt, seedKey]); // eslint-disable-line

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns]);

  const reset = () => { setTurns([]); };

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

  const handleSubmit = () => {
    const text = input.trim();
    if (!text) return;
    sendChat();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{ zIndex: (theme) => theme.zIndex.modal + 10 }}
      PaperProps={{
        sx: {
          width: 520,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: '#fafbff',
          backgroundImage: 'none',
        },
      }}
    >
      {/* ── Header ── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 2.5,
          py: 1.75,
          background: 'linear-gradient(135deg, rgba(30,64,175,0.06) 0%, rgba(99,102,241,0.05) 100%)',
          borderBottom: '1px solid',
          borderColor: 'divider',
          gap: 1.5,
          flexShrink: 0,
        }}
      >
        {/* Logo + title */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              width: 36, height: 36, borderRadius: 2.5,
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, boxShadow: '0 2px 8px rgba(79,70,229,0.35)',
            }}
          >
            <AutoAwesomeIcon sx={{ fontSize: 18, color: '#fff' }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.15, color: 'text.primary' }}>
              Ask Insight
            </Typography>
            {aiSettings && (
              <Typography
                variant="caption"
                sx={{
                  color: 'text.disabled', display: 'block', lineHeight: 1.2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220,
                }}
              >
                {aiSettings.activeModel
                  || aiSettings.providers?.[aiSettings.activeProvider]?.model
                  || `${aiSettings.activeProvider} · default`}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Actions */}
        <Stack direction="row" spacing={0.5} alignItems="center">
          {turns.length > 0 && (
            <Tooltip title="New conversation">
              <IconButton
                size="small" onClick={reset}
                sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: alpha('#6366f1', 0.08) } }}
              >
                <RestartAltIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Close">
            <IconButton
              size="small" onClick={onClose}
              sx={{ color: 'text.secondary', '&:hover': { color: 'error.main', bgcolor: alpha('#ef4444', 0.08) } }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      <AISettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={refreshSettings}
      />

      {/* ── Conversation body ── */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 2.5, py: 2, display: 'flex', flexDirection: 'column', gap: 0 }}>
        <>
          {turns.map((t, i) => <AIChatMessage key={i} message={t} />)}
          {streaming && turns[turns.length - 1]?.role === 'assistant' && turns[turns.length - 1]?.content === '' && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1 }}>
                <Avatar
                  sx={{
                    width: 28, height: 28, flexShrink: 0,
                    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                  }}
                >
                  <AutoAwesomeIcon sx={{ fontSize: 14 }} />
                </Avatar>
                <Paper
                  elevation={0}
                  sx={{
                    px: 2, py: 1.25,
                    bgcolor: '#fff',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: '4px 16px 16px 16px',
                    display: 'flex', alignItems: 'center', gap: 0.75,
                  }}
                >
                  {[0.2, 0.4, 0.6].map((delay) => (
                    <Box
                      key={delay}
                      sx={{
                        width: 7, height: 7, borderRadius: '50%',
                        bgcolor: '#6366f1', opacity: 0.7,
                        animation: 'fyntrac-pulse 1.2s ease-in-out infinite',
                        animationDelay: `${delay}s`,
                        '@keyframes fyntrac-pulse': {
                          '0%, 100%': { transform: 'scale(0.7)', opacity: 0.4 },
                          '50%': { transform: 'scale(1)', opacity: 1 },
                        },
                      }}
                    />
                  ))}
                </Paper>
              </Box>
            )}
        </>
        <div ref={bottomRef} />
      </Box>

      <Divider />

      {/* ── Input bar ── */}
      <Box sx={{ px: 2.5, pt: 1.5, pb: 2, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
          <TextField
            multiline
            maxRows={4}
            placeholder="Ask anything…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            fullWidth
            size="small"
            disabled={streaming}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 3,
                bgcolor: '#fff',
                fontSize: '0.875rem',
                '& fieldset': { borderColor: alpha('#6366f1', 0.25) },
                '&:hover fieldset': { borderColor: alpha('#6366f1', 0.5) },
                '&.Mui-focused fieldset': { borderColor: '#6366f1' },
              },
            }}
          />
          <Tooltip title="Send (Enter)">
            <span>
              <IconButton
                onClick={handleSubmit}
                disabled={!input.trim() || streaming}
                sx={{
                  width: 40, height: 40, borderRadius: 2.5, flexShrink: 0,
                  background: (!input.trim() || streaming)
                    ? undefined
                    : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                  color: (!input.trim() || streaming) ? undefined : '#fff',
                  boxShadow: (!input.trim() || streaming) ? undefined : '0 2px 8px rgba(79,70,229,0.35)',
                  '&:hover': {
                    background: (!input.trim() || streaming)
                      ? undefined
                      : 'linear-gradient(135deg, #4338ca 0%, #6d28d9 100%)',
                  },
                  transition: 'all 0.2s',
                }}
              >
                <SendRoundedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>
    </Drawer>
  );
}


