import React from 'react';
import {
  Box, Typography, TextField, MenuItem,
  Button, IconButton, Stack, Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import FieldPicker from './FieldPicker';

const DIR_OPTIONS = [
  { value: 'asc', label: 'Ascending' },
  { value: 'desc', label: 'Descending' },
];

export default function SortLimitPanel({
  collection, datasetId, sorts = [], limit, onSortsChange, onLimitChange,
}) {
  const update = (i, patch) => {
    onSortsChange(sorts.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };
  const add = () => onSortsChange([...sorts, { field: '', dir: 'desc' }]);
  const remove = (i) => onSortsChange(sorts.filter((_, idx) => idx !== i));
  const move = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= sorts.length) return;
    const next = [...sorts];
    [next[i], next[j]] = [next[j], next[i]];
    onSortsChange(next);
  };

  return (
    <Box>
      <Typography variant="body2" fontWeight={700} color="text.secondary" mb={1}>
        SORT & LIMIT
      </Typography>

      <Stack spacing={2.5} sx={{ mb: 2.5 }}>
        {sorts.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No sort applied — rows return in their natural order. Add one or more
            sort fields; they're applied in the order shown (1 first, then 2…).
          </Typography>
        )}
        {sorts.map((s, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Chip size="small" label={i + 1} sx={{ width: 28, fontWeight: 700 }} />
            <Typography variant="body2" sx={{ minWidth: 56 }}>
              {i === 0 ? 'Sort by:' : 'then by:'}
            </Typography>
            <FieldPicker
              collection={collection}
              datasetId={datasetId}
              value={s.field}
              onChange={(v) => update(i, { field: v })}
              label="Field"
            />
            <TextField
              select size="small"
              value={s.dir || 'desc'}
              onChange={(e) => update(i, { dir: e.target.value })}
              label="Direction"
              sx={{ width: 140 }}
            >
              {DIR_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
            <IconButton size="small" onClick={() => move(i, -1)} disabled={i === 0}>
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => move(i, 1)} disabled={i === sorts.length - 1}>
              <ArrowDownwardIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => remove(i)} sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary' } }}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
        <Box>
          <Button startIcon={<AddIcon />} size="small" onClick={add}>
            Add sort field
          </Button>
        </Box>
      </Stack>

      <TextField
        size="small"
        label="Limit"
        type="number"
        value={limit}
        onChange={(e) => onLimitChange(parseInt(e.target.value, 10) || 100)}
        sx={{ width: 100 }}
        inputProps={{ min: 1, max: 10000 }}
      />
    </Box>
  );
}
