import React, { useEffect, useState } from 'react';
import { FormControl, InputLabel, Select, MenuItem, CircularProgress, ListSubheader } from '@mui/material';
import api from '../../hooks/useQuery';

// Module-level cache shared across all FieldPicker instances.
const _schemaCache = new Map(); // collection -> fields[]
const _schemaPending = new Map(); // collection -> Promise<fields[]>

/**
 * @param {string}  collection  - MongoDB collection name (schema fetched automatically)
 * @param {Array}   extraFields - Additional fields from joined/computed steps,
 *                                each { name, source? }. Shown under a separate header.
 */
export default function FieldPicker({ collection, value, onChange, label = 'Field', extraFields = [] }) {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!collection) { setFields([]); return; }
    if (_schemaCache.has(collection)) { setFields(_schemaCache.get(collection)); return; }
    // Reuse an in-flight request to avoid redundant calls for concurrent mounts.
    let pending = _schemaPending.get(collection);
    if (!pending) {
      pending = api.get(`/schema/collections/${collection}/fields`).then((r) => r.data);
      _schemaPending.set(collection, pending);
    }
    setLoading(true);
    pending
      .then((result) => {
        _schemaCache.set(collection, result);
        setFields(result);
      })
      .catch(() => setFields([]))
      .finally(() => {
        _schemaPending.delete(collection);
        setLoading(false);
      });
  }, [collection]);

  return (
    <FormControl size="small" sx={{ minWidth: 160 }}>
      <InputLabel>{label}</InputLabel>
      <Select
        label={label}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading || !collection}
        startAdornment={loading ? <CircularProgress size={14} sx={{ mr: 1 }} /> : null}
      >
        {/* Schema fields from the source collection */}
        {fields.length > 0 && extraFields.length > 0 && (
          <ListSubheader disableSticky sx={{ lineHeight: '28px', fontSize: 11, fontWeight: 700 }}>
            Source fields
          </ListSubheader>
        )}
        {fields.map((f) => (
          <MenuItem key={f.name} value={f.name}>{f.name} ({f.semanticType || f.type})</MenuItem>
        ))}
        {/* Derived fields from preceding combine / addColumn steps */}
        {extraFields.length > 0 && (
          <ListSubheader disableSticky sx={{ lineHeight: '28px', fontSize: 11, fontWeight: 700 }}>
            Joined / computed fields
          </ListSubheader>
        )}
        {extraFields.map((f) => (
          <MenuItem key={`_extra_${f.name}`} value={f.name}>
            {f.name}{f.source ? ` (from ${f.source})` : ''}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
