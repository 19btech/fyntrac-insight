import React from 'react';
import { Box, Typography } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { formatValue } from './FormatStrip';

export default function MetricCard({ data, yFields = [], columnFormats = {}, prefix = '', suffix = '', goalValue, height }) {
  const valueField = yFields[0] || Object.keys(data?.[0] || {})[0];
  const value = data?.[0]?.[valueField];
  const spec = columnFormats[valueField];
  const formatted = value !== undefined
    ? (spec ? formatValue(value, spec, valueField) : `${prefix}${Number(value).toLocaleString()}${suffix}`)
    : '—';

  const atGoal = goalValue !== undefined && value !== undefined;
  const positive = atGoal ? value >= goalValue : null;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: height || '100%',
        minHeight: height ? undefined : 180,
        p: 2,
      }}
    >
      <Typography
        sx={{
          fontSize: '2.5rem',
          fontWeight: 700,
          color: positive === null ? 'text.primary' : positive ? 'success.main' : 'error.main',
          lineHeight: 1,
        }}
      >
        {formatted}
      </Typography>
      {atGoal && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
          {positive ? (
            <TrendingUpIcon sx={{ color: 'success.main', fontSize: 18 }} />
          ) : (
            <TrendingDownIcon sx={{ color: 'error.main', fontSize: 18 }} />
          )}
          <Typography variant="body2" color={positive ? 'success.main' : 'error.main'}>
            Goal: {prefix}{Number(goalValue).toLocaleString()}{suffix}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
