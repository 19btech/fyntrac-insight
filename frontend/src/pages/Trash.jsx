import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableHead, TableRow,
  IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  Fade, Paper,
} from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import api from '../hooks/useQuery';

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
    await api.post(`/trash/${item._type}/${item._id}/restore`);
    load();
  };

  const permaDelete = async (item) => {
    if (!window.confirm(`Permanently delete "${item.name}"? This cannot be undone.`)) return;
    await api.delete(`/trash/${item._type}/${item._id}`);
    load();
  };

  const emptyTrash = async () => {
    await api.post('/trash/empty');
    setConfirmEmpty(false);
    load();
  };

  return (
    <Fade in={mounted} timeout={400}>
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: 2, bgcolor: '#fef2f2',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <DeleteOutlineIcon sx={{ fontSize: 20, color: '#dc2626' }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" fontWeight={700} color="#0f172a">Trash</Typography>
            <Typography variant="body2" color="text.secondary">
              Items here are kept until you permanently delete them or empty the trash.
            </Typography>
          </Box>
          <Button
            startIcon={<DeleteSweepIcon />}
            onClick={() => setConfirmEmpty(true)}
            disabled={items.length === 0}
            sx={{
              borderRadius: 2, fontWeight: 600, textTransform: 'none', boxShadow: 'none',
              bgcolor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
              '&:hover': { bgcolor: '#fee2e2', borderColor: '#fca5a5', boxShadow: 'none' },
              '&.Mui-disabled': { bgcolor: '#fef2f2', color: '#fca5a5', borderColor: '#fee2e2' },
            }}
          >
            Empty trash
          </Button>
        </Box>

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
                          <IconButton size="small" onClick={() => permaDelete(item)} sx={{
                            color: '#dc2626', bgcolor: '#fef2f2', width: 28, height: 28,
                            '&:hover': { bgcolor: '#fee2e2' },
                          }}>
                            <DeleteForeverIcon sx={{ fontSize: 16 }} />
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
          <DialogTitle sx={{ fontWeight: 700, color: '#0f172a', pb: 1 }}>Empty trash?</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary">
              This permanently deletes{' '}
              <strong>{items.length} item{items.length === 1 ? '' : 's'}</strong>. This cannot be undone.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
            <Button
              onClick={() => setConfirmEmpty(false)}
              sx={{
                borderRadius: 2, textTransform: 'none', fontWeight: 600, boxShadow: 'none',
                color: '#475569', bgcolor: '#f8fafc', border: '1px solid #e2e8f0',
                '&:hover': { bgcolor: '#e2e8f0', boxShadow: 'none' },
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={emptyTrash}
              sx={{
                borderRadius: 2, textTransform: 'none', fontWeight: 700, boxShadow: 'none',
                bgcolor: '#dc2626', color: '#fff',
                '&:hover': { bgcolor: '#b91c1c', boxShadow: 'none' },
              }}
            >
              Empty trash
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Fade>
  );
}
