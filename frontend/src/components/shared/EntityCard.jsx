import React from 'react';
import { Box, Typography, Chip, Stack, Card, CardActionArea, Fade } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

export default function EntityCard({
  category,
  title,
  description,
  ctaLabel = 'Configure',
  selected = false,
  onClick,
  actions,
  index = 0,
}) {
  return (
    <Fade in timeout={(index + 1) * 300}>
      <Card
        elevation={0}
        sx={{
          position: 'relative',
          borderRadius: '16px',
          border: '1px solid',
          borderColor: selected ? 'primary.main' : '#eeeeee',
          bgcolor: selected ? '#eff6ff' : '#FFFFFF',
          width: '100%',
          height: '100%',
          transition: 'all 0.3s ease-in-out',
          // Explicit hover (overrides the generic theme MuiCard hover) so the
          // card lifts, casts a soft shadow, gains a brand border and the
          // light-blue tint background per the design spec.
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: '0 12px 24px -10px rgba(0, 0, 0, 0.1)',
            borderColor: 'primary.main',
            bgcolor: '#eff6ff',
          },
        }}
      >
        {actions && (
          <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1, display: 'flex', gap: 0.5 }}>
            {actions}
          </Box>
        )}
        <CardActionArea
          onClick={onClick}
          sx={{
            height: '100%',
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            '& .MuiCardActionArea-focusHighlight': { bgcolor: 'transparent' },
          }}
        >
          <Box sx={{ width: '100%' }}>
            {category && (
              <Chip
                label={category}
                size="small"
                sx={{
                  // Explicit values override the theme's global MuiChip
                  // styleOverrides (which force 22px / 0.75rem / radius 6) so
                  // this chip matches the spec: 24px tall, 0.8125rem, pill.
                  bgcolor: 'grey.100',
                  fontWeight: 600,
                  color: 'text.secondary',
                  fontSize: '0.8125rem',
                  height: 24,
                  borderRadius: '9999px',
                  mb: 2,
                }}
              />
            )}
            <Typography
              variant="h6"
              gutterBottom
              sx={{
                fontWeight: 700,
                lineHeight: 1.3,
                color: 'text.primary',
                pr: actions ? 4 : 0,
              }}
            >
              {title}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontSize: '0.875rem',
                color: 'text.secondary',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
              }}
            >
              {description || ' '}
            </Typography>
          </Box>

          <Stack direction="row" alignItems="center" sx={{ mt: 3, color: 'primary.main' }}>
            <Typography variant="button" sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'primary.main' }}>
              {ctaLabel}
            </Typography>
            <ArrowForwardIcon sx={{ fontSize: 16, ml: 1 }} />
          </Stack>
        </CardActionArea>
      </Card>
    </Fade>
  );
}
