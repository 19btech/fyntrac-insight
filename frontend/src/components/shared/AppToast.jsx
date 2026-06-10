import React from 'react';
import { Snackbar, Alert, Slide } from '@mui/material';

function SlideLeft(props) {
  return <Slide {...props} direction="left" />;
}

// Opaque equivalents of the original translucent tints (composited over white)
// so the colour looks the same but the top bar can't show through.
const SEVERITY_SX = {
  success: {
    bgcolor: '#e3f4e9',
    border: '1px solid rgba(22, 163, 74, 0.3)',
    color: '#15803d',
    '& .MuiAlert-icon': { color: '#16a34a' },
  },
  error: {
    bgcolor: '#fce9e9',
    border: '1px solid rgba(220, 38, 38, 0.3)',
    color: '#dc2626',
    '& .MuiAlert-icon': { color: '#dc2626' },
  },
};

export default function AppToast({ open, onClose, message, severity = 'success', modal = false }) {
  return (
    <Snackbar
      open={!!open}
      autoHideDuration={4000}
      onClose={onClose}
      TransitionComponent={SlideLeft}
      // Anchor top-right so MUI applies its own top-right positioning classes.
      // Without this it defaults to bottom-left and those classes (with their
      // responsive media queries) fought the sx overrides — that's why toasts
      // landed in different spots. sx then just offsets it below the topbar,
      // beside the page's "+" button.
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      sx={{
        position: 'fixed',
        // Vertically centred on the 64px top bar, pinned to its right side.
        top: 32,
        right: 24,
        bottom: 'auto',
        left: 'auto',
        transform: 'translateY(-50%)',
        zIndex: modal ? (theme) => theme.zIndex.modal + 20 : 1400,
      }}
    >
      <Alert
        severity={severity}
        variant="standard"
        onClose={onClose}
        sx={{
          borderRadius: 3,
          fontWeight: 600,
          fontSize: '0.85rem',
          fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          minWidth: 280,
          ...SEVERITY_SX[severity],
        }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
