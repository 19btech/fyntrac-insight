import React from 'react';
import { Box, Chip, Typography, IconButton, Tooltip, DialogTitle } from '@mui/material';
import { alpha } from '@mui/material/styles';
import HighlightOffOutlinedIcon from '@mui/icons-material/HighlightOffOutlined';

export default function BrandedDialogTitle({ label, title, onClose }) {
  return (
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
            {label && (
              <Chip
                label={label}
                size="small"
                sx={{
                  height: 20, fontSize: '0.6rem', fontWeight: 700, letterSpacing: 0.8,
                  textTransform: 'uppercase', bgcolor: 'rgba(99, 102, 241, 0.1)',
                  color: '#6366F1', mb: 0.5, borderRadius: '8px',
                }}
              />
            )}
            <Typography variant="h6" sx={{ fontFamily: 'Inter', fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.2, color: '#1E293B' }}>
              {title}
            </Typography>
          </Box>
        </Box>
        {onClose && (
          <Tooltip title="Close" placement="left">
            <IconButton
              onClick={onClose}
              size="small"
              sx={{ color: 'text.secondary', bgcolor: 'action.hover', borderRadius: 2, '&:hover': { bgcolor: 'error.50', color: 'error.main' } }}
            >
              <HighlightOffOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </DialogTitle>
  );
}
