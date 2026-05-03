import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Divider,
  Typography,
  Button,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import AddIcon from '@mui/icons-material/Add';
import SettingsIcon from '@mui/icons-material/Settings';
import BarChartIcon from '@mui/icons-material/BarChart';
import SpeedIcon from '@mui/icons-material/Speed';
import ScienceIcon from '@mui/icons-material/Science';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';

const MAIN_NAV = [
  { label: 'Dashboards', icon: <DashboardIcon />, path: '/dashboards' },
  { label: 'Datasets', icon: <ScienceIcon />, path: '/models' },
  { label: 'Reports', icon: <QuestionAnswerIcon />, path: '/reports' },
  { label: 'KPIs', icon: <SpeedIcon />, path: '/metrics' },
  { label: 'Reconciliations', icon: <CompareArrowsIcon />, path: '/recons' },
];

export default function Sidebar({ open, width }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  const isActive = (path) => {
    const [basePath, query = ''] = path.split('?');
    if (query) {
      // Query-bearing nav items (e.g. /browse?type=dashboards) only match when
      // both the pathname and the query string match exactly. This prevents
      // /browse?type=questions from also lighting up the Dashboards entry.
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
    const item = (
      <ListItemButton
        onClick={() => navigate(path)}
        sx={{
          borderRadius: 2,
          mx: 1,
          mb: 0.25,
          px: open ? 1.5 : 1.25,
          py: 0.875,
          color: active ? '#4f46e5' : '#475569',
          bgcolor: active ? '#eef2ff' : 'transparent',
          '&:hover': { bgcolor: active ? '#e0e7ff' : '#f1f5f9', color: active ? '#4f46e5' : '#14213d' },
          transition: 'all 0.15s',
          justifyContent: open ? 'flex-start' : 'center',
        }}
      >
        <ListItemIcon
          sx={{
            color: 'inherit',
            minWidth: open ? 32 : 'auto',
            justifyContent: 'center',
            '& svg': { fontSize: '1.125rem' },
          }}
        >
          {icon}
        </ListItemIcon>
        {open && (
          <ListItemText
            primary={label}
            primaryTypographyProps={{ fontSize: '0.8125rem', fontWeight: active ? 600 : 500 }}
          />
        )}
      </ListItemButton>
    );
    return open ? item : <Tooltip title={label} placement="right">{item}</Tooltip>;
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
        borderRight: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease',
        zIndex: 1200,
        overflowX: 'hidden',
      }}
    >
      {/* Logo */}
      <Box sx={{ px: open ? 2 : 0.5, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 96 }}>
        {open ? (
          <Box
            component="img"
            src="/logo.png"
            alt="Fyntrac Insight"
            sx={{
              height: 72,
              width: 'auto',
              maxWidth: '100%',
              objectFit: 'contain',
              transition: 'opacity 0.2s ease',
              '&:hover': { opacity: 0.85 },
            }}
          />
        ) : (
          <Box
            component="img"
            src="/logo.png"
            alt="F"
            sx={{
              height: 56,
              width: 56,
              objectFit: 'cover',
              objectPosition: 'left center',
              transition: 'transform 0.2s ease',
              '&:hover': { transform: 'scale(1.05)' },
            }}
          />
        )}
      </Box>

      <Divider sx={{ borderColor: '#e5e7eb' }} />

      <List dense sx={{ pt: 1, flex: 1 }}>
        {MAIN_NAV.map((item) => (
          <NavItem key={item.label} {...item} />
        ))}
      </List>

      <Divider sx={{ borderColor: '#e5e7eb' }} />

      {/* Settings + Admin */}
      <Box sx={{ pb: 1.5, pt: 1 }}>
        <NavItem label="Trash" icon={<DeleteOutlineIcon />} path="/trash" />
        <NavItem label="Usage Analytics" icon={<BarChartIcon />} path="/admin" />
        <NavItem label="Settings" icon={<SettingsIcon />} path="/settings" />
      </Box>
    </Box>
  );
}
