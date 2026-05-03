import React, { useState } from 'react';
import { Paper, Box, Typography, Stack, IconButton, Collapse } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

const STEP_COLORS = {
  source: '#eef2ff',
  filter: '#fef3c7',
  summarize: '#dcfce7',
  sort: '#fce7f3',
};

/**
 * Numbered, color-coded "step" card. Now collapsible — the header is a
 * click target (chevron rotates) and the body slides under a Collapse.
 *
 * Props:
 *   index, kind, label, helper, children — as before
 *   defaultOpen — initial state (default true)
 *   summary     — optional compact text shown next to the label when collapsed
 */
export default function BuilderStepCard({ index, kind, label, helper, summary, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = () => setOpen((o) => !o);

  return (
    <Paper variant="outlined" sx={{ p: 1.25, position: 'relative', overflow: 'visible' }}>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        onClick={toggle}
        sx={{ cursor: 'pointer', userSelect: 'none', mb: open ? 1 : 0 }}
      >
        <Box
          sx={{
            width: 22, height: 22, borderRadius: '50%',
            bgcolor: STEP_COLORS[kind] || '#e2e8f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: '#1e293b',
            flexShrink: 0,
          }}
        >
          {index}
        </Box>
        <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </Typography>
        {open && helper && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>{helper}</Typography>
        )}
        {!open && summary && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {summary}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          sx={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Collapse in={open} timeout={200} unmountOnExit>
        <Box>{children}</Box>
      </Collapse>
    </Paper>
  );
}
