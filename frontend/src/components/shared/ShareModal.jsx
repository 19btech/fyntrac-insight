import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, IconButton, Tooltip,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import api from '../../hooks/useQuery';

export default function ShareModal({ open, onClose, dashboardId }) {
  const [shareUrl, setShareUrl] = useState('');
  const [loading, setLoading] = useState(false);

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
    navigator.clipboard.writeText(shareUrl);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Share Dashboard</DialogTitle>
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
        <Button onClick={onClose}>Close</Button>
        {!shareUrl && (
          <Button variant="contained" onClick={createShare} disabled={loading}>
            {loading ? 'Generating…' : 'Create share link'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
