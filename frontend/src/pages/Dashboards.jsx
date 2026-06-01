import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Grid, Card, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, Skeleton, Stack,
  Snackbar, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DashboardIcon from '@mui/icons-material/Dashboard';
import api from '../hooks/useQuery';
import EntityCard from '../components/shared/EntityCard';

export default function DashboardsPage() {
  const navigate = useNavigate();
  const [dashboards, setDashboards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [toast, setToast] = useState({ open: false, msg: '', ok: true });

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
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h2">Dashboards</Typography>
          <Typography variant="body2" color="text.secondary">
            Pin reports and KPIs together to monitor what matters.
          </Typography>
        </Box>
        <Tooltip title="New Dashboard">
          <IconButton
            onClick={() => navigate('/dashboard/new')}
            sx={{ bgcolor: 'primary.main', color: '#fff', borderRadius: 2, '&:hover': { bgcolor: 'primary.dark' } }}
          >
            <AddIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {loading ? (
        <Grid container spacing={2}>
          {[1, 2, 3].map((i) => <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}><Skeleton variant="rounded" height={140} /></Grid>)}
        </Grid>
      ) : dashboards.length === 0 ? (
        <Card variant="outlined" sx={{ p: 4, textAlign: 'center', mt: 4 }}>
          <DashboardIcon sx={{ fontSize: 56, color: 'text.disabled' }} />
          <Typography variant="h4" sx={{ mt: 1 }}>No dashboards yet</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Group your reports and KPIs into a single view that tells a story.
          </Typography>
          <Button variant="contained" onClick={() => navigate('/dashboard/new')}>Create your first dashboard</Button>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {dashboards.map((d) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={d._id}>
              <EntityCard
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
        <DialogTitle>Delete Dashboard?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You are about to delete <strong>{deleteTarget?.name}</strong>. It will be moved to Trash where you can restore it for 30 days.
          </DialogContentText>
          {deleteError && <Typography color="error" variant="body2" sx={{ mt: 1.5 }}>{deleteError}</Typography>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteTarget(null); setDeleteError(''); }} disabled={deleting}>Cancel</Button>
          <Button color="inherit" variant="contained" onClick={confirmDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        autoHideDuration={3000}
      >
        <Alert
          severity={toast.ok ? 'success' : 'error'}
          variant="filled"
          icon={false}
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          sx={toast.ok
            ? { bgcolor: '#dcfce7', color: '#166534', fontWeight: 600, border: '1px solid #bbf7d0', '& .MuiAlert-action': { color: '#166534' } }
            : { bgcolor: '#fee2e2', color: '#991b1b', fontWeight: 600, border: '1px solid #fecaca', '& .MuiAlert-action': { color: '#991b1b' } }}
        >
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
