import React from 'react';
import { Box, Paper, Typography, Stack, Chip, Tooltip } from '@mui/material';
import DashboardGrid from './DashboardGrid';

/**
 * Slice C — Sections layout mode. A dashboard with `layoutMode: 'sections'`
 * renders one full-width row per section instead of a free react-grid layout.
 *
 * Each section can carry a kind hint (kpi-row / trend / detail / compare) which
 * controls the default card height. Cards inside a section are referenced by
 * their react-grid `i` id.
 */
const SECTION_HEIGHT = {
  'kpi-row': 110,
  trend: 320,
  detail: 360,
  compare: 320,
  default: 320,
};

export default function DashboardSections({ sections = [], cards = [], dashboardId, editMode, onDeleteCard, onLayoutChange, refreshKey }) {
  if (!sections.length) {
    return (
      <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
        <Typography variant="body2">This dashboard uses Sections layout but no sections are defined yet.</Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      {sections.map((section) => {
        const sectionCards = cards.filter((c) => (section.cardIds || []).includes(c.i));
        const h = SECTION_HEIGHT[section.kind] || SECTION_HEIGHT.default;
        return (
          <Paper key={section.id} variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{section.label}</Typography>
              {section.kind && (
                <Tooltip title={`Section kind: ${section.kind}`}>
                  <Chip size="small" label={section.kind} sx={{ height: 20, fontSize: '0.65rem' }} />
                </Tooltip>
              )}
            </Stack>
            {sectionCards.length === 0 ? (
              <Box sx={{ p: 2, color: 'text.secondary', fontSize: 13 }}>
                No cards in this section yet.
                {editMode && ' Use Ask AI or + Add card to fill it.'}
              </Box>
            ) : (
              <Box sx={{ minHeight: h }}>
                <DashboardGrid
                  cards={sectionCards}
                  layout={
                    section.layout?.length
                      ? section.layout
                      : sectionCards.map((c, i) => ({ i: c.i, x: (i % 4) * 3, y: 0, w: 3, h: Math.max(2, Math.floor(h / 60)) }))
                  }
                  editMode={editMode}
                  dashboardId={dashboardId}
                  onDeleteCard={onDeleteCard}
                  onLayoutChange={onLayoutChange}
                  refreshKey={refreshKey}
                />
              </Box>
            )}
          </Paper>
        );
      })}
    </Stack>
  );
}
