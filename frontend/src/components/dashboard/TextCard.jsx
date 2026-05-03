import React from 'react';
import { Box, Typography, Link } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Metabase v60 dashboard text/heading/link/markdown card.
 * variant: 'text' | 'heading' | 'markdown' | 'link'
 */
export default function TextCard({ text, variant = 'text', linkUrl }) {
  if (variant === 'heading') {
    return (
      <Box sx={{ p: 2, height: '100%', display: 'flex', alignItems: 'center' }}>
        <Typography variant="h2" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
          {text}
        </Typography>
      </Box>
    );
  }
  if (variant === 'link') {
    return (
      <Box sx={{ p: 2, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Link href={linkUrl} target="_blank" rel="noopener noreferrer" sx={{ fontSize: '1rem', fontWeight: 700 }}>
          {text || linkUrl}
        </Link>
      </Box>
    );
  }
  if (variant === 'markdown') {
    return (
      <Box sx={{ p: 2, height: '100%', overflow: 'auto', '& p': { mt: 0, mb: 1 }, '& h1,h2,h3': { mt: 1, mb: 1 }, '& a': { color: 'primary.main' }, '& code': { bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5 } }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text || ''}</ReactMarkdown>
      </Box>
    );
  }
  return (
    <Box sx={{ p: 2, height: '100%', overflow: 'auto' }}>
      <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
        {text}
      </Typography>
    </Box>
  );
}
