import React, { useEffect, useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import api from '../../hooks/useQuery';
import CsvUploader from './CsvUploader';
import SearchSelect from '../shared/SearchSelect';

/**
 * Picks a side for a recon: a Dataset or an uploaded CSV.
 * Value shape: { kind: 'dataset'|'csv', refId: string, displayName: string }
 */
export default function SourceSidePicker({ label, value, onChange }) {
  const [datasets, setDatasets] = useState([]);
  const [recentCsvs, setRecentCsvs] = useState([]); // populated on upload

  useEffect(() => { api.get('/models').then((r) => setDatasets(r.data || [])).catch(() => {}); }, []);

  // When the picker opens with an existing CSV source, load its metadata so it
  // appears in the dropdown and the chip shows the correct filename.
  useEffect(() => {
    if (value?.kind === 'csv' && value.refId) {
      api.get(`/recons/csv/${value.refId}`)
        .then((r) => setRecentCsvs((arr) => [r.data, ...arr.filter((c) => c._id !== r.data._id)]))
        .catch(() => {});
    }
  }, [value?.refId, value?.kind]);

  const handleChange = (v) => {
    if (!v) return onChange(null);
    if (v.startsWith('ds:')) {
      const id = v.slice(3);
      const d = datasets.find((x) => x._id === id);
      onChange({ kind: 'dataset', refId: id, displayName: d?.name });
    } else if (v.startsWith('csv:')) {
      const id = v.slice(4);
      const c = recentCsvs.find((x) => x._id === id);
      onChange({ kind: 'csv', refId: id, displayName: c?.filename });
    }
  };

  const onUploaded = (meta) => {
    setRecentCsvs((arr) => [meta, ...arr.filter((c) => c._id !== meta._id)].slice(0, 5));
    onChange({ kind: 'csv', refId: meta._id, displayName: meta.filename });
  };

  const selectVal = value
    ? (value.kind === 'dataset' ? `ds:${value.refId}` : `csv:${value.refId}`)
    : '';

  const options = [
    ...datasets.map((d) => ({
      value: `ds:${d._id}`,
      label: d.name,
      description: d.verified ? 'Verified dataset' : 'Dataset',
    })),
    ...recentCsvs.map((c) => ({
      value: `csv:${c._id}`,
      label: c.filename,
      description: 'Uploaded CSV',
    })),
  ];

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{label}</Typography>
      <SearchSelect
        value={selectVal}
        onChange={handleChange}
        options={options}
        label="Source"
        placeholder="Search datasets & uploads…"
        fullWidth
      />
      <Box>
        <CsvUploader onUploaded={onUploaded} />
      </Box>
    </Stack>
  );
}
