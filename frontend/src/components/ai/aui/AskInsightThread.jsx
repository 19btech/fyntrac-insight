import React, { useState } from 'react';
import { Box, Avatar, Tooltip, IconButton, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  ThreadPrimitive, MessagePrimitive, ComposerPrimitive, ActionBarPrimitive, useThreadRuntime,
} from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import remarkGfm from 'remark-gfm';
import ChatArtifact from './ChatArtifacts';

const GRADIENT = 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)';
// Tinted treatment for AI icon chips/avatars (soft violet bg, violet icon).
const ICON_TINT_BG = '#ede9fe';
const ICON_TINT_FG = '#7c3aed';

// Follow-up prompts for the latest assistant turn, provided via context so the
// message components passed to ThreadPrimitive.Messages stay referentially stable.
const FollowupsContext = React.createContext([]);

// Suggestion chip that sends a prompt straight through the thread runtime.
// (ThreadPrimitive.Suggestion routes through a composer, which isn't available
// inside a message — it throws "Composer is not available".)
function SuggestionButton({ prompt, sx, children }) {
  const thread = useThreadRuntime();
  const send = () => {
    try { thread.append({ role: 'user', content: [{ type: 'text', text: prompt }] }); } catch { /* noop */ }
  };
  return <Box component="button" onClick={send} sx={sx}>{children}</Box>;
}

// Block code (e.g. a SQL / Prism query the assistant writes) with a copy button.
function CodeBlock({ className, children }) {
  const [copied, setCopied] = useState(false);
  const text = (Array.isArray(children) ? children.join('') : String(children ?? '')).replace(/\n$/, '');
  const copy = () => {
    try { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* noop */ }
  };
  return (
    <Box sx={{ position: 'relative', my: 1 }}>
      <Tooltip title={copied ? 'Copied' : 'Copy'}>
        <IconButton size="small" onClick={copy}
          sx={{ position: 'absolute', top: 6, right: 6, color: copied ? '#86efac' : '#94a3b8', bgcolor: 'rgba(255,255,255,0.06)', '&:hover': { color: '#e2e8f0', bgcolor: 'rgba(255,255,255,0.12)' } }}>
          {copied ? <CheckRoundedIcon sx={{ fontSize: 15 }} /> : <ContentCopyIcon sx={{ fontSize: 14 }} />}
        </IconButton>
      </Tooltip>
      <Box component="pre" sx={{ m: 0, p: 1.5, pr: 5, bgcolor: '#0f172a', color: '#e2e8f0', borderRadius: 2, fontSize: '0.78rem', fontFamily: 'ui-monospace, monospace', overflowX: 'auto' }}>
        <code className={className}>{children}</code>
      </Box>
    </Box>
  );
}

