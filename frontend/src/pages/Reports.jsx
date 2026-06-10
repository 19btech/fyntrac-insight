import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Grid, Card, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, Skeleton, Stack,
  Snackbar, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import api from '../hooks/useQuery';
import useDelayedFlag from '../hooks/useDelayedFlag';
import EntityCard from '../components/shared/EntityCard';
import ADD_BUTTON_SX from '../components/shared/addButtonSx';
import ReportPreviewDialog from '../components/reports/ReportPreviewDialog';
import AppToast from '../components/shared/AppToast';
import BrandedDialogTitle from '../components/shared/BrandedDialogTitle';

export default function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const showSkeleton = useDelayedFlag(loading);
  const [previewId, setPreviewId] = useState(null);
  const [previewNew, setPreviewNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

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
      const name = deleteTarget.name;
      setDeleteTarget(null);
      setDeleteError('');
      reload();
      setSuccessMsg(`"${name}" moved to Trash`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      setDeleteError(e.response?.data?.error || e.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between"
        sx={{ pt: 1.5, pl: 1.5, pb: 2, mb: 4, borderBottom: '1.5px solid rgba(148, 163, 184, 0.2)' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600, letterSpacing: '-0.5px', color: 'text.primary' }}>Reports</Typography>
        </Box>
        <Tooltip title="New Report">
          <IconButton
            onClick={() => { setPreviewId(null); setPreviewNew(true); }}
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
        <Box sx={{ minHeight: 200 }} />
      ) : reports.length === 0 ? (
        <Card elevation={0} sx={{ textAlign: 'center', py: 10, px: 4, borderRadius: 4, border: '1px solid #E5E7EB', bgcolor: '#FFFFFF' }}>
          <Stack alignItems="center" spacing={1.5}>
            <QuestionAnswerIcon sx={{ fontSize: 40, color: '#94A3B8' }} />
            <Typography sx={{ fontFamily: 'Inter', fontSize: '1rem', fontWeight: 600, color: '#64748B', textAlign: 'center' }}>No reports to display</Typography>
            <Typography variant="body2" sx={{ fontFamily: 'Inter', fontSize: '0.875rem', fontWeight: 400, color: '#94A3B8', maxWidth: 340, textAlign: 'center' }}>
              Use the + button above to create your first report.
            </Typography>
          </Stack>
        </Card>
      ) : (
        <Grid container spacing={3}>
          {reports.map((r, idx) => (
            <Grid size={{ xs: 12, md: 6, lg: 4 }} key={r._id} sx={{ display: 'flex' }}>
              <EntityCard index={idx}
                category="Report"
                title={r.name}
                description={r.description}
                ctaLabel="View Report"
                onClick={() => { setPreviewId(r._id); setPreviewNew(false); }}
                actions={
                  <>
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
        <BrandedDialogTitle label="Report" title="Delete Report" onClose={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(''); } }} />
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

      <ReportPreviewDialog
        open={previewNew || !!previewId}
        reportId={previewId}
        isNew={previewNew}
        onClose={() => { setPreviewId(null); setPreviewNew(false); }}
        onSaved={() => { reload(); setPreviewNew(false); }}
      />

      <AppToast open={!!successMsg} onClose={() => setSuccessMsg('')} message={successMsg} />
    </Box>
  );
}
