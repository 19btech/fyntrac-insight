import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import AppShell from './layout/AppShell';

// Route components are code-split so the initial bundle stays small — charts,
// the data grid, markdown, the AI runtime etc. only load with the page that
// needs them.
const DashboardPage = lazy(() => import('./pages/Dashboard'));
const DashboardsPage = lazy(() => import('./pages/Dashboards'));
const ReportsPage = lazy(() => import('./pages/Reports'));
const QuestionEditor = lazy(() => import('./pages/QuestionEditor'));
const CollectionPage = lazy(() => import('./pages/Collection'));
const SharedDashboard = lazy(() => import('./pages/SharedDashboard'));
const AdminPage = lazy(() => import('./pages/Admin'));
const MetricsPage = lazy(() => import('./pages/Metrics'));
const ModelsPage = lazy(() => import('./pages/Models'));
const DatasetEditor = lazy(() => import('./pages/DatasetEditor'));
const TrashPage = lazy(() => import('./pages/Trash'));
const Bookmarks = lazy(() => import('./pages/Bookmarks'));
const SharedQuestion = lazy(() => import('./pages/SharedQuestion'));
const Search = lazy(() => import('./pages/Search'));
const Recons = lazy(() => import('./pages/Recons'));
const ReconEditor = lazy(() => import('./pages/ReconEditor'));
const ReconRun = lazy(() => import('./pages/ReconRun'));
const Settings = lazy(() => import('./pages/Settings'));

function RouteFallback() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <CircularProgress size={28} />
    </Box>
  );
}

/**
 * On initial load the JWT is expected as ?token=<jwt> query param
 * (set by the Fyntrac main app iframe/redirect).
 * Store it in sessionStorage for subsequent API calls.
 */
function useJwt() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      sessionStorage.setItem('insight_auth_token', token);
      // Clean the token from the URL without a page reload
      const url = new URL(window.location.href);
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);
}

export default function App() {
  useJwt();

  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Public share view — no AppShell */}
        <Route path="/share/:token" element={<SharedDashboard />} />
        <Route path="/share/q/:token" element={<SharedQuestion />} />

        {/* Authenticated app shell */}
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboards" replace />} />
          <Route path="/home" element={<Navigate to="/dashboards" replace />} />
          <Route path="/dashboard/:id" element={<DashboardPage />} />
          <Route path="/dashboards" element={<DashboardsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/question/:id" element={<QuestionEditor />} />
          <Route path="/question/new" element={<QuestionEditor />} />
          {/* Legacy /browse redirects */}
          <Route path="/browse" element={<Navigate to="/dashboards" replace />} />
          <Route path="/collection/:id" element={<CollectionPage />} />
          <Route path="/metrics" element={<MetricsPage />} />
          <Route path="/models" element={<ModelsPage />} />
          <Route path="/dataset/:id" element={<DatasetEditor />} />
          <Route path="/dataset/new" element={<DatasetEditor />} />
          <Route path="/search" element={<Search />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/trash" element={<TrashPage />} />
          <Route path="/recons" element={<Recons />} />
          <Route path="/recon/new" element={<ReconEditor />} />
          <Route path="/recon/:id" element={<ReconEditor />} />
          <Route path="/recon/:id/run/:runId" element={<ReconRun />} />
          <Route path="/bookmarks" element={<Bookmarks />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
