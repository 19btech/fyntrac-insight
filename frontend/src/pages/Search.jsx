import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, TextField, InputAdornment, List, ListItemButton,
  ListItemIcon, ListItemText, Chip, Tabs, Tab, CircularProgress, Paper,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DashboardIcon from '@mui/icons-material/Dashboard';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import FolderIcon from '@mui/icons-material/Folder';
import ScienceIcon from '@mui/icons-material/Science';
import SpeedIcon from '@mui/icons-material/Speed';
import api from '../hooks/useQuery';

const TYPES = [
  { key: 'dashboard',  label: 'Dashboards', endpoint: '/dashboards',  icon: <DashboardIcon fontSize="small" />, path: (it) => `/dashboard/${it._id}` },
  { key: 'question',   label: 'Reports',    endpoint: '/questions',   icon: <QuestionAnswerIcon fontSize="small" />, path: (it) => `/question/${it._id}` },
  { key: 'collection', label: 'Collections',endpoint: '/collections', icon: <FolderIcon fontSize="small" />, path: (it) => `/collection/${it._id}` },
  { key: 'model',      label: 'Datasets',     endpoint: '/models',      icon: <ScienceIcon fontSize="small" />, path: () => '/models' },
  { key: 'metric',     label: 'KPIs',    endpoint: '/metrics',     icon: <SpeedIcon fontSize="small" />, path: () => '/metrics' },
];

export default function Search() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [tab, setTab] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(
      TYPES.map((t) =>
        api.get(t.endpoint)
          .then((r) => (Array.isArray(r.data) ? r.data : []).map((d) => ({ ...d, __type: t.key })))
          .catch(() => [])
      )
    ).then((lists) => {
      if (cancelled) return;
      setItems(lists.flat());
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Keep URL in sync with query
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (q) next.set('q', q); else next.delete('q');
    setParams(next, { replace: true });
  }, [q]);

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((it) => {
      const hay = [it.name, it.title, it.description, it.label]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(term);
    });
  }, [items, q]);

  const grouped = useMemo(() => {
    const m = Object.fromEntries(TYPES.map((t) => [t.key, []]));
    for (const it of matches) if (m[it.__type]) m[it.__type].push(it);
    return m;
  }, [matches]);

  const counts = TYPES.map((t) => grouped[t.key].length);
  const totalCount = counts.reduce((a, b) => a + b, 0);

  const visible = tab === 0 ? matches : grouped[TYPES[tab - 1].key];

  const typeMeta = (key) => TYPES.find((t) => t.key === key) || TYPES[0];

  const open = (it) => {
    const meta = typeMeta(it.__type);
    navigate(meta.path(it));
  };

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h2" mb={2}>Search</Typography>

      <TextField
        autoFocus
        fullWidth
        size="medium"
        placeholder="Search dashboards, reports, collections, datasets, KPIs…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
          },
        }}
        sx={{ mb: 2 }}
      />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{ mb: 2 }}>
        <Tab label={`All (${totalCount})`} />
        {TYPES.map((t, i) => (
          <Tab key={t.key} label={`${t.label} (${counts[i]})`} />
        ))}
      </Tabs>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={24} />
        </Box>
      ) : visible.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {q ? `No results for "${q}".` : 'Start typing to search.'}
          </Typography>
        </Paper>
      ) : (
        <Paper variant="outlined">
          <List dense disablePadding>
            {visible.map((it) => {
              const meta = typeMeta(it.__type);
              return (
                <ListItemButton key={`${it.__type}:${it._id}`} onClick={() => open(it)} divider>
                  <ListItemIcon sx={{ minWidth: 36, color: 'primary.main' }}>{meta.icon}</ListItemIcon>
                  <ListItemText
                    primary={it.name || it.title || it.label || '(untitled)'}
                    secondary={it.description || meta.label}
                    primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: 600 }}
                    secondaryTypographyProps={{ fontSize: '0.8rem' }}
                  />
                  <Chip label={meta.label} size="small" sx={{ height: 22, fontSize: '0.7rem' }} />
                </ListItemButton>
              );
            })}
          </List>
        </Paper>
      )}
    </Box>
  );
}
