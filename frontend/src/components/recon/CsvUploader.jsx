import React, { useRef, useState } from 'react';
import { Box, Button, Stack, Typography, LinearProgress, Alert } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import api from '../../hooks/useQuery';

/**
 * Reads a CSV from disk → posts to /recons/csv → returns onUploaded({ _id, filename, columns, types, rowCount, sample }).
 */
export default function CsvUploader({ onUploaded }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState(null);

  const handleFile = async (file) => {
    if (!file) return;
    setBusy(true); setError(''); setMeta(null);
    try {
      const text = await file.text();
      const r = await api.post('/recons/csv', { filename: file.name, raw: text });
      setMeta(r.data);
      onUploaded?.(r.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setBusy(false); }
  };

  return (
    <Box>
      <input
        ref={inputRef} type="file" accept=".csv,text/csv" hidden
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <Button
        size="small"
        startIcon={<UploadFileIcon fontSize="small" />}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        sx={{
          borderRadius: 2, fontWeight: 600, textTransform: 'none', minWidth: 90,
          color: '#1e40af', bgcolor: '#eff6ff',
          border: '1px solid #bfdbfe',
          '&:hover': { bgcolor: '#dbeafe', borderColor: '#93c5fd' },
          '&.Mui-disabled': { bgcolor: '#f8fafc', borderColor: '#e2e8f0', color: '#94a3b8' },
        }}
      >
        {busy ? 'Uploading…' : (meta ? `Replace ${meta.filename}` : 'Upload CSV')}
      </Button>
      {busy && <LinearProgress sx={{ mt: 1 }} />}
      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      {meta && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {meta.filename} · {meta.rowCount} rows · {meta.columns?.length} cols
        </Typography>
      )}
    </Box>
  );
}
