import React from 'react';
import { Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import FolderIcon from '@mui/icons-material/Folder';
import SpeedIcon from '@mui/icons-material/Speed';
import ScienceIcon from '@mui/icons-material/Science';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { useNavigate } from 'react-router-dom';
import api from '../../hooks/useQuery';

export default function NewItemMenu({ anchorEl, onClose }) {
  const navigate = useNavigate();

  const createDashboard = async () => {
    navigate('/dashboard/new');
    onClose();
  };

  const createCollection = async () => {
    await api.post('/collections', { name: 'New Collection' });
    navigate('/dashboards');
    onClose();
  };

  return (
    <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={onClose}>
      <MenuItem onClick={() => { navigate('/question/new'); onClose(); }}>
        <ListItemIcon><QuestionAnswerIcon fontSize="small" /></ListItemIcon>
        <ListItemText>New Report</ListItemText>
      </MenuItem>
      <MenuItem onClick={createDashboard}>
        <ListItemIcon><DashboardIcon fontSize="small" /></ListItemIcon>
        <ListItemText>New Dashboard</ListItemText>
      </MenuItem>
      <MenuItem onClick={() => { navigate('/models'); onClose(); }}>
        <ListItemIcon><ScienceIcon fontSize="small" /></ListItemIcon>
        <ListItemText>New Dataset</ListItemText>
      </MenuItem>
      <MenuItem onClick={() => { navigate('/metrics'); onClose(); }}>
        <ListItemIcon><SpeedIcon fontSize="small" /></ListItemIcon>
        <ListItemText>New KPI</ListItemText>
      </MenuItem>
      <MenuItem onClick={() => {
        window.dispatchEvent(new CustomEvent('fyntrac:open:recon', { detail: { isNew: true } }));
        onClose();
      }}>
        <ListItemIcon><CompareArrowsIcon fontSize="small" /></ListItemIcon>
        <ListItemText>New Reconciliation</ListItemText>
      </MenuItem>
      <Divider />
      <MenuItem onClick={createCollection}>
        <ListItemIcon><FolderIcon fontSize="small" /></ListItemIcon>
        <ListItemText>New Collection</ListItemText>
      </MenuItem>
    </Menu>
  );
}