// Markdown renderer for assistant text parts — matches the app's prose style.
// `fyntrac-artifact` code fences are intercepted and rendered as rich cards.
const mdComponents = {
  a: (p) => <a {...p} target="_blank" rel="noreferrer" style={{ color: '#4f46e5', fontWeight: 600 }} />,
  // Passthrough so block code / artifacts aren't wrapped in a <pre> (the `code`
  // renderer below applies its own block styling and may return a <div> card).
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children, ...props }) => {
    // react-markdown v9 dropped `inline`; detect fenced blocks via the language
    // class instead (inline code has no `language-*`).
    if (/language-fyntrac-artifact/.test(className || '')) {
      const raw = Array.isArray(children) ? children.join('') : String(children ?? '');
      let data = null;
      try { data = JSON.parse(raw.trim()); } catch { /* still streaming / incomplete */ }
      if (data) return <ChatArtifact data={data} />;
      return (
        <Box sx={{ my: 1, px: 1.5, py: 1, borderRadius: 2, bgcolor: '#f8fafc', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #c7d2fe', borderTopColor: '#6366f1', animation: 'spin 0.7s linear infinite', '@keyframes spin': { to: { transform: 'rotate(360deg)' } } }} />
          <Typography variant="caption" color="text.secondary">Preparing result…</Typography>
        </Box>
      );
    }
    const isBlock = /language-/.test(className || '');
    return isBlock ? (
      <CodeBlock className={className}>{children}</CodeBlock>
    ) : (
      <code {...props} className={className} style={{ background: '#eef2ff', color: '#4338ca', padding: '1px 5px', borderRadius: 4, fontSize: '0.82em' }}>{children}</code>
    );
  },
  table: (p) => <table {...p} style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.8rem' }} />,
  th: (p) => <th {...p} style={{ border: '1px solid #e2e8f0', padding: '4px 8px', background: '#f8fafc', textAlign: 'left' }} />,
  td: (p) => <td {...p} style={{ border: '1px solid #e2e8f0', padding: '4px 8px' }} />,
};

const MarkdownText = () => <MarkdownTextPrimitive remarkPlugins={[remarkGfm]} components={mdComponents} />;

const BUBBLE_SX = {
  px: 2, py: 1.25, fontSize: '0.875rem', lineHeight: 1.6,
  '& p': { m: 0, mb: 1, '&:last-child': { mb: 0 } },
  '& ul, & ol': { my: 0.5, pl: 2.5 },
};

function UserMessage() {
  return (
    <MessagePrimitive.Root>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
        <Box sx={{ ...BUBBLE_SX, maxWidth: '85%', color: '#3730a3', bgcolor: '#eef2ff', border: '1px solid #e0e7ff', borderRadius: '16px 16px 4px 16px' }}>
          <MessagePrimitive.Parts />
        </Box>
      </Box>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.5 }}>
        <Avatar sx={{ width: 28, height: 28, flexShrink: 0, mt: 0.25, bgcolor: ICON_TINT_BG }}>
          <AutoAwesomeIcon sx={{ fontSize: 14, color: ICON_TINT_FG }} />
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ ...BUBBLE_SX, color: '#1e293b', bgcolor: '#fff', border: '1px solid', borderColor: 'divider', borderRadius: '4px 16px 16px 16px' }}>
            <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
          </Box>
          <ActionBarPrimitive.Root hideWhenRunning autohide="not-last"
            style={{ display: 'flex', gap: 2, marginTop: 4, marginLeft: 4 }}>
            <Tooltip title="Copy">
              <ActionBarPrimitive.Copy asChild>
                <IconButton size="small" sx={{ color: 'text.disabled', '&:hover': { color: 'primary.main' } }}><ContentCopyIcon sx={{ fontSize: 14 }} /></IconButton>
              </ActionBarPrimitive.Copy>
            </Tooltip>
            <Tooltip title="Retry">
              <ActionBarPrimitive.Reload asChild>
                <IconButton size="small" sx={{ color: 'text.disabled', '&:hover': { color: 'primary.main' } }}><RefreshIcon sx={{ fontSize: 14 }} /></IconButton>
              </ActionBarPrimitive.Reload>
            </Tooltip>
          </ActionBarPrimitive.Root>
          <FollowUps />
        </Box>
      </Box>
    </MessagePrimitive.Root>
  );
}

// Clickable follow-up chips shown under the latest assistant reply (when idle).
function FollowUps() {
  const followups = React.useContext(FollowupsContext);
  if (!followups || followups.length === 0) return null;
  return (
    <MessagePrimitive.If last>
      <ThreadPrimitive.If running={false}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1, ml: 0.5 }}>
          {followups.map((s) => (
            <SuggestionButton key={s} prompt={s} sx={{
              cursor: 'pointer', font: 'inherit', px: 1.25, py: 0.5, borderRadius: 5, fontSize: '0.72rem',
              color: '#4f46e5', bgcolor: alpha('#6366f1', 0.06), border: '1px solid', borderColor: alpha('#6366f1', 0.2),
              '&:hover': { bgcolor: alpha('#6366f1', 0.12) },
            }}>{s}</SuggestionButton>
          ))}
        </Box>
      </ThreadPrimitive.If>
    </MessagePrimitive.If>
  );
}

