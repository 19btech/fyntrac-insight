import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box, List, ListItemButton, ListItemIcon, ListItemText,
  Tooltip, Divider, Typography, Stack, Chip, IconButton,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/DashboardOutlined';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswerOutlined';
import ScienceIcon from '@mui/icons-material/ScienceOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import BarChartIcon from '@mui/icons-material/BarChartOutlined';
import SettingsIcon from '@mui/icons-material/SettingsOutlined';
import SpeedIcon from '@mui/icons-material/SpeedOutlined';
import CompareArrowsIcon from '@mui/icons-material/CompareArrowsOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

const MAIN_NAV = [
  { label: 'Dashboards',      icon: <DashboardIcon fontSize="small" />,     path: '/dashboards' },
  { label: 'Datasets',        icon: <ScienceIcon fontSize="small" />,        path: '/models' },
  { label: 'Reports',         icon: <QuestionAnswerIcon fontSize="small" />, path: '/reports' },
  { label: 'KPIs',            icon: <SpeedIcon fontSize="small" />,          path: '/metrics' },
  { label: 'Reconciliations', icon: <CompareArrowsIcon fontSize="small" />,  path: '/recons' },
];

const BOTTOM_NAV = [
  { label: 'Trash',           icon: <DeleteOutlineIcon fontSize="small" />, path: '/trash' },
  { label: 'Usage Analytics', icon: <BarChartIcon fontSize="small" />,      path: '/admin' },
];

// Token values from theme.ts
const ACCENT       = '#4f46e5'; // tokens.brand.indigoDark  = SIDEBAR_TEXT_ACTIVE
const ACCENT_BG    = '#eef2ff'; // tokens.brand.indigoBg    = SIDEBAR_BG_HOVER
const SLATE_100    = '#f1f5f9'; // tokens.brand.slate100
const SLATE_200    = '#e2e8f0'; // tokens.brand.slate200    = SIDEBAR_BORDER
const SLATE_500    = '#64748b'; // tokens.brand.slate500
const SLATE_700    = '#334155'; // tokens.brand.slate700    = SIDEBAR_TEXT
const INDIGO       = '#6366f1'; // tokens.brand.indigo      = SIDEBAR_ACCENT
const BLACK        = '#14213d'; // tokens.brand.black

