import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Autocomplete, TextField, Chip, CircularProgress, Box,
} from '@mui/material';
import api from '../../hooks/useQuery';
import SearchSelect from '../shared/SearchSelect';

// Module-level cache: collection+field+search → value[]
// Keeps the network completely idle once a combo has been fetched.
const _valCache = {};
function cacheKey(collection, field, search) {
  return `${collection}\x00${field}\x00${search}`;
}

/**
 * Smart value input for FilterBuilder. Behaviour:
 *
 *  - $exists → renders nothing (no value needed)
 *  - $regex  → plain text input (pattern, not a value to look up)
 *  - $in / $nin → multi-value chip autocomplete (comma-joined on save, chip UI)
 *  - numeric operators ($gt/$gte/$lt/$lte) → plain number input
 *  - $eq / $ne → single-value autocomplete with live search against the
 *                /schema/collections/:name/values endpoint
 *
 * `collection` must be the raw MongoDB collection name; the component isn't
 * responsible for resolving datasets/questions — that's done upstream by the
 * parent who already knows the source collection.
 */
export default function FilterValueInput({ collection, datasetId, field, operator, value, onChange, extraFields = [], sourceKind, sourceName, sourceId }) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const debounceRef = useRef(null);

  // A dataset-backed report builder resolves distinct values through the
  // source-aware endpoint (handles Prism SQL columns + build-step transforms),
  // not the raw collection. Map `datasetId` onto the existing source path.
  const effSourceKind = sourceKind || (datasetId ? 'dataset' : undefined);
  const effSourceId = sourceId || datasetId || undefined;

  // If the selected field is a joined column (produced by a combine step), we
  // must query the *source* collection using the *original* field name — not
  // the safe alias stored in the dataset schema.  For computed addColumn fields
  // there is no backing collection, so we leave collection empty and fall back
  // to freeform text entry.
  const resolvedCollection = useMemo(() => {
    const extra = extraFields.find((e) => e.name === field);
    if (!extra) return collection; // normal source-collection field
    if (extra.originalField && extra.source && extra.source !== 'joined table') return extra.source;
    return ''; // computed / unknown-source → disable autocomplete lookup
  }, [collection, field, extraFields]);

  const resolvedField = useMemo(() => {
    const extra = extraFields.find((e) => e.name === field);
    return extra?.originalField ?? field;
  }, [field, extraFields]);

  const isExists = operator === '$exists';
  const isRegex = operator === '$regex';
  const isNumeric = ['$gt', '$gte', '$lt', '$lte'].includes(operator);
  const isMulti = operator === '$in' || operator === '$nin';
  const isAutocomplete = !isExists && !isRegex && !isNumeric;

  // Convert full ISO datetime strings (e.g. "2025-04-30T00:00:00.000Z") to
  // the compact YYYY-MM-DD form for display and storage. The backend coerce()
  // function recognises both forms and converts them to a BSON Date so that
  // $match correctly compares against date-typed fields.
  const normaliseVal = (v) => {
    if (typeof v !== 'string') return String(v);
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 10); // ISO datetime → YYYY-MM-DD
    return v;
  };

  // Fetch distinct values from the backend, debounced, cached.
  const fetchValues = useCallback((search) => {
    if (!resolvedField) { setOptions([]); return; }

    // Source-aware path (e.g. KPI modal): dataset / report / collection sources
    // resolve distinct values through /schema/source/values, which runs the
    // source's pipeline first. Use whenever a sourceKind is supplied.
    if (effSourceKind) {
      const params = { kind: effSourceKind, field: resolvedField, search, limit: 20 };
      if (effSourceKind === 'collection') {
        if (!sourceName) { setOptions([]); return; }
        params.name = sourceName;
      } else {
        if (!effSourceId) { setOptions([]); return; }
        params.id = effSourceId;
      }
      const key = cacheKey(`${effSourceKind}:${effSourceId || sourceName || ''}`, resolvedField, search);
      if (_valCache[key]) { setOptions(_valCache[key]); return; }
      setLoading(true);
      api.get('/schema/source/values', { params })
        .then((r) => {
          const vals = (r.data || []).map(normaliseVal);
          _valCache[key] = vals;
          setOptions(vals);
        })
        .catch(() => setOptions([]))
        .finally(() => setLoading(false));
      return;
    }

    // Legacy path: raw source collection (dataset builder filter step).
    if (!resolvedCollection) { setOptions([]); return; }
    const key = cacheKey(resolvedCollection, resolvedField, search);
    if (_valCache[key]) { setOptions(_valCache[key]); return; }
    setLoading(true);
    api.get(`/schema/collections/${resolvedCollection}/values`, {
      params: { field: resolvedField, search, limit: 20 },
    })
      .then((r) => {
        const vals = (r.data || []).map(normaliseVal);
        _valCache[key] = vals;
        setOptions(vals);
      })
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [effSourceKind, sourceName, effSourceId, resolvedCollection, resolvedField]); // eslint-disable-line

  // Initial load + load when collection/field changes.
  useEffect(() => {
    if (!isAutocomplete) { setOptions([]); return; }
    fetchValues('');
  }, [resolvedCollection, resolvedField, isAutocomplete, fetchValues]);

  // Debounced search as user types.
  const handleInputChange = (_, newInput) => {
    setInputValue(newInput);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchValues(newInput), 280);
  };

  // Debounced fetch for the SearchSelect value picker (mirrors FieldPicker UX).
  const debouncedFetch = useCallback((s) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchValues(s), 280);
  }, [fetchValues]);

  // Don't render anything for $exists.
  if (isExists) return null;

  // Plain text for $regex and numeric operators.
  if (isRegex || isNumeric) {
    return (
      <TextField
        size="small"
        label="Value"
        type={isNumeric ? 'number' : 'text'}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        sx={{ minWidth: 200 }}
        placeholder={isRegex ? 'Pattern…' : undefined}
      />
    );
  }

  // Multi-chip autocomplete for $in / $nin.
  if (isMulti) {
    // Value is stored as comma-separated string for backend compat; display as chip array.
    const chipValues = value
      ? String(value).split(',').map((v) => v.trim()).filter(Boolean)
      : [];

    const addChip = (val) => {
      if (!val || chipValues.includes(val)) return;
      onChange([...chipValues, val].join(','));
    };
    const removeChip = (val) => {
      onChange(chipValues.filter((v) => v !== val).join(','));
    };

    return (
      <Autocomplete
        multiple
        freeSolo
        size="small"
        sx={{ minWidth: 280 }}
        options={options}
        loading={loading}
        value={chipValues}
        inputValue={inputValue}
        onInputChange={handleInputChange}
        onChange={(_, newVals) => {
          // newVals is the full array after add/remove
          onChange(newVals.join(','));
        }}
        renderTags={(vals, getTagProps) =>
          vals.map((v, i) => (
            <Chip
              key={v}
              size="small"
              label={v}
              {...getTagProps({ index: i })}
              onDelete={() => removeChip(v)}
            />
          ))
        }
        renderInput={(params) => (
          <TextField
            {...params}
            label="Values"
            placeholder="Type or pick…"
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading && <CircularProgress size={14} />}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
      />
    );
  }

  // Single-value picker for $eq / $ne — same searchable dropdown as the field
  // selector (FieldPicker), backed by live distinct-value search. `allowCustom`
  // lets the user commit a value that isn't in the sampled list.
  return (
    <SearchSelect
      value={normaliseVal(value ?? '')}
      onChange={(v) => onChange(normaliseVal(v ?? ''))}
      options={options.map((v) => ({ value: v, label: v }))}
      onSearch={debouncedFetch}
      allowCustom
      label="Value"
      width={240}
    />
  );
}
