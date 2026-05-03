import React, { useEffect, useState } from 'react';
import { Box, Chip, Typography, CircularProgress } from '@mui/material';
import api from '../../hooks/useQuery';

export default function AIQuerySuggestions({ collection, onSelect }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!collection) return;
    setLoading(true);
    api.post('/ai/suggestions', { collection })
      .then((r) => setSuggestions(r.data.suggestions || []))
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false));
  }, [collection]);

  if (!loading && suggestions.length === 0) return null;

  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="body2" color="text.secondary" mb={0.5}>AI suggestions:</Typography>
      {loading ? (
        <CircularProgress size={14} />
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {suggestions.map((s, i) => (
            <Chip
              key={i}
              label={s}
              size="small"
              clickable
              onClick={() => onSelect && onSelect(s)}
              sx={{ fontSize: '0.75rem', height: 24, bgcolor: '#eef2ff' }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