export default function Sidebar({ open, width, onToggle, onSettingsClick }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  const isActive = (path) => {
    const [basePath, query = ''] = path.split('?');
    if (query) {
      const current = new URLSearchParams(search);
      const expected = new URLSearchParams(query);
      if (pathname !== basePath) return false;
      for (const [k, v] of expected) {
        if (current.get(k) !== v) return false;
      }
      return true;
    }
    return pathname === basePath || pathname.startsWith(basePath + '/');
  };

  const NavItem = ({ label, icon, path }) => {
    const active = isActive(path);
    const button = (
      <ListItemButton
        onClick={() => navigate(path)}
        sx={{
          borderRadius: '12px',
          mb: 0.25,
          px: open ? 1.75 : 1.25,
          py: 1,
          color: active ? ACCENT : SLATE_700,
          bgcolor: active ? ACCENT_BG : 'transparent',
          '&:hover': { bgcolor: SLATE_100, color: BLACK },
          transition: 'background-color 160ms, color 160ms',
          justifyContent: open ? 'flex-start' : 'center',
        }}
      >
        <ListItemIcon
          sx={{
            color: active ? INDIGO : SLATE_500,
            minWidth: open ? 32 : 'auto',
            justifyContent: 'center',
          }}
        >
          {icon}
        </ListItemIcon>
        {open && (
          <ListItemText
            primary={label}
            primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: active ? 600 : 500, fontStyle: 'normal', color: 'inherit' }}
          />
        )}
      </ListItemButton>
    );
    return open ? button : (
      <Tooltip key={path} title={label} placement="right"><span>{button}</span></Tooltip>
    );
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        height: '100vh',
        width,
        bgcolor: '#ffffff',
        borderRight: `1px solid ${SLATE_200}`,
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 220ms cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 1200,
        overflowX: 'visible',
      }}
    >
      {/* ── Floating expand/collapse pill ── */}
      <Tooltip title={open ? 'Collapse sidebar' : 'Expand sidebar'} placement="right">
        <IconButton
          onClick={onToggle}
          size="small"
          sx={{
            position: 'absolute',
            top: 56,
            right: -12,
            zIndex: 1201,
            width: 24,
            height: 24,
            bgcolor: '#fff',
            border: `1px solid ${SLATE_200}`,
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)',
            color: SLATE_700,
            '&:hover': { bgcolor: INDIGO, color: '#fff', borderColor: INDIGO },
          }}
        >
          {open ? <ChevronLeftIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        </IconButton>
      </Tooltip>

      {/* ── Logo ── */}
      <Box
        sx={{
          px: open ? 2 : 1.5,
          pt: 2.5,
          pb: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: open ? 'flex-start' : 'center',
          minHeight: 80,
        }}
      >
        <Box
          component="img"
          src="/logo.png"
          alt="Fyntrac"
          sx={{
            width: open ? '100%' : 40,
            height: open ? 'auto' : 40,
            maxHeight: 72,
            objectFit: 'contain',
            transition: 'width 220ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </Box>

      <Divider sx={{ borderColor: SLATE_200 }} />

      {/* ── WORKSPACE label ── */}
      {open && (
        <Typography
          sx={{
            px: 2.5,
            mt: 2,
            display: 'block',
            fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
            fontSize: '0.625rem',
            fontWeight: 700,
            fontStyle: 'normal',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: SLATE_500,
            lineHeight: 1.1,
          }}
        >
          Workspace
        </Typography>
      )}

      {/* ── Main nav ── */}
      <List sx={{ px: 1.5, mt: 2, flex: 1 }}>
        {MAIN_NAV.map((item) => <NavItem key={item.label} {...item} />)}
      </List>

      <Divider sx={{ borderColor: SLATE_200 }} />

      {/* ── Bottom nav ── */}
      <List sx={{ px: 1.5, pb: 0, pt: 0.5 }}>
        {BOTTOM_NAV.map((item) => <NavItem key={item.label} {...item} />)}
      </List>

      {/* ── Settings ── */}
      <List sx={{ px: 1.5, pb: 1, pt: 0 }}>
        {open ? (
          <ListItemButton
            onClick={onSettingsClick}
            sx={{
              borderRadius: '12px',
              mb: 0.25,
              px: 1.75,
              py: 1,
              color: SLATE_700,
              bgcolor: 'transparent',
              '&:hover': { bgcolor: SLATE_100, color: BLACK },
              transition: 'background-color 160ms, color 160ms',
              justifyContent: 'flex-start',
            }}
          >
            <ListItemIcon sx={{ color: SLATE_500, minWidth: 32, justifyContent: 'center' }}>
              <SettingsIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="AI Settings"
              primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500, fontStyle: 'normal', color: 'inherit' }}
            />
          </ListItemButton>
        ) : (
          <Tooltip title="AI Settings" placement="right">
            <span>
              <ListItemButton
                onClick={onSettingsClick}
                sx={{
                  borderRadius: '12px',
                  mb: 0.25,
                  px: 1.25,
                  py: 1,
                  color: SLATE_700,
                  bgcolor: 'transparent',
                  '&:hover': { bgcolor: SLATE_100, color: BLACK },
                  transition: 'background-color 160ms, color 160ms',
                  justifyContent: 'center',
                }}
              >
                <ListItemIcon sx={{ color: SLATE_500, minWidth: 'auto', justifyContent: 'center' }}>
                  <SettingsIcon fontSize="small" />
                </ListItemIcon>
              </ListItemButton>
            </span>
          </Tooltip>
        )}
      </List>

    </Box>
  );
}
