import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './layout/AppShell';
import Home from './pages/Home';
import DashboardPage from './pages/Dashboard';
import DashboardsPage from './pages/Dashboards';
import ReportsPage from './pages/Reports';
import QuestionEditor from './pages/QuestionEditor';
import CollectionPage from './pages/Collection';
import SharedDashboard from './pages/SharedDashboard';
import AdminPage from './pages/Admin';
import MetricsPage from './pages/Metrics';
import ModelsPage from './pages/Models';
import DatasetEditor from './pages/DatasetEditor';
import TrashPage from './pages/Trash';
import Bookmarks from './pages/Bookmarks';
import SharedQuestion from './pages/SharedQuestion';
import Search from './pages/Search';
import Settings from './pages/Settings';
import Recons from './pages/Recons';
import ReconEditor from './pages/ReconEditor';
import ReconRun from './pages/ReconRun';

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
      sessionStorage.setItem('fyntrac_jwt', token);
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
    </BrowserRouter>
  );
}
