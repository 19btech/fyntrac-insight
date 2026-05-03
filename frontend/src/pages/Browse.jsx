import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Grid, Card, Tabs, Tab,
  IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button,
  Stack,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import FolderIcon from '@mui/icons-material/Folder';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import api from '../hooks/useQuery';
import ReportPreviewDialog from '../components/reports/ReportPreviewDialog';
import EntityCard from '../components/shared/EntityCard';
import usePageTitleStore from '../store/pageTitleStore';

export default function Browse() {
  const [searchParams] = useSearchParams();
  const typeParam = searchParams.get('type') || 'all';
  const tabKeys = ['all', 'dashboards', 'questions', 'collections'];
  const initialTab = tabKeys.indexOf(typeParam) >= 0 ? tabKeys.indexOf(typeParam) : 0;
  const [tab, setTab] = useState(initialTab);
  // Keep the active tab in sync with the URL query param. Without this,
  // navigating between sidebar links that all share the /browse route
  // (e.g. Dashboards -> Reports) wouldn't update the view because the
  // component stays mounted and useState only honored the initial value.
  useEffect(() => {
    const next = tabKeys.indexOf(typeParam);
    if (next >= 0 && next !== tab) setTab(next);
  }, [typeParam]); // eslint-disable-line
  // When the URL specifies a concrete type (e.g. ?type=questions) we treat
  // this as a dedicated landing page (Reports / Dashboards / Collections) and
  // hide the tabs row entirely. The "All" view (no ?type) keeps the tabs.
  const isFocusedView = typeParam !== 'all' && tabKeys.indexOf(typeParam) > 0;
  const [dashboards, setDashboards] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [collections, setCollections] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null); // { type, item }
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [previewId, setPreviewId] = useState(null); // active report preview modal
  const [previewNew, setPreviewNew] = useState(false); // true => modal opens in "new report" mode
  const [loaded, setLoaded] = useState(false);
  const navigate = useNavigate();

  const reload = () => Promise.all([
    api.get('/dashboards').then((r) => r.data),
    api.get('/questions').then((r) => r.data),
    api.get('/collections').then((r) => r.data),
  ]).then(([d, q, c]) => {
    setDashboards(d);
    setQuestions(q);
    setCollections(c);
    setLoaded(true);
  });

  useEffect(() => { reload(); }, []);

  const tabs = [
    { key: 'all', label: 'All', items: [...dashboards, ...questions, ...collections] },
    { key: 'dashboards', label: 'Dashboards', items: dashboards },
    { key: 'questions', label: 'Reports', items: questions },
    { key: 'collections', label: 'Collections', items: collections },
  ];

  // Per-tab page header (title, description, primary action, empty-state copy).
  const tabMeta = {
    dashboards: {
      title: 'Dashboards',
      description: 'Pin reports and KPIs together to monitor what matters.',
      newLabel: 'New Dashboard',
      onNew: () => navigate('/dashboard/new'),
      emptyIcon: <DashboardIcon sx={{ fontSize: 56, color: 'text.disabled' }} />,
      emptyTitle: 'No dashboards yet',
      emptyBody: 'Group your reports and KPIs into a single view that tells a story.',
      emptyCta: 'Create your first dashboard',
    },
    questions: {
      title: 'Reports',
      description: 'Build, save, and share answers to your data questions.',
      newLabel: 'New Report',
      onNew: () => { setPreviewId(null); setPreviewNew(true); },
      emptyIcon: <QuestionAnswerIcon sx={{ fontSize: 56, color: 'text.disabled' }} />,
      emptyTitle: 'No reports yet',
      emptyBody: 'Pick a dataset, slice and filter the rows, and save the answer as a reusable report.',
      emptyCta: 'Create your first report',
    },
    collections: {
      title: 'Collections',
      description: 'Organize dashboards and reports into folders for your team.',
      newLabel: 'New Collection',
      onNew: async () => {
        await api.post('/collections', { name: 'New Collection' });
        await reload();
      },
      emptyIcon: <FolderIcon sx={{ fontSize: 56, color: 'text.disabled' }} />,
      emptyTitle: 'No collections yet',
      emptyBody: 'Create a collection to group related dashboards and reports.',
      emptyCta: 'Create your first collection',
    },
  };

  // Reflect the active tab in the breadcrumb (Reports / Dashboards / Collections)
  // instead of the generic "Browse".
  const currentMeta = tabMeta[tabs[tab].key];
  const setPageTitle = usePageTitleStore((s) => s.setTitle);
  const clearPageTitle = usePageTitleStore((s) => s.clear);
  useEffect(() => {
    setPageTitle(currentMeta ? currentMeta.title : 'Browse');
    return () => clearPageTitle();
  }, [currentMeta, setPageTitle, clearPageTitle]);

  const getIcon = (item) => {
    if (item.cards !== undefined) return <DashboardIcon sx={{ color: 'primary.main', fontSize: 18 }} />;
    if (item.queryConfig !== undefined) return <QuestionAnswerIcon sx={{ color: 'primary.main', fontSize: 18 }} />;
    return <FolderIcon sx={{ color: item.color || 'primary.main', fontSize: 18 }} />;
  };

  const itemCategory = (item) => {
    const t = itemType(item);
    if (t === 'dashboard') return 'Dashboard';
    if (t === 'question') return 'Report';
    return 'Collection';
  };

  const itemCta = (item) => {
    const t = itemType(item);
    if (t === 'dashboard') return 'Open Dashboard';
    if (t === 'question') return 'View Report';
    return 'Open Collection';
  };

  const itemType = (item) => {
    if (item.cards !== undefined) return 'dashboard';
    if (item.queryConfig !== undefined) return 'question';
    return 'collection';
  };

  // Human-friendly label for dialogs / tooltips.
  const itemLabel = (typeOrItem) => {
    const t = typeof typeOrItem === 'string' ? typeOrItem : itemType(typeOrItem);
    if (t === 'question') return 'Report';
    if (t === 'dashboard') return 'Dashboard';
    return 'Collection';
  };

  const getPath = (item) => {
    const t = itemType(item);
    if (t === 'dashboard') return `/dashboard/${item._id}`;
    if (t === 'question') return `/question/${item._id}`;
    return `/collection/${item._id}`;
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const t = deleteTarget.type;
      const idVal = deleteTarget.item._id;
      // Soft-delete via the dedicated route per type — moves the item to Trash.
      const path = t === 'dashboard' ? `/dashboards/${idVal}`
        : t === 'question' ? `/questions/${idVal}`
        : `/collections/${idVal}`;
      await api.delete(path);
      setDeleteTarget(null);
      setDeleteError('');
      await reload();
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
          <Typography variant="h2">{currentMeta ? currentMeta.title : 'Browse'}</Typography>
          {currentMeta && (
            <Typography variant="body2" color="text.secondary">
              {currentMeta.description}
            </Typography>
          )}
        </Box>
        {currentMeta && (
          <Tooltip title={currentMeta.newLabel}>
            <IconButton
              onClick={currentMeta.onNew}
              sx={{
                bgcolor: 'primary.main', color: '#fff', borderRadius: 2,
                '&:hover': { bgcolor: 'primary.dark' },
              }}
            >
              <AddIcon />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, display: isFocusedView ? 'none' : 'flex' }}>
        {tabs.map((t) => <Tab key={t.label} label={`${t.label} (${t.items.length})`} />)}
      </Tabs>
      {currentMeta && loaded && tabs[tab].items.length === 0 && (
        <Card variant="outlined" sx={{ p: 4, textAlign: 'center', mt: 4 }}>
          {currentMeta.emptyIcon}
          <Typography variant="h4" sx={{ mt: 1 }}>{currentMeta.emptyTitle}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {currentMeta.emptyBody}
          </Typography>
          <Button variant="contained" onClick={currentMeta.onNew}>{currentMeta.emptyCta}</Button>
        </Card>
      )}
      <Grid container spacing={2}>
        {tabs[tab].items.map((item) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={item._id}>
            <EntityCard
              category={itemCategory(item)}
              title={item.name}
              description={item.description}
              ctaLabel={itemCta(item)}
              onClick={() => {
                if (itemType(item) === 'question') setPreviewId(item._id);
                else navigate(getPath(item));
              }}
              actions={
                <Tooltip title={`Delete ${itemLabel(item)}`}>
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: itemType(item), item }); }}
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

      <Dialog open={!!deleteTarget} onClose={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(''); } }} maxWidth="xs" fullWidth>
        <DialogTitle>Delete {deleteTarget ? itemLabel(deleteTarget.type) : ''}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You are about to delete <strong>{deleteTarget?.item?.name}</strong>. It will be moved to Trash where you can restore it for 30 days.
          </DialogContentText>
          {deleteError && (
            <Typography color="error" variant="body2" sx={{ mt: 1.5 }}>{deleteError}</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteTarget(null); setDeleteError(''); }} disabled={deleting}>Cancel</Button>
          <Button color="inherit" variant="contained" onClick={confirmDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <ReportPreviewDialog
        open={!!previewId || previewNew}
        reportId={previewId}
        isNew={previewNew}
        onClose={() => { setPreviewId(null); setPreviewNew(false); }}
        onSaved={() => { setPreviewNew(false); reload(); }}
      />
    </Box>
  );
}
