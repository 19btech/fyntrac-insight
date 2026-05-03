import React from 'react';
import { Box, Typography, Chip } from '@mui/material';
import DataTable from '../charts/DataTable';

export default function ResultsPreview({ results }) {
  if (!results) return null;
  const { data = [], columns = [], executionTime, cachedAt } = results;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {data.length} row{data.length !== 1 ? 's' : ''} in {executionTime}ms
        </Typography>
        {cachedAt && (
          <Chip label="cached" size="small" sx={{ height: 18, fontSize: '0.7rem' }} />
        )}
      </Box>
      <DataTable data={data} columns={columns} />
    </Box>
  );
}
