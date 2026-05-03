import React, { useEffect, useState, useRef } from 'react';
import { Drawer, Box, Typography, IconButton, Divider, TextField, Button, List, ListItem, ListItemText, Switch, FormControlLabel } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import HistoryIcon from '@mui/icons-material/History';
import api from '../../hooks/useQuery';

/**
 * Metabase v60 dashboard info sidebar.
 * Shows description, metadata, version history and quick toggles.
 */
export default function DashboardInfoSidebar({ open, onClose, dashboard, onChange, onRestore }) {
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // P3: local description state + debounce — avoids a PUT per keystroke.
  const [localDesc, setLocalDesc] = useState(dashboard?.description || '');
  const descTimer = useRef(null);

  // Sync local description when the sidebar is opened for a different dashboard.
  useEffect(() => { setLocalDesc(dashboard?.description || ''); }, [dashboard?._id]);

  useEffect(() => {
    if (!open || !dashboard?._id) return;
    setLoadingVersions(true);
    api.get(`/dashboards/${dashboard._id}/versions`)
      .then((r) => setVersions([...(r.data || [])].reverse())) // newest first
      .catch(() => setVersions([]))
      .finally(() => setLoadingVersions(false));
  }, [open, dashboard?._id]);

  if (!dashboard) return null;

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: 360, p: 2 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography variant="h3" sx={{ flex: 1 }}>Dashboard info</Typography>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </Box>

      <TextField
        label="Description"
        fullWidth
        multiline
        minRows={3}
        value={localDesc}
        onChange={(e) => {
          setLocalDesc(e.target.value);
          if (descTimer.current) clearTimeout(descTimer.current);
          descTimer.current = setTimeout(() => {
            onChange?.({ ...dashboard, description: e.target.value });
          }, 600);
        }}
        sx={{ mb: 2 }}
      />

      <FormControlLabel
        control={
          <Switch
            checked={dashboard.autoApplyFilters !== false}
            onChange={(e) => onChange?.({ ...dashboard, autoApplyFilters: e.target.checked })}
          />
        }
        label="Auto-apply filters"
        sx={{ mb: 2, display: 'block' }}
      />

      <Divider sx={{ mb: 2 }} />

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">Last updated</Typography>
        <Typography variant="body1">{dashboard.updatedAt ? new Date(dashboard.updatedAt).toLocaleString() : '—'}</Typography>
      </Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">Created by</Typography>
        <Typography variant="body1">{dashboard.createdBy || '—'}</Typography>
      </Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">Cards</Typography>
        <Typography variant="body1">{dashboard.cards?.length || 0}</Typography>
      </Box>

      <Divider sx={{ mb: 2 }} />

      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <HistoryIcon fontSize="small" sx={{ mr: 1 }} />
        <Typography variant="h4">Version history</Typography>
      </Box>
      {loadingVersions ? (
        <Typography variant="body2" color="text.secondary">Loading…</Typography>
      ) : versions.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No previous versions yet.</Typography>
      ) : (
        <List dense>
          {versions.map((v, i) => (
            <ListItem
              key={i}
              secondaryAction={
                <Button size="small" onClick={() => onRestore?.(versions.length - 1 - i)}>Restore</Button>
              }
            >
              <ListItemText
                primary={v.snapshottedAt ? new Date(v.snapshottedAt).toLocaleString() : `v${i + 1}`}
                secondary={v.name}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Drawer>
  );
}
