import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Grid, Card, CardContent, IconButton, CardActionArea, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions, Skeleton, Tooltip, Snackbar,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VerifiedIcon from '@mui/icons-material/Verified';
import TableChartIcon from '@mui/icons-material/TableChart';
import JoinFullIcon from '@mui/icons-material/JoinFull';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import api from '../hooks/useQuery';
import useDelayedFlag from '../hooks/useDelayedFlag';
import EntityCard from '../components/shared/EntityCard';
import ADD_BUTTON_SX from '../components/shared/addButtonSx';
import DatasetPreviewDialog from '../components/datasets/DatasetPreviewDialog';
import AppToast from '../components/shared/AppToast';
import BrandedDialogTitle from '../components/shared/BrandedDialogTitle';

function StarterGallery({ open, onClose, onPick }) {
  const tiles = [
    { key: 'blank', icon: <TableChartIcon />, title: 'Blank dataset', desc: 'Start from a single source table.' },
    { key: 'combine', icon: <JoinFullIcon />, title: 'Combine two tables', desc: 'Join two tables on a shared key.' },
    { key: 'rollup', icon: <CalendarMonthIcon />, title: 'Roll up by period', desc: 'Group rows by month / quarter / year.' },
    { key: 'fromQuestion', icon: <QuestionAnswerIcon />, title: 'From an existing report', desc: 'Convert a saved report into a reusable dataset.' },
  ];
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <BrandedDialogTitle label="Dataset" title="How would you like to start?" onClose={onClose} />
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          {tiles.map((t) => (
            <Grid size={{ xs: 12, sm: 6 }} key={t.key}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardActionArea onClick={() => onPick(t.key)} sx={{ p: 2, height: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ width: 40, height: 40, borderRadius: 1.5, bgcolor: 'primary.main', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {t.icon}
                    </Box>
                    <Box>
                      <Typography variant="subtitle1" fontWeight={700}>{t.title}</Typography>
                      <Typography variant="body2" color="text.secondary">{t.desc}</Typography>
                    </Box>
                  </Box>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      </DialogContent>
    </Dialog>
  );
}

function PickQuestionDialog({ open, onClose, onPick }) {
  const [questions, setQuestions] = useState([]);
  useEffect(() => {
    if (!open) return;
    api.get('/questions').then((r) => setQuestions(r.data)).catch(() => setQuestions([]));
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <BrandedDialogTitle label="Dataset" title="Pick a report" onClose={onClose} />
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {questions.map((q) => (
            <Button key={q._id} onClick={() => onPick(q)} sx={{ justifyContent: 'flex-start', textTransform: 'none' }}>
              {q.name}
            </Button>
          ))}
          {questions.length === 0 && <Typography color="text.secondary" variant="body2">No reports yet.</Typography>}
        </Box>
      </DialogContent>
    </Dialog>
  );
}

function DatasetCard({ model, onEdit, onDelete }) {
  const subtitle = model.description || '';
  const titleNode = (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{model.name}</Box>
      {model.verified && (
        <Tooltip title="Certified by Finance">
          <VerifiedIcon sx={{ color: '#10b981', fontSize: 16 }} />
        </Tooltip>
      )}
    </Box>
  );
  return (
    <EntityCard
      category={model.verified ? 'Certified Dataset' : 'Dataset'}
      title={titleNode}
      description={subtitle}
      ctaLabel="Open Dataset"
      onClick={() => onEdit(model)}
      actions={
        <Tooltip title="Delete">
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete(model); }} sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary', bgcolor: 'action.hover' } }}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      }
    />
  );
}

export default function ModelsPage() {
  const navigate = useNavigate(); // kept for any external callers; modal handles in-page editing
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const showSkeleton = useDelayedFlag(loading);
  const [loadError, setLoadError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState({ open: false, msg: '', ok: true });

  const showToast = (msg, ok = true) => {
    setToast({ open: true, msg, ok });
    setTimeout(() => setToast((t) => ({ ...t, open: false })), 3000);
  };
  const [starterOpen, setStarterOpen] = useState(false);
  const [pickQuestionOpen, setPickQuestionOpen] = useState(false);
  // Modal state — drives both viewing an existing dataset and creating a new one.
  const [previewId, setPreviewId] = useState(null);
  const [previewNew, setPreviewNew] = useState(false);
  const [previewStarter, setPreviewStarter] = useState(null);

  const reload = () => {
    setLoading(true);
    api.get('/models')
      .then((r) => setModels(r.data))
      .catch((e) => setLoadError(e?.response?.data?.error || 'Failed to load datasets'))
      .finally(() => setLoading(false));
  };
  useEffect(reload, []);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const name = deleteTarget.name;
      await api.delete(`/models/${deleteTarget._id}`);
      setDeleteTarget(null);
      reload();
      showToast(`"${name}" deleted successfully`);
    } catch (e) {
      setDeleteTarget(null);
      showToast(e?.response?.data?.error || 'Failed to delete dataset', false);
    }
  };
  const editModel = (m) => { setPreviewNew(false); setPreviewStarter(null); setPreviewId(m._id); };

  const handleStarterPick = (kind) => {
    setStarterOpen(false);
    if (kind === 'fromQuestion') { setPickQuestionOpen(true); return; }
    setPreviewId(null);
    setPreviewStarter(kind === 'blank' ? null : kind);
    setPreviewNew(true);
  };

  const closePreview = () => { setPreviewId(null); setPreviewNew(false); setPreviewStarter(null); };

  return (
    <Box>
      <AppToast open={!!loadError} onClose={() => setLoadError('')} message={loadError} severity="error" />
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1.5, pl: 1.5, pb: 2, mb: 4, borderBottom: '1.5px solid rgba(148, 163, 184, 0.2)' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600, letterSpacing: '-0.5px', color: 'text.primary' }}>Datasets</Typography>
        </Box>
        <Tooltip title="New Dataset">
          <IconButton
            onClick={() => { setPreviewId(null); setPreviewStarter(null); setPreviewNew(true); }}
            sx={ADD_BUTTON_SX}
          >
            <AddIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {showSkeleton && (
        <Grid container spacing={3}>
          {[1, 2, 3, 4].map((i) => (<Grid key={i} size={{ xs: 12, md: 6, lg: 4 }}><Skeleton variant="rounded" height={200} /></Grid>))}
        </Grid>
      )}
      {loading && !showSkeleton && <Box sx={{ minHeight: 200 }} />}
      {!loading && models.length === 0 && (
        <Card elevation={0} sx={{ textAlign: 'center', py: 10, px: 4, borderRadius: 4, border: '1px solid #E5E7EB', bgcolor: '#FFFFFF' }}>
          <Stack alignItems="center" spacing={1.5}>
            <TableChartIcon sx={{ fontSize: 40, color: '#94A3B8' }} />
            <Typography sx={{ fontFamily: 'Inter', fontSize: '1rem', fontWeight: 600, color: '#64748B', textAlign: 'center' }}>No datasets to display</Typography>
            <Typography variant="body2" sx={{ fontFamily: 'Inter', fontSize: '0.875rem', fontWeight: 400, color: '#94A3B8', maxWidth: 340, textAlign: 'center' }}>
              Use the + button above to create your first dataset.
            </Typography>
          </Stack>
        </Card>
      )}
      {!loading && models.length > 0 && (
        <Grid container spacing={3}>
          {models.map((m) => (
            <Grid size={{ xs: 12, md: 6, lg: 4 }} key={m._id} sx={{ display: 'flex' }}>
              <DatasetCard model={m} onEdit={editModel} onDelete={setDeleteTarget} />
            </Grid>
          ))}
        </Grid>
      )}

      <StarterGallery open={starterOpen} onClose={() => setStarterOpen(false)} onPick={handleStarterPick} />
      <PickQuestionDialog
        open={pickQuestionOpen}
        onClose={() => setPickQuestionOpen(false)}
        onPick={(q) => { setPickQuestionOpen(false); navigate(`/dataset/new?fromQuestion=${q._id}`); }}
      />

      <DatasetPreviewDialog
        open={!!previewId || previewNew}
        datasetId={previewId}
        isNew={previewNew}
        starter={previewStarter}
        onClose={closePreview}
        onSaved={(ds) => { reload(); setPreviewNew(false); setPreviewStarter(null); setPreviewId(ds?._id || null); }}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs">
        <BrandedDialogTitle label="Dataset" title="Delete Dataset" onClose={() => setDeleteTarget(null)} />
        <DialogContent>
          <Typography>Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={confirmDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>

      <AppToast open={toast.open} onClose={() => setToast((t) => ({ ...t, open: false }))} message={toast.msg} severity={toast.ok ? 'success' : 'error'} />
    </Box>
  );
}
