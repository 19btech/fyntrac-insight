import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Grid, Card, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, Skeleton, Stack,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import api from '../hooks/useQuery';
import EntityCard from '../components/shared/EntityCard';
import ReportPreviewDialog from '../components/reports/ReportPreviewDialog';

export default function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewId, setPreviewId] = useState(null);
  const [previewNew, setPreviewNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const reload = () => {
    setLoading(true);
    api.get('/questions')
      .then((r) => setReports(r.data || []))
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    // Handle deep-link dispatch from QuestionEditor redirect shim.
    const handler = (e) => {
      if (e.detail?.isNew) { setPreviewId(null); setPreviewNew(true); }
      else if (e.detail?.id) { setPreviewId(e.detail.id); setPreviewNew(false); }
    };
    window.addEventListener('fyntrac:open:report', handler);
    return () => window.removeEventListener('fyntrac:open:report', handler);
  }, []);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/questions/${deleteTarget._id}`);
      setDeleteTarget(null);
      setDeleteError('');
      reload();
    } catch (e) {
      setDeleteError(e.response?.data?.error || e.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h2">Reports</Typography>
          <Typography variant="body2" color="text.secondary">
            Build, save, and share answers to your data questions.
          </Typography>
        </Box>
        <Tooltip title="New Report">
          <IconButton
            onClick={() => { setPreviewId(null); setPreviewNew(true); }}
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
      ) : reports.length === 0 ? (
        <Card variant="outlined" sx={{ p: 4, textAlign: 'center', mt: 4 }}>
          <QuestionAnswerIcon sx={{ fontSize: 56, color: 'text.disabled' }} />
          <Typography variant="h4" sx={{ mt: 1 }}>No reports yet</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Pick a dataset, slice and filter the rows, and save the answer as a reusable report.
          </Typography>
          <Button variant="contained" onClick={() => { setPreviewId(null); setPreviewNew(true); }}>Create your first report</Button>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {reports.map((r) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={r._id}>
              <EntityCard
                category="Report"
                title={r.name}
                description={r.description}
                ctaLabel="View Report"
                onClick={() => { setPreviewId(r._id); setPreviewNew(false); }}
                actions={
                  <>
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); setPreviewId(r._id); setPreviewNew(false); }}
                        sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary', bgcolor: 'action.hover' } }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete Report">
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }}
                        sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary', bgcolor: 'action.hover' } }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>
                }
              />
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog open={!!deleteTarget} onClose={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(''); } }} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Report?</DialogTitle>
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

      <ReportPreviewDialog
        open={previewNew || !!previewId}
        reportId={previewId}
        isNew={previewNew}
        onClose={() => { setPreviewId(null); setPreviewNew(false); }}
        onSaved={() => { reload(); setPreviewNew(false); }}
      />
    </Box>
  );
}
