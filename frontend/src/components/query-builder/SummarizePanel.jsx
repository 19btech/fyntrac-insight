import React from 'react';
import {
  Box, Typography, Button, IconButton, Stack, TextField, MenuItem,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FieldPicker from './FieldPicker';

const AGGREGATIONS = [
  { value: '$count', label: 'Count' },
  { value: '$sum', label: 'Sum' },
  { value: '$avg', label: 'Average' },
  { value: '$min', label: 'Min' },
  { value: '$max', label: 'Max' },
];

export default function SummarizePanel({
  collection,
  datasetId,
  groupBys = [],
  metrics = [],
  onGroupBysChange,
  onMetricsChange,
  extraFields = [],
}) {
  const addGroup = () => onGroupBysChange([...groupBys, '']);
  const updateGroup = (idx, value) => {
    const next = [...groupBys];
    next[idx] = value;
    onGroupBysChange(next);
  };
  const removeGroup = (idx) => onGroupBysChange(groupBys.filter((_, i) => i !== idx));

  const addMetric = () => {
    onMetricsChange([...metrics, { id: Date.now(), agg: '$count', field: '' }]);
  };

  const updateMetric = (idx, update) => {
    const next = [...metrics];
    next[idx] = { ...next[idx], ...update };
    onMetricsChange(next);
  };

  const removeMetric = (idx) => {
    onMetricsChange(metrics.filter((_, i) => i !== idx));
  };

  return (
    <Box>
      <Typography variant="body2" fontWeight={700} mb={1} color="text.secondary">SUMMARIZE</Typography>

      <Stack spacing={2.5} sx={{ mb: 2.5 }}>
        {groupBys.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No grouping — query will return raw rows. Add one or more groupings to summarize.
          </Typography>
        )}
        {groupBys.map((g, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="body2" sx={{ minWidth: 70 }}>
              {i === 0 ? 'Group by:' : 'and by:'}
            </Typography>
            <FieldPicker
              collection={collection}
              datasetId={datasetId}
              value={g}
              onChange={(v) => updateGroup(i, v)}
              label="Group by field"
              extraFields={extraFields}
            />
            <IconButton size="small" onClick={() => removeGroup(i)} sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary' } }}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
        <Box>
          <Button startIcon={<AddIcon />} size="small" onClick={addGroup}
            sx={{ bgcolor: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 2, textTransform: 'none', fontWeight: 600, boxShadow: 'none', '&:hover': { bgcolor: '#e2e8f0', boxShadow: 'none' } }}>
            Add grouping
          </Button>
        </Box>
      </Stack>

      {metrics.map((m, i) => {
        const defaultAlias = m.agg === '$count'
          ? 'count'
          : `${m.agg.replace('$', '')}_${(m.field || 'val').replace(/\./g, '_')}`;
        return (
          <Box key={m.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5, flexWrap: 'wrap' }}>
            <TextField
              select size="small" label="Aggregation"
              value={m.agg || '$count'}
              onChange={(e) => updateMetric(i, { agg: e.target.value })}
              sx={{ width: 140, '& .MuiOutlinedInput-root': { borderRadius: '16px' } }}
            >
              {AGGREGATIONS.map((a) => (
                <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>
              ))}
            </TextField>
            {m.agg !== '$count' && (
              <FieldPicker collection={collection} datasetId={datasetId} value={m.field} onChange={(v) => updateMetric(i, { field: v })} label="Field" extraFields={extraFields} />
            )}
            <TextField
              size="small"
              label="Column name"
              placeholder={defaultAlias}
              value={m.alias || ''}
              onChange={(e) => updateMetric(i, { alias: e.target.value })}
              sx={{ minWidth: 180 }}
              title="Header shown in the table"
            />
            <IconButton size="small" onClick={() => removeMetric(i)} sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary' } }}><DeleteOutlineIcon fontSize="small" /></IconButton>
          </Box>
        );
      })}
      <Button startIcon={<AddIcon />} size="small" onClick={addMetric}
        sx={{ bgcolor: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 2, textTransform: 'none', fontWeight: 600, boxShadow: 'none', '&:hover': { bgcolor: '#e2e8f0', boxShadow: 'none' } }}>
        Add metric
      </Button>
    </Box>
  );
}
