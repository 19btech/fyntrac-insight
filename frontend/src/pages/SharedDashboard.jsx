import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';
import axios from 'axios';
import DashboardGrid from '../components/dashboard/DashboardGrid';

const BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000/api';

export default function SharedDashboard() {
  const { token } = useParams();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    axios
      .get(`${BASE_URL}/share/${token}`)
      .then((r) => setDashboard(r.data))
      .catch((e) => setError(e.response?.data?.error || 'Failed to load dashboard'))
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
      <Typography variant="h2" mb={1}>{dashboard.name}</Typography>
      {dashboard.description && (
        <Typography variant="body2" color="text.secondary" mb={3}>{dashboard.description}</Typography>
      )}

      <DashboardGrid
        layout={dashboard.layout}
        cards={dashboard.cards}
        editMode={false}
        dashboardId={dashboard._id}
      />

      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Powered by Fyntrac Insight
        </Typography>
      </Box>
    </Box>
  );
}
