import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Box } from '@mui/material';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

// Heavy global dialogs (charts, data grid, markdown, assistant-ui, Monaco) are
// lazy-loaded so their code stays out of the initial bundle and only loads the
// first time the user opens that dialog.
const AIChatDrawer = lazy(() => import('../components/ai/AIChatDrawer'));
const SearchModal = lazy(() => import('../components/shared/SearchModal'));
const ReportPreviewDialog = lazy(() => import('../components/reports/ReportPreviewDialog'));
const DatasetPreviewDialog = lazy(() => import('../components/datasets/DatasetPreviewDialog'));
const ReconPreviewDialog = lazy(() => import('../components/recon/ReconPreviewDialog'));
const SqlLabDialog = lazy(() => import('../components/sql-lab/SqlLabDialog'));
const Settings = lazy(() => import('../pages/Settings'));

const SIDEBAR_EXPANDED = 252;
const SIDEBAR_COLLAPSED = 72;
const TOPBAR_HEIGHT = 64;

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSeedPrompt, setAiSeedPrompt] = useState('');
  const [aiSeedKey, setAiSeedKey] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportModal, setReportModal] = useState(null);
  const [datasetModal, setDatasetModal] = useState(null);
  const [reconModal, setReconModal] = useState(null);
  const [sqlLabOpen, setSqlLabOpen] = useState(false);
  // Keep the always-on dialogs mounted (for animations + state) once first
  // opened, so their lazy chunk loads on demand but doesn't reload after that.
  const [aiMounted, setAiMounted] = useState(false);
  const [searchMounted, setSearchMounted] = useState(false);
  const [settingsMounted, setSettingsMounted] = useState(false);
  const [sqlLabMounted, setSqlLabMounted] = useState(false);
  useEffect(() => { if (aiOpen) setAiMounted(true); }, [aiOpen]);
  useEffect(() => { if (searchOpen) setSearchMounted(true); }, [searchOpen]);
  useEffect(() => { if (settingsOpen) setSettingsMounted(true); }, [settingsOpen]);
  useEffect(() => { if (sqlLabOpen) setSqlLabMounted(true); }, [sqlLabOpen]);
  const sidebarWidth = sidebarOpen ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED;
  const navigate = useNavigate();

  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

  // Global keyboard shortcuts: Cmd/Ctrl+K → search, Cmd/Ctrl+Shift+A → AI drawer
  const handleKeyDown = useCallback((e) => {
    const meta = isMac ? e.metaKey : e.ctrlKey;
    if (!meta) return;
    if (e.key.toLowerCase() === 'k' && !e.shiftKey) {
      e.preventDefault();
      setSearchOpen((o) => !o);
    }
    if (e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setAiOpen((o) => !o);
    }
  }, [isMac]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Global event: any component can open the AI drawer with an optional
  // pre-seeded prompt via window.dispatchEvent(new CustomEvent('fyntrac:ai:open',
  // { detail: { prompt: '...' } })).
  useEffect(() => {
    const handler = (e) => {
      const prompt = e.detail?.prompt || '';
      setAiSeedPrompt(prompt);
      setAiSeedKey((k) => k + 1); // always triggers the effect even for identical prompts
      setAiOpen(true);
    };
    window.addEventListener('fyntrac:ai:open', handler);
    return () => window.removeEventListener('fyntrac:ai:open', handler);
  }, []);

  // Open Report / Dataset modals from anywhere (search, deep links, etc).
  useEffect(() => {
    const onReport = (e) => setReportModal({ id: e.detail?.id || null, isNew: !!e.detail?.isNew });
    const onDataset = (e) => setDatasetModal({ id: e.detail?.id || null, isNew: !!e.detail?.isNew });
    const onMetric = (e) => navigate(`/metrics?open=${encodeURIComponent(e.detail?.id || 'new')}`);
    const onRecon = (e) => {
      // Recons open as a modal, just like reports & datasets. The full
      // /recon/:id route is still wired as a deep-link fallback.
      setReconModal({
        id: e.detail?.id || null,
        isNew: !e.detail?.id || !!e.detail?.isNew,
        initialTab: e.detail?.initialTab,
      });
    };
    const onSqlLab = () => setSqlLabOpen(true);
    window.addEventListener('fyntrac:open:report', onReport);
    window.addEventListener('fyntrac:open:dataset', onDataset);
    window.addEventListener('fyntrac:open:metric', onMetric);
    window.addEventListener('fyntrac:open:recon', onRecon);
    window.addEventListener('fyntrac:open:sqllab', onSqlLab);
    return () => {
      window.removeEventListener('fyntrac:open:report', onReport);
      window.removeEventListener('fyntrac:open:dataset', onDataset);
      window.removeEventListener('fyntrac:open:metric', onMetric);
      window.removeEventListener('fyntrac:open:recon', onRecon);
      window.removeEventListener('fyntrac:open:sqllab', onSqlLab);
    };
  }, [navigate]);

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar open={sidebarOpen} width={sidebarWidth} onToggle={() => setSidebarOpen((o) => !o)} onSettingsClick={() => setSettingsOpen(true)} />
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          overflow: 'hidden',
          ml: `${sidebarWidth}px`,
          transition: 'margin-left 0.2s ease',
        }}
      >
        <Topbar
          height={TOPBAR_HEIGHT}
          leftOffset={sidebarWidth}
          onMenuClick={() => setSidebarOpen((o) => !o)}
          onSearchClick={() => setSearchOpen(true)}
          onAIClick={() => setAiOpen(true)}
        />
        <Box
          component="main"
          sx={{
            flex: 1,
            overflow: 'auto',
            bgcolor: '#f0f0f7',
            mt: `${TOPBAR_HEIGHT}px`,
            p: 1,
          }}
        >
          <Box
            sx={{
              bgcolor: '#ffffff',
              minHeight: '100%',
              p: 3,
            }}
          >
            {/* No key-remount and no opacity-0 fade here: forcing the wrapper
                to unmount and re-enter from opacity:0 on every navigation
                produced a blank frame (the flicker). Let React swap the route
                component in place so the new page paints immediately. */}
            <Outlet />
          </Box>
        </Box>
      </Box>

      {/* Global drawers/modals — lazy-loaded on first use */}
      <Suspense fallback={null}>
        {aiMounted && (
          <AIChatDrawer
            open={aiOpen}
            onClose={() => { setAiOpen(false); setAiSeedPrompt(''); }}
            initialPrompt={aiSeedPrompt}
            seedKey={aiSeedKey}
          />
        )}
        {searchMounted && <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />}
        {settingsMounted && <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />}

        {reportModal && (
          <ReportPreviewDialog
            open
            reportId={reportModal.id}
            isNew={reportModal.isNew}
            onClose={() => setReportModal(null)}
          />
        )}
        {datasetModal && (
          <DatasetPreviewDialog
            open
            datasetId={datasetModal.id}
            isNew={datasetModal.isNew}
            onClose={() => setDatasetModal(null)}
          />
        )}
        {reconModal && (
          <ReconPreviewDialog
            open
            reconId={reconModal.id}
            isNew={reconModal.isNew}
            initialTab={reconModal.initialTab}
            onClose={() => setReconModal(null)}
            onSaved={() => window.dispatchEvent(new CustomEvent('fyntrac:recon:saved'))}
          />
        )}

        {sqlLabMounted && <SqlLabDialog open={sqlLabOpen} onClose={() => setSqlLabOpen(false)} />}
      </Suspense>
    </Box>
  );
}
