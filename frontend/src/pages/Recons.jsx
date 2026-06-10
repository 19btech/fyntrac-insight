import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Typography, Button, Grid, Card, IconButton,
  Stack, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogContentText, DialogActions, Snackbar, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import api from '../hooks/useQuery';
import EntityCard from '../components/shared/EntityCard';
import ADD_BUTTON_SX from '../components/shared/addButtonSx';
import AppToast from '../components/shared/AppToast';
import BrandedDialogTitle from '../components/shared/BrandedDialogTitle';

export default function ReconsPage() {
  const [recons, setRecons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name }
  const [toast, setToast] = useState({ open: false, msg: '', ok: true });

  const showToast = (msg, ok = true) => {
    setToast({ open: true, msg, ok });
    setTimeout(() => setToast((t) => ({ ...t, open: false })), 3000);
  };

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
    const name = deleteTarget?.name || '';
    await api.delete(`/recons/${id}`);
    setDeleteTarget(null);
    load();
    showToast(`"${name}" deleted successfully`);
  };


  const openRecon = (id) => {
    window.dispatchEvent(new CustomEvent('fyntrac:open:recon', {
      detail: { id: id || null, isNew: !id },
    }));
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between"
        sx={{ pt: 1.5, pl: 1.5, pb: 2, mb: 4, borderBottom: '1.5px solid rgba(148, 163, 184, 0.2)' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600, letterSpacing: '-0.5px', color: 'text.primary' }}>Reconciliations</Typography>
        </Box>
        <Tooltip title="New Reconciliation">
          <IconButton
            onClick={() => openRecon(null)}
            sx={ADD_BUTTON_SX}
          >
            <AddIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {loading && <Typography color="text.secondary">Loading…</Typography>}
      {!loading && recons.length === 0 && (
        <Card elevation={0} sx={{ textAlign: 'center', py: 10, px: 4, borderRadius: 4, border: '1px solid #E5E7EB', bgcolor: '#FFFFFF' }}>
          <Stack alignItems="center" spacing={1.5}>
            <CompareArrowsIcon sx={{ fontSize: 40, color: '#94A3B8' }} />
            <Typography sx={{ fontFamily: 'Inter', fontSize: '1rem', fontWeight: 600, color: '#64748B', textAlign: 'center' }}>No reconciliations to display</Typography>
            <Typography variant="body2" sx={{ fontFamily: 'Inter', fontSize: '0.875rem', fontWeight: 400, color: '#94A3B8', maxWidth: 340, textAlign: 'center' }}>
              Use the + button above to create your first reconciliation.
            </Typography>
          </Stack>
        </Card>
      )}

      <Grid container spacing={3}>
        {recons.map((r, idx) => {
          const desc = r.description || '';
          return (
            <Grid size={{ xs: 12, md: 6, lg: 4 }} key={r._id} sx={{ display: 'flex' }}>
              <EntityCard index={idx}
                category="Reconciliation"
                title={r.name}
                description={desc}
                ctaLabel="Open Reconciliation"
                onClick={() => openRecon(r._id)}
                actions={
                  <Tooltip title="Delete">
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: r._id, name: r.name }); }} sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary', bgcolor: 'action.hover' } }}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
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
        <BrandedDialogTitle label="Reconciliation" title="Delete Reconciliation" onClose={() => setDeleteTarget(null)} />
        <DialogContent>
          <DialogContentText>
            <strong>{deleteTarget?.name}</strong> and all its run history will be permanently deleted.
            This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => remove(deleteTarget.id)} variant="contained" color="error" sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <AppToast open={toast.open} onClose={() => setToast((t) => ({ ...t, open: false }))} message={toast.msg} severity={toast.ok ? 'success' : 'error'} />
    </Box>
  );
}
