import React from 'react';
import { Box, Typography, Chip, Stack } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

/**
 * Reusable card used across the Reports/Dashboards/Collections/Models lists.
 *
 * Visual pattern:
 *   ┌────────────────────────────────────┐
 *   │  [ Category ]                      │
 *   │                                    │
 *   │  Title (bold)                      │
 *   │  Description (muted, 2-line clamp) │
 *   │                                    │
 *   │  View Report →           [actions] │
 *   └────────────────────────────────────┘
 *
 * Hover: lifts slightly, soft shadow, border darkens.
 * Selected: indigo border + light tint background.
 */
export default function EntityCard({
  category,
  title,
  description,
  ctaLabel = 'View Report',
  selected = false,
  onClick,
  actions,
}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        position: 'relative',
        bgcolor: selected ? '#eef2ff' : 'background.paper',
        border: '1px solid',
        borderColor: selected ? '#a5b4fc' : 'divider',
        borderRadius: 2,
        p: 2.5,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 180ms ease, box-shadow 200ms ease, transform 200ms ease, background-color 180ms ease',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 168,
        '&:hover': onClick ? {
          borderColor: '#cbd5e1',
          boxShadow: '0 6px 16px rgba(15,23,42,0.08), 0 2px 4px rgba(15,23,42,0.04)',
          transform: 'translateY(-2px)',
        } : {},
      }}
    >
      {actions && (
        <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 0.5 }}>
          {actions}
        </Box>
      )}

      {category && (
        <Chip
          label={category}
          size="small"
          sx={{
            alignSelf: 'flex-start',
            bgcolor: '#f1f5f9',
            color: '#475569',
            fontWeight: 500,
            fontSize: '0.7rem',
            height: 22,
            borderRadius: 1,
            mb: 1.5,
          }}
        />
      )}

      <Typography
        variant="body1"
        sx={{ fontWeight: 700, fontSize: '1rem', color: 'text.primary', mb: 0.5, pr: actions ? 4 : 0 }}
        noWrap
      >
        {title}
      </Typography>

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{
          flex: 1,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          mb: 1.5,
        }}
      >
        {description || ' '}
      </Typography>

      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: '#4f46e5' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#4f46e5' }}>
          {ctaLabel}
        </Typography>
        <ArrowForwardIcon sx={{ fontSize: 16 }} />
      </Stack>
    </Box>
  );
}
