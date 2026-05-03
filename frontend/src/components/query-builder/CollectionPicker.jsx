import React, { useEffect, useState } from 'react';
import { Box, FormControl, InputLabel, Select, MenuItem, CircularProgress, Stack, Chip, Divider, Typography } from '@mui/material';
import VerifiedIcon from '@mui/icons-material/Verified';
import StorageIcon from '@mui/icons-material/Storage';
import api from '../../hooks/useQuery';

/**
 * Source picker — Datasets first (✓ certified badge), then raw collections.
 * Backwards compatible with the old `CollectionPicker` API: still exposes
 * `collection` (string) + `onCollectionChange(name)`. Optionally callers can
 * read the dataset selection via `onSourceChange({kind, name, datasetId})`.
 */
export default function CollectionPicker({
  collection,
  datasetId,
  onCollectionChange,
  onSourceChange,
  exclude = [],
}) {
  const [collections, setCollections] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/schema/collections').then((r) => r.data || []).catch(() => []),
      api.get('/models').then((r) => r.data || []).catch(() => []),
    ]).then(([cs, ds]) => {
      const excluded = new Set(exclude.map((e) => e.toLowerCase()));
      setCollections(cs.filter((c) => !excluded.has(c.toLowerCase())));
      setDatasets(ds);
    }).finally(() => setLoading(false));
  }, []);

  const value = datasetId ? `ds:${datasetId}` : (collection || '');
  const selectedDataset = datasets.find((d) => d._id === datasetId);

  const handleChange = (e) => {
    const v = e.target.value;
    if (typeof v === 'string' && v.startsWith('ds:')) {
      const id = v.slice(3);
      const ds = datasets.find((d) => d._id === id);
      onCollectionChange(ds?.sourceCollection || '');
      onSourceChange?.({ kind: 'dataset', name: ds?.name, datasetId: id, sourceCollection: ds?.sourceCollection, verified: !!ds?.verified });
    } else {
      onCollectionChange(v);
      onSourceChange?.({ kind: 'collection', name: v, datasetId: null });
    }
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
      <FormControl size="small" sx={{ minWidth: 320 }}>
        <InputLabel>From</InputLabel>
        <Select
          label="From"
          value={value}
          onChange={handleChange}
          disabled={loading}
          startAdornment={loading ? <CircularProgress size={14} sx={{ mr: 1 }} /> : null}
          renderValue={(v) => {
            if (typeof v === 'string' && v.startsWith('ds:')) {
              const ds = datasets.find((d) => `ds:${d._id}` === v);
              return (
                <Stack direction="row" spacing={1} alignItems="center">
                  {ds?.verified && <VerifiedIcon sx={{ fontSize: 14, color: '#16a34a' }} />}
                  <span>{ds?.name || 'Dataset'}</span>
                </Stack>
              );
            }
            return <Stack direction="row" spacing={1} alignItems="center"><StorageIcon sx={{ fontSize: 14, opacity: 0.6 }} /><span>{v || 'Choose source…'}</span></Stack>;
          }}
        >
          {datasets.length > 0 && (
            <MenuItem disabled value="__h_ds__" sx={{ opacity: 0.6, fontSize: '0.7rem', textTransform: 'uppercase' }}>
              Datasets (recommended)
            </MenuItem>
          )}
          {datasets.map((d) => (
            <MenuItem key={`ds:${d._id}`} value={`ds:${d._id}`}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%' }}>
                {d.verified && <VerifiedIcon sx={{ fontSize: 14, color: '#16a34a' }} />}
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2">{d.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{d.description || d.sourceCollection}</Typography>
                </Box>
                <Chip size="small" label={d.sourceCollection} sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#f1f5f9' }} />
              </Stack>
            </MenuItem>
          ))}
          {datasets.length > 0 && <Divider key="ds-d" />}
          <MenuItem disabled value="__h_col__" sx={{ opacity: 0.6, fontSize: '0.7rem', textTransform: 'uppercase' }}>
            Raw collections (advanced)
          </MenuItem>
          {collections.map((c) => (
            <MenuItem key={c} value={c}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <StorageIcon sx={{ fontSize: 14, opacity: 0.6 }} />
                <span>{c}</span>
              </Stack>
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {selectedDataset && (
        <Chip
          icon={selectedDataset.verified ? <VerifiedIcon /> : null}
          label={selectedDataset.verified ? `Building on certified dataset · ${selectedDataset.name}` : `Building on ${selectedDataset.name}`}
          color={selectedDataset.verified ? 'success' : 'default'}
          size="small"
          variant="outlined"
        />
      )}
    </Box>
  );
}
