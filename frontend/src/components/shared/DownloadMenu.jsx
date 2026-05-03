import React from 'react';
import { Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import TableChartIcon from '@mui/icons-material/TableChart';
import DataObjectIcon from '@mui/icons-material/DataObject';

export default function DownloadMenu({ anchorEl, onClose, data = [], cardRef }) {
  const downloadPng = async () => {
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current);
      const link = document.createElement('a');
      link.download = 'chart.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error('PNG export failed:', e);
    }
    onClose();
  };

  const downloadCsv = () => {
    if (!data.length) { onClose(); return; }
    const headers = Object.keys(data[0]);
    const rows = data.map((row) => headers.map((h) => JSON.stringify(row[h] ?? '')).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.download = 'data.csv';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    onClose();
  };

  const downloadJson = () => {
    if (!data.length) { onClose(); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = 'data.json';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    onClose();
  };

  return (
    <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={onClose}>
      <MenuItem onClick={downloadPng}>
        <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
        <ListItemText>Download PNG</ListItemText>
      </MenuItem>
      <MenuItem onClick={downloadCsv}>
        <ListItemIcon><TableChartIcon fontSize="small" /></ListItemIcon>
        <ListItemText>Download CSV</ListItemText>
      </MenuItem>
      <MenuItem onClick={downloadJson}>
        <ListItemIcon><DataObjectIcon fontSize="small" /></ListItemIcon>
        <ListItemText>Download JSON</ListItemText>
      </MenuItem>
    </Menu>
  );
}
