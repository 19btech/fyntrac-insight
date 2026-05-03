import React from 'react';
import { Box, Typography, Paper, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function extractPipeline(content) {
  const match = content.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()); } catch { return null; }
}

const markdownComponents = {
  p: ({ node, ...props }) => (
    <Typography variant="body2" sx={{ lineHeight: 1.6, mb: 0.75, '&:last-child': { mb: 0 } }} {...props} />
  ),
  table: ({ node, ...props }) => (
    <Box
      component="table"
      sx={{
        borderCollapse: 'collapse', width: '100%', my: 1,
        fontSize: '0.8rem',
        '& th, & td': { border: '1px solid', borderColor: 'divider', px: 1, py: 0.5, textAlign: 'left' },
        '& th': { bgcolor: 'action.hover', fontWeight: 600 },
      }}
      {...props}
    />
  ),
  code: ({ inline, className, children, ...props }) =>
    inline ? (
      <Box component="code" sx={{ bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5, fontFamily: 'monospace', fontSize: '0.8rem' }} {...props}>
        {children}
      </Box>
    ) : (
      <Box
        component="pre"
        sx={{ bgcolor: '#dbeafe', color: '#1e3a5f', p: 1, borderRadius: 1, overflow: 'auto', fontSize: '0.75rem', my: 0.75 }}
      >
        <code className={className} {...props}>{children}</code>
      </Box>
    ),
  ul: ({ node, ...props }) => <Box component="ul" sx={{ pl: 2.5, my: 0.5 }} {...props} />,
  ol: ({ node, ...props }) => <Box component="ol" sx={{ pl: 2.5, my: 0.5 }} {...props} />,
  li: ({ node, ...props }) => <Box component="li" sx={{ mb: 0.25 }} {...props} />,
  strong: ({ node, ...props }) => <Box component="strong" sx={{ fontWeight: 700 }} {...props} />,
};

export default function AIChatMessage({ message }) {
  const isUser = message.role === 'user';
  const navigate = useNavigate();
  const pipeline = !isUser ? extractPipeline(message.content) : null;

  return (
    <Box sx={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', mb: 1.5 }}>
      <Box sx={{ maxWidth: '92%' }}>
        <Paper
          elevation={0}
          sx={{
            px: 1.5, py: 1,
            bgcolor: isUser ? 'primary.main' : '#f1f5f9',
            color: isUser ? '#fff' : 'text.primary',
            borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
            '& a': { color: isUser ? '#fff' : 'primary.main' },
          }}
        >
          {isUser ? (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: '#fff' }}>
              {message.content || '…'}
            </Typography>
          ) : (
            <Box sx={{ '& > :first-of-type': { mt: 0 }, '& > :last-child': { mb: 0 } }}>
              {message.content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {message.content}
                </ReactMarkdown>
              ) : (
                <Typography variant="body2" color="text.secondary">…</Typography>
              )}
            </Box>
          )}
        </Paper>

        {pipeline && (
          <Button
            size="small"
            variant="outlined"
            sx={{ mt: 0.5, fontSize: '0.75rem' }}
            onClick={() => {
              const encoded = encodeURIComponent(JSON.stringify(pipeline));
              navigate(`/question/new?pipeline=${encoded}`);
            }}
          >
            Run this query →
          </Button>
        )}
      </Box>
    </Box>
  );
}
