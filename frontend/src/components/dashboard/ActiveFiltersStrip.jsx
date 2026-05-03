import React from 'react';
import { Box, Chip, Typography, Button } from '@mui/material';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import useFilterStore from '../../store/filterStore';

/**
 * Strip showing all currently-set cross-filters with X to clear individually
 * and a "Clear all" button. Renders nothing if no filters are active.
 */
export default function ActiveFiltersStrip() {
  const filters = useFilterStore((s) => s.filters);
  const clearFilter = useFilterStore((s) => s.clearFilter);
  const reset = useFilterStore((s) => s.reset);
  const entries = Object.entries(filters || {});

  if (entries.length === 0) return null;

  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap',
        px: 1.5, py: 0.75, mb: 2, borderRadius: 1,
        bgcolor: '#eef2ff', border: '1px solid #c7d2fe',
      }}
    >
      <FilterAltIcon sx={{ color: 'primary.main', fontSize: 16 }} />
      <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main', mr: 0.5 }}>
        Filtered by:
      </Typography>
      {entries.map(([field, value]) => (
        <Chip
          key={field}
          label={`${field} = ${String(value)}`}
          size="small"
          onDelete={() => clearFilter(field)}
          sx={{ fontSize: '0.75rem', height: 22, bgcolor: '#fff', borderColor: '#c7d2fe' }}
          variant="outlined"
        />
      ))}
      <Button size="small" onClick={reset} sx={{ fontSize: '0.7rem', ml: 'auto' }}>
        Clear all
      </Button>
    </Box>
  );
}
