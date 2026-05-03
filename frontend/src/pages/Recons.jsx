import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Typography, Button, Grid, Card, IconButton,
  Stack, Tooltip, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogContentText, DialogActions,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import EditIcon from '@mui/icons-material/Edit';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import api from '../hooks/useQuery';
import EntityCard from '../components/shared/EntityCard';

export default function ReconsPage() {
  const [recons, setRecons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState(null); // recon id currently being run
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/recons');
      setRecons(r.data || []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Refresh list whenever a recon is saved from the modal
  useEffect(() => {
    window.addEventListener('fyntrac:recon:saved', load);
    return () => window.removeEventListener('fyntrac:recon:saved', load);
  }, [load]);

  const remove = async (id) => {
    await api.delete(`/recons/${id}`);
    setDeleteTarget(null);
    load();
  };

  const run = async (id) => {
    if (runningId) return; // prevent concurrent runs
    setRunningId(id);
    try {
      await api.post(`/recons/${id}/run`);
      load();
      // Open the modal directly on the Results tab
      window.dispatchEvent(new CustomEvent('fyntrac:open:recon', { detail: { id, initialTab: 3 } }));
    } catch (e) {
      window.alert('Run failed: ' + (e.response?.data?.error || e.message));
    } finally { setRunningId(null); }
  };

  const openRecon = (id) => {
    window.dispatchEvent(new CustomEvent('fyntrac:open:recon', {
      detail: { id: id || null, isNew: !id },
    }));
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h2">Reconciliations</Typography>
          <Typography variant="body2" color="text.secondary">
            Compare any two datasets — or a dataset against an uploaded CSV — and surface variances.
          </Typography>
        </Box>
        <Tooltip title="New Reconciliation">
          <IconButton
            onClick={() => openRecon(null)}
            sx={{
              bgcolor: 'primary.main', color: '#fff', borderRadius: 2,
              '&:hover': { bgcolor: 'primary.dark' },
            }}
          >
            <AddIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {loading && <Typography color="text.secondary">Loading…</Typography>}
      {!loading && recons.length === 0 && (
        <Card variant="outlined" sx={{ p: 4, textAlign: 'center', mt: 4 }}>
          <CompareArrowsIcon sx={{ fontSize: 56, color: 'text.disabled' }} />
          <Typography variant="h4" sx={{ mt: 1 }}>No reconciliations yet</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Upload a CSV or pick two datasets and tell us which columns identify the same row.
          </Typography>
          <Button variant="contained" onClick={() => openRecon(null)}>Create your first recon</Button>
        </Card>
      )}

      <Grid container spacing={2}>
        {recons.map((r) => {
          const a = r.sourceA?.displayName || r.sourceA?.kind || '?';
          const b = r.sourceB?.displayName || r.sourceB?.kind || '?';
          const summary = r.lastRun?.summary?.rowCounts;
          const summaryLine = summary
            ? ` \u00b7 \u2713 ${summary.matched} matched \u00b7 \u0394 ${summary.mismatched} diff`
            : '';
          const desc = (r.description ? `${r.description}\n` : '') + `A: ${a}  \u2194  B: ${b}${summaryLine}`;
          return (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={r._id}>
              <EntityCard
                category="Reconciliation"
                title={r.name}
                description={desc}
                ctaLabel="Open Reconciliation"
                onClick={() => openRecon(r._id)}
                actions={
                  <>
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); openRecon(r._id); }} sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary', bgcolor: 'action.hover' } }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={runningId === r._id ? 'Running…' : 'Run now'}>
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); run(r._id); }} disabled={!!runningId} sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary', bgcolor: 'action.hover' } }}>
                        {runningId === r._id
                          ? <CircularProgress size={14} sx={{ color: 'text.disabled' }} />
                          : <PlayArrowIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: r._id, name: r.name }); }} sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary', bgcolor: 'action.hover' } }}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>
                }
              />
            </Grid>
          );
        })}
      </Grid>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        PaperProps={{ sx: { borderRadius: 3, p: 0.5 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Delete reconciliation?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <strong>{deleteTarget?.name}</strong> and all its run history will be permanently deleted.
            This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            onClick={() => setDeleteTarget(null)}
            variant="outlined"
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => remove(deleteTarget.id)}
            variant="contained"
            color="error"
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
