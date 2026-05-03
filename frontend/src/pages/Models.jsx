import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Grid, Card, CardContent, IconButton, CardActionArea,
  Dialog, DialogTitle, DialogContent, DialogActions, Skeleton, Tooltip, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import VerifiedIcon from '@mui/icons-material/Verified';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import TableChartIcon from '@mui/icons-material/TableChart';
import JoinFullIcon from '@mui/icons-material/JoinFull';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import api from '../hooks/useQuery';
import EntityCard from '../components/shared/EntityCard';
import DatasetPreviewDialog from '../components/datasets/DatasetPreviewDialog';

function StarterGallery({ open, onClose, onPick }) {
  const tiles = [
    { key: 'blank', icon: <TableChartIcon />, title: 'Blank dataset', desc: 'Start from a single source table.' },
    { key: 'combine', icon: <JoinFullIcon />, title: 'Combine two tables', desc: 'Join two tables on a shared key.' },
    { key: 'rollup', icon: <CalendarMonthIcon />, title: 'Roll up by period', desc: 'Group rows by month / quarter / year.' },
    { key: 'fromQuestion', icon: <QuestionAnswerIcon />, title: 'From an existing report', desc: 'Convert a saved report into a reusable dataset.' },
  ];
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>How would you like to start?</DialogTitle>
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
      <DialogActions><Button onClick={onClose}>Cancel</Button></DialogActions>
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
      <DialogTitle>Pick a report</DialogTitle>
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
      <DialogActions><Button onClick={onClose}>Cancel</Button></DialogActions>
    </Dialog>
  );
}

function DatasetCard({ model, onEdit, onDelete, onTogglePin }) {
  const stepCount = model.steps?.length || model.pipeline?.length || 0;
  const subtitle = model.description
    || `${model.sourceCollection || 'dataset'} · ${stepCount} step${stepCount === 1 ? '' : 's'}`;
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
        <>
          <Tooltip title={model.pinned ? 'Unpin' : 'Pin'}>
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); onTogglePin(model); }} sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary', bgcolor: 'action.hover' } }}>
              {model.pinned
                ? <PushPinIcon fontSize="small" sx={{ color: 'primary.main' }} />
                : <PushPinOutlinedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); onEdit(model); }} sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary', bgcolor: 'action.hover' } }}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete(model); }} sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary', bgcolor: 'action.hover' } }}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </>
      }
    />
  );
}

export default function ModelsPage() {
  const navigate = useNavigate(); // kept for any external callers; modal handles in-page editing
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
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
      await api.delete(`/models/${deleteTarget._id}`);
      setDeleteTarget(null);
      reload();
    } catch (e) {
      setActionError(e?.response?.data?.error || 'Failed to delete dataset');
      setDeleteTarget(null);
    }
  };
  const togglePin = async (m) => {
    try {
      await api.put(`/models/${m._id}`, { pinned: !m.pinned });
      reload();
    } catch (e) {
      setActionError(e?.response?.data?.error || 'Failed to update dataset');
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
      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setLoadError('')}>{loadError}</Alert>
      )}
      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError('')}>{actionError}</Alert>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h2">Datasets</Typography>
          <Typography variant="body2" color="text.secondary">
            Reusable, "blessed" data sources your team can build questions on top of.
          </Typography>
        </Box>
        <Tooltip title="New Dataset">
          <IconButton
            onClick={() => { setPreviewId(null); setPreviewStarter(null); setPreviewNew(true); }}
            sx={{
              bgcolor: 'primary.main', color: '#fff', borderRadius: 2,
              '&:hover': { bgcolor: 'primary.dark' },
            }}
          >
            <AddIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {loading ? (
        <Grid container spacing={2}>
          {[1, 2, 3, 4].map((i) => (<Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}><Skeleton variant="rounded" height={140} /></Grid>))}
        </Grid>
      ) : models.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <Typography color="text.secondary" gutterBottom>No datasets yet.</Typography>
            <Button startIcon={<AddIcon />} variant="outlined" onClick={() => setStarterOpen(true)}>
              Create your first dataset
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {models.map((m) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={m._id}>
              <DatasetCard model={m} onEdit={editModel} onDelete={setDeleteTarget} onTogglePin={togglePin} />
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
        <DialogTitle>Delete dataset?</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
