import React, { useEffect, useState } from 'react';
import {
  Box, Stack, FormControl, InputLabel, Select, MenuItem, Typography,
} from '@mui/material';
import VerifiedIcon from '@mui/icons-material/Verified';
import api from '../../hooks/useQuery';
import CsvUploader from './CsvUploader';

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

  const change = (e) => {
    const v = e.target.value;
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

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{label}</Typography>
      <FormControl size="small" fullWidth>
        <InputLabel>Source</InputLabel>
        <Select label="Source" value={selectVal} onChange={change}>
          <MenuItem disabled value="__h_ds__" sx={{ opacity: 0.6, fontSize: '0.7rem', textTransform: 'uppercase' }}>
            Datasets
          </MenuItem>
          {datasets.map((d) => (
            <MenuItem key={`ds:${d._id}`} value={`ds:${d._id}`}>
              <Stack direction="row" alignItems="center" spacing={1}>
                {d.verified && <VerifiedIcon sx={{ fontSize: 14, color: '#16a34a' }} />}
                <span>{d.name}</span>
              </Stack>
            </MenuItem>
          ))}
          {recentCsvs.length > 0 && (
            <MenuItem disabled value="__h_csv__" sx={{ opacity: 0.6, fontSize: '0.7rem', textTransform: 'uppercase' }}>
              Recent uploads
            </MenuItem>
          )}
          {recentCsvs.map((c) => (
            <MenuItem key={`csv:${c._id}`} value={`csv:${c._id}`}>{c.filename}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <Box>
        <CsvUploader onUploaded={onUploaded} />
      </Box>
    </Stack>
  );
}
