import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Button, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  Fade, Paper, Snackbar, Alert,
} from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import api from '../hooks/useQuery';
import AppToast from '../components/shared/AppToast';
import BrandedDialogTitle from '../components/shared/BrandedDialogTitle';
import ADD_BUTTON_SX from '../components/shared/addButtonSx';

const TYPE_CONFIG = {
  dashboard: { label: 'Dashboard', bgcolor: '#eff6ff', color: '#1e40af', border: '#bfdbfe' },
  question:  { label: 'Report',    bgcolor: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  model:     { label: 'Dataset',   bgcolor: '#faf5ff', color: '#7c3aed', border: '#ddd6fe' },
  metric:    { label: 'KPI',       bgcolor: '#fffbeb', color: '#b45309', border: '#fde68a' },
  recon:     { label: 'Recon',     bgcolor: '#f0f9ff', color: '#0369a1', border: '#bae6fd' },
};

export default function TrashPage() {
  const [items, setItems] = useState([]);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [permaTarget, setPermaTarget] = useState(null);
  const [toast, setToast] = useState({ open: false, msg: '', ok: true });

  const showToast = (msg, ok = true) => {
    setToast({ open: true, msg, ok });
    setTimeout(() => setToast((t) => ({ ...t, open: false })), 3000);
  };

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/trash');
      setItems(data);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => { load(); setMounted(true); }, [load]);

  const restore = async (item) => {
    try {
      await api.post(`/trash/${item._type}/${item._id}/restore`);
      load();
      showToast(`"${item.name}" restored successfully`);
    } catch (e) {
      showToast(e.response?.data?.error || 'Restore failed', false);
    }
  };

  const permaDelete = async () => {
    if (!permaTarget) return;
    try {
      await api.delete(`/trash/${permaTarget._type}/${permaTarget._id}`);
      const name = permaTarget.name;
      setPermaTarget(null);
      load();
      showToast(`"${name}" permanently deleted`);
    } catch (e) {
      setPermaTarget(null);
      showToast(e.response?.data?.error || 'Delete failed', false);
    }
  };

  const emptyTrash = async () => {
    try {
      await api.post('/trash/empty');
      setConfirmEmpty(false);
      load();
      showToast('Trash emptied successfully');
    } catch (e) {
      showToast(e.response?.data?.error || 'Failed to empty trash', false);
    }
  };

  return (
    <Fade in={mounted} timeout={400}>
      <Box>
        {/* Header */}
        <Stack direction="row" alignItems="center" justifyContent="space-between"
          sx={{ pt: 1.5, pl: 1.5, pb: 2, mb: 4, borderBottom: '1.5px solid rgba(148, 163, 184, 0.2)' }}>
          <Typography variant="h5" sx={{ fontWeight: 600, letterSpacing: '-0.5px', color: 'text.primary' }}>Trash</Typography>
          <Tooltip title="Empty trash">
            <span>
              <IconButton
                onClick={() => setConfirmEmpty(true)}
                disabled={items.length === 0}
                sx={ADD_BUTTON_SX}
              >
                <DeleteSweepIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>

        {items.length === 0 ? (
          <Paper variant="outlined" sx={{ borderRadius: 2, py: 10, textAlign: 'center', bgcolor: '#fafafa' }}>
            <DeleteOutlineIcon sx={{ fontSize: 52, color: '#cbd5e1', mb: 1.5 }} />
            <Typography variant="body1" fontWeight={600} color="text.secondary">Trash is empty</Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>Nothing to see here.</Typography>
          </Paper>
        ) : (
          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  {['Name', 'Type', 'Archived', 'Actions'].map((h, i) => (
                    <TableCell
                      key={h}
                      align={i === 3 ? 'right' : 'left'}
                      sx={{ fontWeight: 700, color: '#475569', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.5 }}
                    >
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => {
                  const cfg = TYPE_CONFIG[item._type] || { label: item._type, bgcolor: '#f8fafc', color: '#475569', border: '#e2e8f0' };
                  return (
                    <TableRow key={`${item._type}-${item._id}`} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                      <TableCell sx={{ fontWeight: 600, color: '#0f172a' }}>{item.name}</TableCell>
                      <TableCell>
                        <Box component="span" sx={{
                          display: 'inline-flex', alignItems: 'center',
                          px: 1, py: 0.25, fontSize: '0.72rem', fontWeight: 600,
                          borderRadius: 1, bgcolor: cfg.bgcolor, color: cfg.color, border: `1px solid ${cfg.border}`,
                        }}>
                          {cfg.label}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                        {item.archivedAt ? new Date(item.archivedAt).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Restore">
                          <IconButton size="small" onClick={() => restore(item)} sx={{
                            color: '#1e40af', bgcolor: '#eff6ff', mr: 0.5, width: 28, height: 28,
                            '&:hover': { bgcolor: '#dbeafe' },
                          }}>
                            <RestoreIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete permanently">
                          <IconButton size="small" onClick={() => setPermaTarget(item)} sx={{
                            width: 32, height: 32, borderRadius: 1.5,
                            color: '#94a3b8',
                            '&:hover': { color: '#dc2626', bgcolor: '#fef2f2' },
                          }}>
                            <DeleteOutlineIcon sx={{ fontSize: 17 }} />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>
        )}

        {/* Confirm dialog */}
        <Dialog
          open={confirmEmpty}
          onClose={() => setConfirmEmpty(false)}
          maxWidth="xs"
          PaperProps={{ sx: { borderRadius: 2 } }}
        >
          <BrandedDialogTitle label="Trash" title="Empty Trash" onClose={() => setConfirmEmpty(false)} />
          <DialogContent>
            <Typography variant="body2" color="text.secondary">
              This permanently deletes{' '}
              <strong>{items.length} item{items.length === 1 ? '' : 's'}</strong>. This cannot be undone.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={emptyTrash} sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, boxShadow: 'none', bgcolor: '#14213d', color: '#fff', '&:hover': { bgcolor: '#0a1628', boxShadow: 'none' } }}>
              Empty trash
            </Button>
          </DialogActions>
        </Dialog>

        {/* Permanent delete confirm dialog */}
        <Dialog open={!!permaTarget} onClose={() => setPermaTarget(null)} maxWidth="xs" PaperProps={{ sx: { borderRadius: 2 } }}>
          <BrandedDialogTitle label="Trash" title="Permanently Delete" onClose={() => setPermaTarget(null)} />
          <DialogContent>
            <Typography variant="body2" color="text.secondary">
              <strong>{permaTarget?.name}</strong> will be permanently deleted. This cannot be undone.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={permaDelete} sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, boxShadow: 'none', bgcolor: '#14213d', color: '#fff', '&:hover': { bgcolor: '#0a1628', boxShadow: 'none' } }}>
              Delete permanently
            </Button>
          </DialogActions>
        </Dialog>

        <AppToast open={toast.open} onClose={() => setToast((t) => ({ ...t, open: false }))} message={toast.msg} severity={toast.ok ? 'success' : 'error'} />
      </Box>
    </Fade>
  );
}
