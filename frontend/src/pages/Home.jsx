import React from 'react';
import { Box } from '@mui/material';

/**
 * Home page intentionally renders an empty body. The user-facing entry
 * points (Reports, Dashboards, Collections, Models, etc.) are reachable
 * from the sidebar.
 */
export default function Home() {
  return <Box sx={{ minHeight: '100%' }} />;
}