/**
 * MUI-styled assistant-ui thread. `starters` are context-aware suggestion
 * prompts shown on the empty state.
 */
export default function AskInsightThread({ starters = [], followups = [] }) {
  return (
    <FollowupsContext.Provider value={followups}>
    <ThreadPrimitive.Root style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <ThreadPrimitive.Viewport autoScroll style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column' }}>
        <ThreadPrimitive.Empty>
          <Box sx={{ m: 'auto', textAlign: 'center', maxWidth: 380, py: 4 }}>
            <Avatar sx={{ width: 44, height: 44, mx: 'auto', mb: 1.5, bgcolor: ICON_TINT_BG }}>
              <AutoAwesomeIcon sx={{ fontSize: 22, color: ICON_TINT_FG }} />
            </Avatar>
            <Typography variant="subtitle1" fontWeight={700} sx={{ color: 'text.primary', mb: 0.5 }}>How can I help?</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
              Ask about your data, the page you have open, or have me build something.
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {starters.map((s) => (
                <SuggestionButton key={s} prompt={s} sx={{
                  textAlign: 'left', cursor: 'pointer', width: '100%', font: 'inherit',
                  px: 1.75, py: 1.25, borderRadius: 2.5, fontSize: '0.82rem', color: '#334155',
                  bgcolor: '#fff', border: '1px solid', borderColor: 'divider',
                  transition: 'all .12s',
                  '&:hover': { borderColor: alpha('#6366f1', 0.5), bgcolor: alpha('#6366f1', 0.04) },
                }}>{s}</SuggestionButton>
              ))}
            </Box>
          </Box>
        </ThreadPrimitive.Empty>

        <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
      </ThreadPrimitive.Viewport>

      {/* Composer */}
      <Box sx={{ px: 2.5, pt: 1.5, pb: 2, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0, bgcolor: '#fafbff' }}>
        <ComposerPrimitive.Root style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <Box
            sx={{
              flex: 1, borderRadius: 3, bgcolor: '#fff', border: '1px solid', borderColor: alpha('#6366f1', 0.25),
              '&:focus-within': { borderColor: '#6366f1' }, transition: 'border-color .15s',
            }}
          >
            <ComposerPrimitive.Input
              autoFocus
              maxRows={6}
              placeholder="Ask anything…"
              style={{
                width: '100%', resize: 'none', border: 'none', outline: 'none', background: 'transparent',
                padding: '10px 14px', fontSize: '0.875rem', fontFamily: 'inherit', color: '#1e293b',
                boxSizing: 'border-box',
              }}
            />
          </Box>
          <ThreadPrimitive.If running={false}>
            <Tooltip title="Send (Enter)">
              <ComposerPrimitive.Send asChild>
                <IconButton sx={{ width: 40, height: 40, borderRadius: 2.5, flexShrink: 0, bgcolor: '#a78bfa', color: '#fff', boxShadow: 'none', '&:hover': { bgcolor: '#8b5cf6' } }}>
                  <SendRoundedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </ComposerPrimitive.Send>
            </Tooltip>
          </ThreadPrimitive.If>
          <ThreadPrimitive.If running>
            <Tooltip title="Stop">
              <ComposerPrimitive.Cancel asChild>
                <IconButton sx={{ width: 40, height: 40, borderRadius: 2.5, flexShrink: 0, bgcolor: '#fee2e2', color: '#dc2626', '&:hover': { bgcolor: '#fecaca' } }}>
                  <StopRoundedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </ComposerPrimitive.Cancel>
            </Tooltip>
          </ThreadPrimitive.If>
        </ComposerPrimitive.Root>
      </Box>
    </ThreadPrimitive.Root>
    </FollowupsContext.Provider>
  );
}
