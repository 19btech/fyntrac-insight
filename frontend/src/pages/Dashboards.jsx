import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Typography, Grid, Card, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, Skeleton, Stack,
  Snackbar, Alert, TextField,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DashboardIcon from '@mui/icons-material/Dashboard';
import api from '../hooks/useQuery';
import useDelayedFlag from '../hooks/useDelayedFlag';
import EntityCard from '../components/shared/EntityCard';
import ADD_BUTTON_SX from '../components/shared/addButtonSx';
import AppToast from '../components/shared/AppToast';
import BrandedDialogTitle from '../components/shared/BrandedDialogTitle';

export default function DashboardsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [dashboards, setDashboards] = useState([]);
  const [loading, setLoading] = useState(true);
  const showSkeleton = useDelayedFlag(loading);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [toast, setToast] = useState({ open: false, msg: '', ok: true });
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState('');

  const showToast = (msg, ok = true) => {
    setToast({ open: true, msg, ok });
    setTimeout(() => setToast((t) => ({ ...t, open: false })), 3000);
  };

  const reload = () => {
    setLoading(true);
    api.get('/dashboards')
      .then((r) => setDashboards(r.data || []))
      .catch(() => setDashboards([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  // Show a toast handed off from the dashboard editor on save, then clear the
  // navigation state so it doesn't re-fire on refresh/back.
  useEffect(() => {
    if (location.state?.toast) {
      showToast(location.state.toast);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const name = deleteTarget.name;
      await api.delete(`/dashboards/${deleteTarget._id}`);
      setDeleteTarget(null);
      setDeleteError('');
      reload();
      showToast(`"${name}" moved to Trash`);
    } catch (e) {
      setDeleteError(e.response?.data?.error || e.message || 'Delete failed');
      showToast(e.response?.data?.error || 'Delete failed', false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between"
        sx={{ pt: 1.5, pl: 1.5, pb: 2, mb: 4, borderBottom: '1.5px solid rgba(148, 163, 184, 0.2)' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600, letterSpacing: '-0.5px', color: 'text.primary' }}>Dashboards</Typography>
        </Box>
        <Tooltip title="New Dashboard">
          <IconButton
            onClick={() => { setNewDashboardName(''); setCreateModalOpen(true); }}
            sx={ADD_BUTTON_SX}
          >
            <AddIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {showSkeleton ? (
        <Grid container spacing={3}>
          {[1, 2, 3].map((i) => <Grid key={i} size={{ xs: 12, md: 6, lg: 4 }}><Skeleton variant="rounded" height={200} /></Grid>)}
        </Grid>
      ) : loading ? (
        // Brief gap before the skeleton threshold — stay blank so fast loads
        // don't flash skeletons or the empty state.
        <Box sx={{ minHeight: 200 }} />
      ) : dashboards.length === 0 ? (
        <Card elevation={0} sx={{ textAlign: 'center', py: 10, px: 4, borderRadius: 4, border: '1px solid #E5E7EB', bgcolor: '#FFFFFF' }}>
          <Stack alignItems="center" spacing={1.5}>
            <DashboardIcon sx={{ fontSize: 40, color: '#94A3B8' }} />
            <Typography sx={{ fontFamily: 'Inter', fontSize: '1rem', fontWeight: 600, color: '#64748B', textAlign: 'center' }}>No dashboards to display</Typography>
            <Typography variant="body2" sx={{ fontFamily: 'Inter', fontSize: '0.875rem', fontWeight: 400, color: '#94A3B8', maxWidth: 340, textAlign: 'center' }}>
              Use the + button above to create your first dashboard.
            </Typography>
          </Stack>
        </Card>
      ) : (
        <Grid container spacing={3}>
          {dashboards.map((d, idx) => (
            <Grid size={{ xs: 12, md: 6, lg: 4 }} key={d._id} sx={{ display: 'flex' }}>
              <EntityCard index={idx}
                category="Dashboard"
                title={d.name}
                description={d.description}
                ctaLabel="Open Dashboard"
                onClick={() => navigate(`/dashboard/${d._id}`)}
                actions={
                  <Tooltip title="Delete Dashboard">
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(d); }}
                      sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary', bgcolor: 'action.hover' } }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                }
              />
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog open={!!deleteTarget} onClose={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(''); } }} maxWidth="xs" fullWidth>
        <BrandedDialogTitle label="Dashboard" title="Delete Dashboard" onClose={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(''); } }} />
        <DialogContent>
          <DialogContentText>
            You are about to delete <strong>{deleteTarget?.name}</strong>. It will be moved to Trash where you can restore it for 30 days.
          </DialogContentText>
          {deleteError && <Typography color="error" variant="body2" sx={{ mt: 1.5 }}>{deleteError}</Typography>}
        </DialogContent>
        <DialogActions>
          <Button color="inherit" variant="contained" onClick={confirmDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <BrandedDialogTitle label="Dashboard" title="New Dashboard" onClose={() => setCreateModalOpen(false)} />
        <DialogContent sx={{ pt: 3, pb: 1 }}>
          <TextField
            autoFocus
            fullWidth
            label="Dashboard name"
            placeholder="e.g. Revenue Overview"
            value={newDashboardName}
            onChange={(e) => setNewDashboardName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newDashboardName.trim()) {
                setCreateModalOpen(false);
                navigate('/dashboard/new', { state: { name: newDashboardName.trim() } });
              }
            }}
            sx={{ mt: 0.5 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 1.5 }}>
          <Button
            variant="contained"
            disabled={!newDashboardName.trim()}
            onClick={() => {
              setCreateModalOpen(false);
              navigate('/dashboard/new', { state: { name: newDashboardName.trim() } });
            }}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, boxShadow: 'none', bgcolor: '#14213D', '&:hover': { bgcolor: '#0e172b', boxShadow: 'none' } }}
          >
            Create Dashboard
          </Button>
        </DialogActions>
      </Dialog>

      <AppToast open={toast.open} onClose={() => setToast((t) => ({ ...t, open: false }))} message={toast.msg} severity={toast.ok ? 'success' : 'error'} />
    </Box>
  );
}
