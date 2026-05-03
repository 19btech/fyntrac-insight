import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog, InputBase, Box, List, ListItemButton, ListItemText, Typography, CircularProgress, Chip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DashboardIcon from '@mui/icons-material/Dashboard';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import ScienceIcon from '@mui/icons-material/Science';
import SpeedIcon from '@mui/icons-material/Speed';
import { useNavigate } from 'react-router-dom';
import api from '../../hooks/useQuery';

const TYPE_META = {
  dashboard: { icon: <DashboardIcon fontSize="small" />, label: 'Dashboard', path: (i) => `/dashboard/${i._id}` },
  question:  { icon: <QuestionAnswerIcon fontSize="small" />, label: 'Report', path: (i) => `/question/${i._id}` },
  model:     { icon: <ScienceIcon fontSize="small" />, label: 'Dataset', path: () => `/models` },
  metric:    { icon: <SpeedIcon fontSize="small" />, label: 'KPI', path: () => `/metrics` },
};

export default function SearchModal({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) { setQuery(''); setResults([]); setHighlighted(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const [d, q, m, mt] = await Promise.all([
          api.get('/dashboards').then((r) => r.data).catch(() => []),
          api.get('/questions').then((r) => r.data).catch(() => []),
          api.get('/models').then((r) => r.data).catch(() => []),
          api.get('/metrics').then((r) => r.data).catch(() => []),
        ]);
        const lq = query.toLowerCase();
        const matched = [
          ...d.filter((x) => x.name.toLowerCase().includes(lq)).map((x) => ({ ...x, _type: 'dashboard' })),
          ...q.filter((x) => x.name.toLowerCase().includes(lq)).map((x) => ({ ...x, _type: 'question' })),
          ...m.filter((x) => x.name.toLowerCase().includes(lq)).map((x) => ({ ...x, _type: 'model' })),
          ...mt.filter((x) => x.name.toLowerCase().includes(lq)).map((x) => ({ ...x, _type: 'metric' })),
        ].slice(0, 14);
        setResults(matched);
        setHighlighted(0);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const goto = (item) => {
    navigate(TYPE_META[item._type].path(item));
    onClose();
  };

  const handleKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
    if (e.key === 'Enter' && results[highlighted]) { e.preventDefault(); goto(results[highlighted]); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { mt: '10vh', verticalAlign: 'top' } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />
        <InputBase
          inputRef={inputRef}
          fullWidth
          placeholder="Search dashboards, reports, datasets, KPIs…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          sx={{ fontSize: '1rem' }}
        />
        {loading && <CircularProgress size={16} />}
      </Box>

      {results.length > 0 && (
        <List dense>
          {results.map((item, i) => {
            const meta = TYPE_META[item._type];
            return (
              <ListItemButton
                key={`${item._type}-${item._id}`}
                onClick={() => goto(item)}
                selected={i === highlighted}
                sx={{ '&.Mui-selected': { bgcolor: '#eef2ff' } }}
              >
                <Box sx={{ mr: 1.5, color: 'primary.main', display: 'flex' }}>
                  {meta.icon}
                </Box>
                <ListItemText
                  primary={item.name}
                  primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500 }}
                />
                <Chip label={meta.label} size="small" sx={{ fontSize: '0.7rem', height: 20 }} />
              </ListItemButton>
            );
          })}
        </List>
      )}

      {query && !loading && results.length === 0 && (
        <Box sx={{ px: 2, py: 2 }}>
          <Typography variant="body2" color="text.secondary">No results for "{query}"</Typography>
        </Box>
      )}

      {!query && (
        <Box sx={{ px: 2, py: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Search across dashboards, reports, datasets, and KPIs. Use ↑/↓ to navigate, Enter to open.
          </Typography>
        </Box>
      )}
    </Dialog>
  );
}
