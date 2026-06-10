import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogActions,
  Box, Typography, Divider, TextField, Button, List, ListItem, ListItemText,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import RestoreIcon from '@mui/icons-material/Restore';
import BrandedDialogTitle from '../shared/BrandedDialogTitle';
import restoreButtonSx from '../shared/restoreButtonSx';
import api from '../../hooks/useQuery';

export default function DashboardInfoSidebar({ open, onClose, dashboard, onChange, onRestore }) {
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  const [localName, setLocalName] = useState(dashboard?.name || '');
  const [localDesc, setLocalDesc] = useState(dashboard?.description || '');
  useEffect(() => {
    if (open) {
      setLocalName(dashboard?.name || '');
      setLocalDesc(dashboard?.description || '');
    }
  }, [open, dashboard?._id]);

  useEffect(() => {
    if (!open || !dashboard?._id) return;
    setLoadingVersions(true);
    api.get(`/dashboards/${dashboard._id}/versions`)
      .then((r) => setVersions([...(r.data || [])].reverse()))
      .catch(() => setVersions([]))
      .finally(() => setLoadingVersions(false));
  }, [open, dashboard?._id]);

  if (!dashboard) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <BrandedDialogTitle label="Dashboard" title="Dashboard Info" onClose={onClose} />

      <DialogContent>
        <TextField
          label="Dashboard name"
          fullWidth
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          placeholder="Untitled Dashboard"
          sx={{ mb: 2.5 }}
        />
        <TextField
          label="Description"
          fullWidth
          multiline
          minRows={3}
          value={localDesc}
          onChange={(e) => setLocalDesc(e.target.value)}
          sx={{ mb: 2.5 }}
        />

        <Divider sx={{ mb: 2.5 }} />

        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
          <HistoryIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
          <Typography variant="h6" sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Version history</Typography>
        </Box>
        {loadingVersions ? (
          <Typography variant="body2" color="text.secondary">Loading…</Typography>
        ) : versions.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No previous versions yet.</Typography>
        ) : (
          <List dense disablePadding sx={{ maxHeight: 220, overflowY: 'auto' }}>
            {versions.map((v, i) => (
              <ListItem
                key={i}
                sx={{ px: 0 }}
                secondaryAction={
                  <Button size="small" startIcon={<RestoreIcon fontSize="small" />} onClick={() => onRestore?.(versions.length - 1 - i)} sx={restoreButtonSx}>Restore</Button>
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
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
        <Button
          variant="contained"
          onClick={() => {
            onChange?.({ ...dashboard, name: localName, description: localDesc });
            onClose?.();
          }}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, boxShadow: 'none', bgcolor: '#14213D', '&:hover': { bgcolor: '#0e172b', boxShadow: 'none' } }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
