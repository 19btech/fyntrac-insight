import React from 'react';
import { Tabs, Tab, Box } from '@mui/material';

export default function DashboardTabs({ tabs = [], activeTab, onChange }) {
  if (tabs.length === 0) return null;

  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
      <Tabs value={activeTab} onChange={(_, v) => onChange(v)}>
        {tabs.map((tab) => (
          <Tab key={tab.id} label={tab.label} value={tab.id} />
        ))}
      </Tabs>
    </Box>
  );
}
