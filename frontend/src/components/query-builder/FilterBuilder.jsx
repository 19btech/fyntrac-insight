import React from 'react';
import {
  Box, Button, Select, MenuItem, TextField, FormControl, InputLabel, IconButton, Typography,
  Chip, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import BookmarkIcon from '@mui/icons-material/BookmarkBorder';
import EventIcon from '@mui/icons-material/Event';
import CategoryIcon from '@mui/icons-material/Category';
import NumbersIcon from '@mui/icons-material/Numbers';
import FieldPicker from './FieldPicker';
import FilterValueInput from './FilterValueInput';

const OPERATORS = [
  { value: '$eq', label: 'equals' },
  { value: '$ne', label: 'not equals' },
  { value: '$gt', label: '>' },
  { value: '$gte', label: '>=' },
  { value: '$lt', label: '<' },
  { value: '$lte', label: '<=' },
  { value: '$regex', label: 'contains' },
  { value: '$in', label: 'in (comma-separated)' },
  { value: '$nin', label: 'not in (comma-separated)' },
  { value: '$exists', label: 'is not null' },
];

const KIND_ICON = {
  date: <EventIcon fontSize="small" />,
  category: <CategoryIcon fontSize="small" />,
  numeric: <NumbersIcon fontSize="small" />,
};

function FilterRow({ filter, collection, extraFields, onChange, onDelete }) {
  if (filter.savedFilterRef) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Chip
          icon={KIND_ICON[filter.savedFilterRef.kind] || <BookmarkIcon fontSize="small" />}
          label={filter.savedFilterRef.name}
          color="primary"
          variant="outlined"
          onDelete={onDelete}
        />
        <Tooltip title={filter.savedFilterRef.description || ''}>
          <Typography variant="caption" color="text.secondary">{filter.savedFilterRef.description || ''}</Typography>
        </Tooltip>
      </Box>
    );
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5, flexWrap: 'wrap' }}>
      <FieldPicker collection={collection} value={filter.field} onChange={(v) => onChange({ ...filter, field: v })} extraFields={extraFields} />
      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel>Operator</InputLabel>
        <Select label="Operator" value={filter.operator} onChange={(e) => onChange({ ...filter, operator: e.target.value })}>
          {OPERATORS.map((op) => <MenuItem key={op.value} value={op.value}>{op.label}</MenuItem>)}
        </Select>
      </FormControl>
      {filter.operator !== '$exists' && (
        <FilterValueInput
          collection={collection}
          field={filter.field}
          operator={filter.operator}
          value={filter.value}
          onChange={(v) => onChange({ ...filter, value: v })}
          extraFields={extraFields}
        />
      )}
      <IconButton size="small" onClick={onDelete} sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary' } }}><DeleteOutlineIcon fontSize="small" /></IconButton>
    </Box>
  );
}

export default function FilterBuilder({ collection, filters, onChange, extraFields = [] }) {
  const addFilter = () => {
    onChange([...filters, { id: Date.now(), field: '', operator: '$eq', value: '' }]);
  };

  const updateFilter = (idx, updated) => {
    const next = [...filters];
    next[idx] = updated;
    onChange(next);
  };

  const deleteFilter = (idx) => onChange(filters.filter((_, i) => i !== idx));

  return (
    <Box>
      <Typography variant="body2" fontWeight={700} mb={1} color="text.secondary">FILTERS</Typography>
      {filters.map((f, i) => (
        <FilterRow key={f.id} filter={f} collection={collection} extraFields={extraFields}
          onChange={(u) => updateFilter(i, u)} onDelete={() => deleteFilter(i)} />
      ))}
      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
        <Button startIcon={<AddIcon />} size="small" onClick={addFilter}
          sx={{ bgcolor: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 2, textTransform: 'none', fontWeight: 600, boxShadow: 'none', '&:hover': { bgcolor: '#e2e8f0', boxShadow: 'none' } }}>
          Add filter
        </Button>
      </Box>
    </Box>
  );
}

/**
 * Build a $match object for a list of filter rows. Saved-filter rows contribute
 * their pre-compiled $match payload (merged via $and to avoid key collisions).
 */
export function buildMatchStage(filters) {
  const ands = [];
  const matchObj = {};
  for (const f of filters || []) {
    if (f.savedFilterRef?.match) {
      ands.push(f.savedFilterRef.match);
      continue;
    }
    if (!f.field || !f.operator) continue;
    if (f.operator === '$exists') matchObj[f.field] = { $exists: true };
    else if (f.operator === '$in' || f.operator === '$nin')
      matchObj[f.field] = { [f.operator]: String(f.value || '').split(',').map(v => v.trim()).filter(Boolean) };
    else if (f.operator === '$regex')
      matchObj[f.field] = { $regex: f.value, $options: 'i' };
    else {
      const n = parseFloat(f.value);
      matchObj[f.field] = { [f.operator]: isNaN(n) ? f.value : n };
    }
  }
  if (ands.length === 0) return matchObj;
  if (Object.keys(matchObj).length === 0 && ands.length === 1) return ands[0];
  return { $and: [matchObj, ...ands].filter(o => Object.keys(o).length) };
}
