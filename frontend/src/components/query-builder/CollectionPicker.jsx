import React, { useEffect, useState } from 'react';
import { Box, Chip, CircularProgress } from '@mui/material';
import VerifiedIcon from '@mui/icons-material/Verified';
import api from '../../hooks/useQuery';
import SearchSelect from '../shared/SearchSelect';

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

  const options = [
    ...datasets.map((d) => ({
      value: `ds:${d._id}`,
      label: d.name,
      symbol: d.verified ? '✓' : '',
      description: d.sourceCollection + (d.description ? ` · ${d.description}` : ''),
    })),
    ...collections.map((c) => ({
      value: c,
      label: c,
      description: 'Raw collection',
    })),
  ];

  const handleChange = (v) => {
    if (!v) {
      onCollectionChange('');
      onSourceChange?.({ kind: 'collection', name: '', datasetId: null });
      return;
    }
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
      {loading ? (
        <CircularProgress size={20} />
      ) : (
        <SearchSelect
          value={value}
          onChange={handleChange}
          options={options}
          label="From"
          width={320}
          placeholder="Choose source…"
        />
      )}
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
