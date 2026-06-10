import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, IconButton, Tooltip, Chip,
} from '@mui/material';
import HighlightOffOutlinedIcon from '@mui/icons-material/HighlightOffOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import api from '../../hooks/useQuery';
import AppToast from './AppToast';

export default function ShareModal({ open, onClose, dashboardId }) {
  const [shareUrl, setShareUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const createShare = async () => {
    setLoading(true);
    try {
      const res = await api.post('/share', { dashboardId });
      const url = `${window.location.origin}${res.data.url}`;
      setShareUrl(url);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
      PaperProps={{
        sx: {
          borderRadius: 4,
          boxShadow: '0 32px 64px rgba(0,0,0,0.14)',
          overflow: 'hidden',
          border: '1px solid',
          borderColor: 'divider',
        },
      }}
    >
      <DialogTitle sx={{ p: 0 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            px: 3,
            pt: 3,
            pb: 2.5,
            background: 'linear-gradient(135deg, rgba(30,64,175,0.05) 0%, rgba(99,102,241,0.04) 100%)',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <img src="/fyntrac9.png" alt="Fyntrac" style={{ width: 72, height: 'auto' }} />
            <Box>
              <Chip
                label="Sharing"
                size="small"
                sx={{
                  height: 20, fontSize: '0.6rem', fontWeight: 700, letterSpacing: 0.8,
                  textTransform: 'uppercase', bgcolor: 'rgba(99, 102, 241, 0.1)',
                  color: '#6366F1', mb: 0.5, borderRadius: '8px',
                }}
              />
              <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2, color: 'text.primary' }}>
                Share Dashboard
              </Typography>
            </Box>
          </Box>
          <Tooltip title="Close" placement="left">
            <IconButton
              onClick={onClose}
              size="small"
              sx={{
                color: 'text.secondary', bgcolor: 'action.hover', borderRadius: 2,
                '&:hover': { bgcolor: 'error.50', color: 'error.main' },
              }}
            >
              <HighlightOffOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </DialogTitle>
      <DialogContent>
        {!shareUrl ? (
          <Typography variant="body2" color="text.secondary">
            Generate a public, read-only share link for this dashboard. Anyone with the link can view it without logging in.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, p: 1.5, bgcolor: '#f5f5f5', borderRadius: 1 }}>
            <Typography variant="body2" sx={{ flex: 1, wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.8125rem' }}>
              {shareUrl}
            </Typography>
            <Tooltip title="Copy link">
              <IconButton size="small" onClick={copyToClipboard}><ContentCopyIcon fontSize="small" /></IconButton>
            </Tooltip>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {!shareUrl && (
          <Button variant="contained" onClick={createShare} disabled={loading}>
            {loading ? 'Generating…' : 'Create share link'}
          </Button>
        )}
      </DialogActions>

      <AppToast open={copied} onClose={() => setCopied(false)} message="Link copied to clipboard" modal />
    </Dialog>
  );
}
