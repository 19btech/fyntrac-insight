import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, CircularProgress, Alert, Paper } from '@mui/material';
import axios from 'axios';
import ChartRenderer from '../components/charts/ChartRenderer';

const BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000/api';

/**
 * Public question view — rendered when a question is shared via a public token.
 * No authentication; the backend resolves tenant from the question's stored tenantId.
 */
export default function SharedQuestion() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    axios
      .get(`${BASE_URL}/share/q/${token}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.error || 'Failed to load question'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, bgcolor: 'background.default', minHeight: '100vh' }}>
      <Typography variant="h2" mb={1}>{data.question?.name}</Typography>
      {data.question?.description && (
        <Typography variant="body2" color="text.secondary" mb={3}>
          {data.question.description}
        </Typography>
      )}
      <Paper sx={{ p: 2, height: 480 }}>
        <ChartRenderer
          data={data.data || []}
          columns={data.columns || []}
          config={data.question?.chartConfig || { chartType: 'table' }}
        />
      </Paper>
      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Powered by Fyntrac Insight
        </Typography>
      </Box>
    </Box>
  );
}
