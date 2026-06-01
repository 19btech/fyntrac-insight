import React from 'react';
import { Box, Typography, Paper, Button, Avatar } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

function extractPipeline(content) {
  const match = content.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()); } catch { return null; }
}

const markdownComponents = {
  p: ({ node, ...props }) => (
    <Typography variant="body2" sx={{ lineHeight: 1.65, mb: 0.75, '&:last-child': { mb: 0 }, fontSize: '0.875rem' }} {...props} />
  ),
  table: ({ node, ...props }) => (
    <Box sx={{ overflowX: 'auto', my: 1.25 }}>
      <Box
        component="table"
        sx={{
          borderCollapse: 'collapse', width: '100%',
          fontSize: '0.8rem',
          '& th, & td': { border: '1px solid', borderColor: 'divider', px: 1.25, py: 0.75, textAlign: 'left', verticalAlign: 'top' },
          '& th': { bgcolor: alpha('#6366f1', 0.06), fontWeight: 700, color: '#3730a3' },
          '& tr:nth-of-type(even) td': { bgcolor: '#f8fafc' },
        }}
        {...props}
      />
    </Box>
  ),
  code: ({ inline, className, children, ...props }) =>
    inline ? (
      <Box
        component="code"
        sx={{ bgcolor: alpha('#6366f1', 0.08), color: '#4338ca', px: 0.75, py: 0.1, borderRadius: 0.75, fontFamily: 'monospace', fontSize: '0.8rem' }}
        {...props}
      >
        {children}
      </Box>
    ) : (
      <Box
        component="pre"
        sx={{ bgcolor: '#1e1e2e', color: '#cdd6f4', p: 1.5, borderRadius: 2, overflow: 'auto', fontSize: '0.75rem', my: 1, lineHeight: 1.6 }}
      >
        <code className={className} {...props}>{children}</code>
      </Box>
    ),
  ul: ({ node, ...props }) => <Box component="ul" sx={{ pl: 2.5, my: 0.5, '& li': { mb: 0.25 } }} {...props} />,
  ol: ({ node, ...props }) => <Box component="ol" sx={{ pl: 2.5, my: 0.5, '& li': { mb: 0.25 } }} {...props} />,
  li: ({ node, ...props }) => <Box component="li" sx={{ fontSize: '0.875rem', lineHeight: 1.6 }} {...props} />,
  strong: ({ node, ...props }) => <Box component="strong" sx={{ fontWeight: 700 }} {...props} />,
  h1: ({ node, ...props }) => <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 1.5, mb: 0.5 }} {...props} />,
  h2: ({ node, ...props }) => <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 1.25, mb: 0.5 }} {...props} />,
  h3: ({ node, ...props }) => <Typography variant="body2" fontWeight={700} sx={{ mt: 1, mb: 0.25 }} {...props} />,
  blockquote: ({ node, ...props }) => (
    <Box
      component="blockquote"
      sx={{ borderLeft: '3px solid', borderColor: alpha('#6366f1', 0.4), pl: 1.5, my: 0.75, color: 'text.secondary', fontStyle: 'italic' }}
      {...props}
    />
  ),
};

export default function AIChatMessage({ message }) {
  const isUser = message.role === 'user';
  const navigate = useNavigate();
  const pipeline = !isUser ? extractPipeline(message.content) : null;

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        alignItems: 'flex-end',
        gap: 1,
        mb: 2,
      }}
    >
      {/* AI avatar — left side */}
      {!isUser && (
        <Avatar
          sx={{
            width: 28, height: 28, flexShrink: 0,
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            boxShadow: '0 2px 6px rgba(79,70,229,0.3)',
            mb: 0.25,
          }}
        >
          <AutoAwesomeIcon sx={{ fontSize: 14 }} />
        </Avatar>
      )}

      <Box sx={{ maxWidth: '82%', display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 0.75 }}>
        <Paper
          elevation={0}
          sx={
            isUser
              ? {
                  px: 2, py: 1.25,
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                  color: '#fff',
                  borderRadius: '16px 16px 4px 16px',
                  boxShadow: '0 2px 12px rgba(79,70,229,0.25)',
                }
              : {
                  px: 2, py: 1.25,
                  bgcolor: '#fff',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: '4px 16px 16px 16px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                }
          }
        >
          {isUser ? (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, color: '#fff', fontSize: '0.875rem' }}>
              {message.content || '…'}
            </Typography>
          ) : (
            <Box sx={{ '& > :first-of-type': { mt: 0 }, '& > :last-child': { mb: 0 }, color: 'text.primary' }}>
              {message.content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {message.content}
                </ReactMarkdown>
              ) : (
                <Typography variant="body2" color="text.disabled">…</Typography>
              )}
            </Box>
          )}
        </Paper>

        {pipeline && (
          <Button
            size="small"
            variant="outlined"
            endIcon={<ArrowForwardIcon fontSize="small" />}
            onClick={() => {
              const encoded = encodeURIComponent(JSON.stringify(pipeline));
              navigate(`/question/new?pipeline=${encoded}`);
            }}
            sx={{
              borderRadius: 2, fontSize: '0.75rem', fontWeight: 600,
              borderColor: alpha('#6366f1', 0.4),
              color: '#4f46e5',
              '&:hover': { bgcolor: alpha('#6366f1', 0.06), borderColor: '#6366f1' },
            }}
          >
            Run this query
          </Button>
        )}
      </Box>

      {/* User avatar — right side */}
      {isUser && (
        <Avatar
          sx={{
            width: 28, height: 28, flexShrink: 0,
            bgcolor: alpha('#6366f1', 0.12),
            color: '#4f46e5',
            mb: 0.25,
          }}
        >
          <PersonOutlineIcon sx={{ fontSize: 16 }} />
        </Avatar>
      )}
    </Box>
  );
}
