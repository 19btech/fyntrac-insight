import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar, Toolbar, IconButton, Box, Typography, Avatar, Tooltip, Menu, MenuItem,
  Breadcrumbs, Link, Button, Autocomplete, TextField, InputAdornment, Chip, Stack,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import SearchIcon from '@mui/icons-material/Search';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DashboardIcon from '@mui/icons-material/Dashboard';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import FolderIcon from '@mui/icons-material/Folder';
import ScienceIcon from '@mui/icons-material/Science';
import SpeedIcon from '@mui/icons-material/Speed';
import BalanceIcon from '@mui/icons-material/Balance';
import usePageTitleStore from '../store/pageTitleStore';
import api from '../hooks/useQuery';

const OBJECT_ID_RX = /^[a-f0-9]{24}$/i;

const SEARCH_TYPES = {
  dashboard:  { label: 'Dashboard',    icon: <DashboardIcon fontSize="small" /> },
  question:   { label: 'Report',       icon: <QuestionAnswerIcon fontSize="small" /> },
  collection: { label: 'Collection',   icon: <FolderIcon fontSize="small" /> },
  model:      { label: 'Dataset',      icon: <ScienceIcon fontSize="small" /> },
  metric:     { label: 'KPI',          icon: <SpeedIcon fontSize="small" /> },
  recon:      { label: 'Reconciliation', icon: <BalanceIcon fontSize="small" /> },
};

function useBreadcrumbs(pageTitle) {
  const { pathname } = useLocation();
  const segs = pathname.split('/').filter(Boolean);
  if (segs.length === 0) return [{ label: 'Home', path: '/' }];
  const labels = {
    home: 'Home', browse: 'Browse', dashboard: 'Dashboard', question: 'Reports',
    collection: 'Collection', admin: 'Usage Analytics', metrics: 'KPIs', models: 'Datasets',
    recons: 'Reconciliations', recon: 'Reconciliation', dataset: 'Dataset',
    bookmarks: 'Bookmarks', trash: 'Trash', search: 'Search', settings: 'Settings',
  };
  return segs.map((s, i) => {
    let label = labels[s] || s;
    const isLast = i === segs.length - 1;
    if (isLast && pageTitle) label = pageTitle;
    else if (OBJECT_ID_RX.test(s)) label = '...';
    return { label, path: '/' + segs.slice(0, i + 1).join('/') };
  });
}

function useSearchIndex() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get('/dashboards').then((r) => (r.data || []).map((x) => ({ ...x, _type: 'dashboard' }))).catch(() => []),
      api.get('/questions').then((r) => (r.data || []).map((x) => ({ ...x, _type: 'question' }))).catch(() => []),
      api.get('/collections').then((r) => (r.data || []).map((x) => ({ ...x, _type: 'collection' }))).catch(() => []),
      api.get('/models').then((r) => (r.data || []).map((x) => ({ ...x, _type: 'model' }))).catch(() => []),
      api.get('/metrics').then((r) => (r.data || []).map((x) => ({ ...x, _type: 'metric' }))).catch(() => []),
      api.get('/recons').then((r) => (r.data || []).map((x) => ({ ...x, _type: 'recon' }))).catch(() => []),
    ]).then((groups) => { if (!cancelled) setItems(groups.flat()); });
    return () => { cancelled = true; };
  }, []);
  return items;
}

/**
 * Read firstName and tenant from the URL query string on first load.
 * Persists to sessionStorage so the values survive in-app navigation
 * (the ?firstName=...&tenant=... params are only present on the initial
 * redirect from fyntrac-web).
 */
