import React from 'react';
import { Box, Chip, TextField } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import useFilterStore from '../../store/filterStore';

export default function DashboardFilters({ filters = [] }) {
  const setFilter = useFilterStore((s) => s.setFilter);
  const filterValues = useFilterStore((s) => s.filters);

  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
        px: 2, py: 1, bgcolor: '#f8fafc', borderRadius: 1, mb: 2,
        border: '1px solid', borderColor: 'divider',
        minHeight: 48,
      }}
    >
      <FilterListIcon sx={{ color: 'text.secondary', fontSize: 18 }} />
      {filters.map((filter) => {
        const value = filterValues[filter.field] ?? filter.defaultValue ?? '';
        return (
          <Box key={filter.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip
              label={filter.label}
              size="small"
              sx={{ height: 24, fontSize: '0.75rem', bgcolor: '#eef2ff' }}
            />
            <TextField
              size="small"
              value={value}
              onChange={(e) => setFilter(filter.field, e.target.value)}
              placeholder={`Filter ${filter.label}…`}
              sx={{ '& .MuiInputBase-input': { fontSize: '0.8125rem', py: 0.5 }, minWidth: 140 }}
            />
          </Box>
        );
      })}
    </Box>
  );
}
