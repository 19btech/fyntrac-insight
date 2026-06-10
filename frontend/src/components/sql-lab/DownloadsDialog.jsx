import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Dialog, Box, Typography, IconButton, List, ListItem, Chip, Stack, Paper,
  CircularProgress, Tooltip, Divider,
} from '@mui/material';
import HighlightOffOutlinedIcon from '@mui/icons-material/HighlightOffOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import api from '../../hooks/useQuery';

const STATUS = {
  pending: { label: 'Queued', color: '#a16207', bg: '#fef9c3' },
  running: { label: 'Generating…', color: '#1d4ed8', bg: '#dbeafe' },
  ready: { label: 'Ready', color: '#15803d', bg: '#dcfce7' },
  failed: { label: 'Failed', color: '#b91c1c', bg: '#fee2e2' },
};

function fmtBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Friendly "Jun 10, 2025, 3:42 PM" for the download timestamp.
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/**
 * Downloads modal — lists this user's CSV export jobs and polls while any are
 * still generating. Branded header + rounded paper match the other Fyntrac
 * dialogs. `refreshKey` bumps whenever a new export starts.
 */
export default function DownloadsDialog({ open, onClose, refreshKey, onActiveCountChange }) {
  const [jobs, setJobs] = useState([]);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/query/exports');
      setJobs(data.jobs || []);
      const active = (data.jobs || []).filter((j) => j.status === 'pending' || j.status === 'running').length;
      onActiveCountChange?.(active);
      return active;
    } catch {
      return 0;
    }
  }, [onActiveCountChange]);

  // Poll while there are active jobs (or the dialog is open). Re-evaluates each
  // tick so it stops once everything is ready/failed.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const active = await load();
      if (cancelled) return;
      if (active > 0 || open) timerRef.current = setTimeout(tick, 2500);
    };
    tick();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [load, open, refreshKey]);

  const download = async (job) => {
    try {
      const res = await api.get(`/query/exports/${job._id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = job.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch { /* failed status surfaces in the row */ }
  };

  const remove = async (job) => {
    try {
      await api.delete(`/query/exports/${job._id}`);
      load();
    } catch { /* ignore */ }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      sx={{ zIndex: (t) => t.zIndex.modal + 20 }}
      PaperProps={{
        sx: {
          // Fixed medium size — stays put as jobs arrive; the list scrolls inside.
          borderRadius: 4, overflow: 'hidden', display: 'flex', flexDirection: 'column',
          height: '70vh', maxHeight: 640, boxShadow: '0 32px 64px rgba(0,0,0,0.16)',
          border: '1px solid', borderColor: 'divider',
        },
      }}
    >
      {/* ── Branded header ── */}
      <Box
        sx={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          px: 3, pt: 3, pb: 2.5, flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(30,64,175,0.05) 0%, rgba(99,102,241,0.04) 100%)',
          borderBottom: '1px solid', borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <img src="/fyntrac9.png" alt="Fyntrac" style={{ width: 64, height: 'auto' }} />
          <Box>
            <Chip
              label="Prism"
              size="small"
              sx={{
                height: 20, fontSize: '0.6rem', fontWeight: 700, letterSpacing: 0.8,
                textTransform: 'uppercase', bgcolor: 'rgba(99, 102, 241, 0.1)',
                color: '#6366F1', mb: 0.5, borderRadius: '8px',
              }}
            />
            <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2, color: 'text.primary' }}>
              Downloads
            </Typography>
          </Box>
        </Box>
        <Tooltip title="Close" placement="left">
          <IconButton
            onClick={onClose}
            size="small"
            sx={{ color: 'text.secondary', bgcolor: 'action.hover', borderRadius: 2, '&:hover': { bgcolor: 'error.50', color: 'error.main' } }}
          >
            <HighlightOffOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* ── Body (scrolls; container height is fixed) ── */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: jobs.length === 0 ? 3 : 0, display: jobs.length === 0 ? 'flex' : 'block', alignItems: 'center' }}>
        {jobs.length === 0 ? (
          <Paper
            elevation={0}
            sx={{ width: '100%', textAlign: 'center', py: 5, px: 4, borderRadius: 4, border: '1px dashed #cbd5e1', bgcolor: '#fff' }}
          >
            <Stack alignItems="center" spacing={1.5}>
              <Box sx={{ width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f1f5f9' }}>
                <DescriptionOutlinedIcon sx={{ fontSize: 32, color: '#94A3B8' }} />
              </Box>
              <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: '#64748B' }}>No exports yet</Typography>
              <Typography variant="body2" sx={{ fontSize: '0.875rem', color: '#94A3B8', maxWidth: 360 }}>
                Click <b>Export CSV</b> on a result to generate a full download — it'll appear here.
              </Typography>
            </Stack>
          </Paper>
        ) : (
          <List disablePadding>
            {jobs.map((job) => {
              const s = STATUS[job.status] || STATUS.pending;
              const isBusy = job.status === 'pending' || job.status === 'running';
              return (
                <React.Fragment key={job._id}>
                  <ListItem sx={{ display: 'block', py: 1.5, px: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <DescriptionOutlinedIcon sx={{ fontSize: 18, color: '#6366f1' }} />
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, flex: 1, color: '#1e293b', wordBreak: 'break-all' }}>
                        {job.fileName}
                      </Typography>
                      {isBusy && <CircularProgress size={14} />}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75, pl: 3.25 }}>
                      <Chip
                        size="small"
                        label={s.label}
                        sx={{ bgcolor: s.bg, color: s.color, fontWeight: 600, fontSize: '0.68rem', height: 20, borderRadius: 1 }}
                      />
                      <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        {job.status === 'ready'
                          ? `${(job.rowCount ?? 0).toLocaleString()} rows · ${fmtBytes(job.fileSize)}`
                          : job.status === 'failed'
                            ? (job.error || 'Failed')
                            : `~${(job.estimatedRows ?? 0).toLocaleString()} rows`}
                      </Typography>
                      {fmtDate(job.completedAt || job.createdAt) && (
                        <Typography sx={{ fontSize: '0.72rem', color: '#cbd5e1', whiteSpace: 'nowrap' }}>
                          · {fmtDate(job.completedAt || job.createdAt)}
                        </Typography>
                      )}
                      <Box sx={{ flex: 1 }} />
                      {job.status === 'ready' && (
                        <Tooltip title="Download">
                          <IconButton size="small" onClick={() => download(job)} sx={{ color: '#4f46e5' }}>
                            <FileDownloadOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Remove">
                        <IconButton size="small" onClick={() => remove(job)} sx={{ color: '#cbd5e1', '&:hover': { color: '#dc2626' } }}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </ListItem>
                  <Divider />
                </React.Fragment>
              );
            })}
          </List>
        )}
      </Box>
    </Dialog>
  );
}