function useProfile() {
  const [firstName] = useState(() => {
    try {
      const urlVal = new URLSearchParams(window.location.search).get('firstName');
      if (urlVal) {
        sessionStorage.setItem('insight_firstName', urlVal);
        return urlVal;
      }
      return sessionStorage.getItem('insight_firstName') || '';
    } catch { return ''; }
  });

  const [tenant] = useState(() => {
    try {
      const urlVal = new URLSearchParams(window.location.search).get('tenant');
      if (urlVal) {
        sessionStorage.setItem('insight_tenant', urlVal);
        return urlVal;
      }
      return sessionStorage.getItem('insight_tenant') || '';
    } catch { return ''; }
  });

  // Strip the params from the URL bar (one-time, on mount)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('firstName') || params.get('tenant')) {
      params.delete('firstName');
      params.delete('tenant');
      const clean = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
      window.history.replaceState({}, document.title, clean);
    }
  }, []);

  return { firstName, tenant };
}

export default function Topbar({ height, leftOffset = 0, onMenuClick, onAIClick }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const navigate = useNavigate();
  const pageTitle = usePageTitleStore((s) => s.title);
  const crumbs = useBreadcrumbs(pageTitle);
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
  const metaKey = isMac ? '\u2318' : 'Ctrl';
  const items = useSearchIndex();
  const { firstName, tenant } = useProfile();

  const suggestions = useMemo(() => {
    const term = searchInput.trim().toLowerCase();
    if (!term) return [];
    return items.filter((it) => {
      const hay = [it.name, it.title, it.description].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(term);
    }).slice(0, 8);
  }, [items, searchInput]);

  const goToItem = (item) => {
    if (!item) return;
    const id = item._id;
    switch (item._type) {
      case 'question':
        window.dispatchEvent(new CustomEvent('fyntrac:open:report', { detail: { id } }));
        break;
      case 'model':
        window.dispatchEvent(new CustomEvent('fyntrac:open:dataset', { detail: { id } }));
        break;
      case 'metric':
        window.dispatchEvent(new CustomEvent('fyntrac:open:metric', { detail: { id } }));
        break;
      case 'recon':
        window.dispatchEvent(new CustomEvent('fyntrac:open:recon', { detail: { id } }));
        break;
      case 'dashboard':
        navigate(`/dashboard/${id}`);
        break;
      case 'collection':
        navigate(`/collection/${id}`);
        break;
      default:
        navigate(`/question/${id}`);
    }
    setSearchInput('');
  };

  const submitFreeText = () => {
    const q = searchInput.trim();
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
    setSearchInput('');
  };

  return (
    <AppBar position="fixed" elevation={0}
      sx={{
        height,
        zIndex: 1100,
        top: 0,
        left: leftOffset,
        // width must be explicitly calculated — MUI AppBar defaults to width:100%
        // which causes it to overflow the viewport by leftOffset pixels when left is set.
        width: `calc(100% - ${leftOffset}px)`,
        transition: 'left 0.2s ease, width 0.2s ease',
      }}>
      <Toolbar sx={{
        height, minHeight: `${height}px !important`, px: 2,
        display: 'flex', alignItems: 'center', gap: 1,
      }}>

        {/* LEFT zone: hamburger + breadcrumbs — shrinks but never pushes right zone off screen */}
        <Stack direction="row" alignItems="center" spacing={1}
          sx={{ flex: '1 1 0', minWidth: 0, overflow: 'hidden' }}>
          <IconButton onClick={onMenuClick} size="small" sx={{ color: 'text.secondary', flexShrink: 0 }}>
            <MenuIcon />
          </IconButton>
          <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
            <Breadcrumbs separator="/" sx={{ fontSize: '0.8125rem', color: 'text.secondary',
              '& .MuiBreadcrumbs-separator': { mx: 0.75 } }}>
              {crumbs.map((c, i) =>
                i === crumbs.length - 1 ? (
                  <Typography key={c.path} sx={{ fontSize: '0.8125rem', color: 'text.primary', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {c.label}
                  </Typography>
                ) : (
                  <Link key={c.path} component="button" underline="hover" onClick={() => navigate(c.path)}
                    sx={{ fontSize: '0.8125rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                    {c.label}
                  </Link>
                )
              )}
            </Breadcrumbs>
          </Box>
        </Stack>

        {/* CENTRE zone: search bar — grows but won't overflow left/right zones */}
        <Box sx={{ flex: '2 1 0', minWidth: 0, maxWidth: 520, px: 1 }}>
          <Autocomplete
          freeSolo openOnFocus
          options={suggestions}
          getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt?.name || '')}
          filterOptions={(x) => x}
          inputValue={searchInput}
          onInputChange={(_, v, reason) => { if (reason !== 'reset') setSearchInput(v); }}
          onChange={(_, val) => {
            if (val && typeof val !== 'string') goToItem(val);
            else if (typeof val === 'string') submitFreeText();
          }}
          noOptionsText={searchInput.trim() ? `No matches for "${searchInput}"` : 'Start typing to search...'}
          sx={{ width: '100%' }}
          renderOption={(props, option) => {
            const meta = SEARCH_TYPES[option._type] || SEARCH_TYPES.question;
            return (
              <Box component="li" {...props} key={`${option._type}-${option._id}`} sx={{ gap: 1.25, py: 0.75 }}>
                <Box sx={{ color: 'primary.main', display: 'flex' }}>{meta.icon}</Box>
                <Stack sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: 'text.primary',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {option.name}
                  </Typography>
                  {option.description && (
                    <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {option.description}
                    </Typography>
                  )}
                </Stack>
                <Chip label={meta.label} size="small"
                  sx={{ fontSize: '0.65rem', height: 20, bgcolor: '#eef2ff', color: '#4f46e5' }} />
              </Box>
            );
          }}
          renderInput={(params) => (
            <TextField {...params} size="small"
              placeholder={`Search dashboards, reports, datasets...   ${metaKey}K`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && suggestions.length === 0) {
                  e.preventDefault();
                  submitFreeText();
                }
              }}
              slotProps={{
                input: {
                  ...params.InputProps,
                  startAdornment: (
                    <InputAdornment position="start" sx={{ ml: 0.5 }}>
                      <SearchIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 999, bgcolor: '#f8fafc', fontSize: '0.8125rem', pl: 1,
                  transition: 'background-color .15s, box-shadow .15s',
                  '& fieldset': { borderColor: '#e2e8f0' },
                  '&:hover fieldset': { borderColor: '#cbd5e1' },
                  '&.Mui-focused': { bgcolor: '#fff', boxShadow: '0 0 0 3px rgba(79, 70, 229, 0.12)' },
                  '&.Mui-focused fieldset': { borderColor: 'primary.main', borderWidth: 1 },
                },
              }}
            />
          )}
          slotProps={{
            paper: { sx: { borderRadius: 2, mt: 0.5, boxShadow: '0 12px 28px rgba(15, 23, 42, 0.12)' } },
            listbox: { sx: { py: 0.5 } },
          }}
        />
        </Box>

        {/* RIGHT zone: user profile pill — fixed size, never shrinks or clips */}
        <Stack direction="row" alignItems="center" spacing={1}
          sx={{ flex: '1 1 0', justifyContent: 'flex-end', flexShrink: 0, minWidth: 0 }}>
          {firstName && (
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              bgcolor: alpha('#919EAB', 0.12),
              py: 0.5,
              px: 1.5,
              borderRadius: 3,
              flexShrink: 0,       // never compress the pill
              maxWidth: 220,       // cap width so it doesn't grow too wide
              overflow: 'hidden',
            }}>
              <Avatar sx={{ bgcolor: '#2563EB', width: 28, height: 28, fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                {firstName[0].toUpperCase()}
              </Avatar>
              <Typography variant="subtitle2" sx={{
                color: 'text.primary', lineHeight: 1, fontWeight: 500,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {firstName}{tenant && tenant !== 'master' ? ` / ${tenant}` : ''}
              </Typography>
            </Box>
          )}
        </Stack>

      </Toolbar>
    </AppBar>
  );
}
