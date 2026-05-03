import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, List, ListItem, ListItemButton, ListItemIcon,
  ListItemText, IconButton, Chip, CircularProgress, Alert,
} from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import DashboardIcon from '@mui/icons-material/Dashboard';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import ModelTrainingIcon from '@mui/icons-material/ModelTraining';
import FunctionsIcon from '@mui/icons-material/Functions';
import FolderIcon from '@mui/icons-material/Folder';
import { useNavigate } from 'react-router-dom';
import api from '../hooks/useQuery';

const ICONS = {
  dashboard: <DashboardIcon fontSize="small" />,
  question: <QueryStatsIcon fontSize="small" />,
  model: <ModelTrainingIcon fontSize="small" />,
  metric: <FunctionsIcon fontSize="small" />,
  collection: <FolderIcon fontSize="small" />,
};

const ROUTES = {
  dashboard: (id) => `/dashboard/${id}`,
  question: (id) => `/question/${id}`,
  model: () => `/models`,
  metric: () => `/metrics`,
  collection: (id) => `/collection/${id}`,
};

export default function Bookmarks() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    api.get('/bookmarks')
      .then((r) => setItems(r.data || []))
      .catch((e) => setError(e.response?.data?.error || 'Failed to load bookmarks'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const remove = async (b) => {
    await api.delete(`/bookmarks/${b.itemType}/${b.itemId}`);
    load();
  };

  if (loading) return <Box sx={{ p: 4 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h2" mb={2}>
        <StarIcon sx={{ verticalAlign: 'middle', mr: 1, color: '#f59e0b' }} />
        Bookmarks
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Paper>
        {items.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
            <Typography>No bookmarks yet. Star a dashboard or report to save it here.</Typography>
          </Box>
        ) : (
          <List>
            {items.map((b) => (
              <ListItem
                key={b._id}
                secondaryAction={
                  <IconButton edge="end" onClick={() => remove(b)} title="Remove bookmark">
                    <StarIcon sx={{ color: '#f59e0b' }} />
                  </IconButton>
                }
                disablePadding
              >
                <ListItemButton onClick={() => navigate(ROUTES[b.itemType](b.itemId))}>
                  <ListItemIcon>{ICONS[b.itemType]}</ListItemIcon>
                  <ListItemText
                    primary={b.name}
                    secondary={<Chip size="small" label={b.itemType} sx={{ textTransform: 'capitalize' }} />}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Paper>
    </Box>
  );
}
