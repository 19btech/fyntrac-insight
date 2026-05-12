import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Box } from '@mui/material';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import AIChatDrawer from '../components/ai/AIChatDrawer';
import SearchModal from '../components/shared/SearchModal';
import ReportPreviewDialog from '../components/reports/ReportPreviewDialog';
import DatasetPreviewDialog from '../components/datasets/DatasetPreviewDialog';
import ReconPreviewDialog from '../components/recon/ReconPreviewDialog';

const SIDEBAR_EXPANDED = 240;
const SIDEBAR_COLLAPSED = 56;
const TOPBAR_HEIGHT = 56;

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSeedPrompt, setAiSeedPrompt] = useState('');
  const [aiSeedKey, setAiSeedKey] = useState(0); // increments on every follow-up click
  const [searchOpen, setSearchOpen] = useState(false);
  const [reportModal, setReportModal] = useState(null); // { id, isNew } | null
  const [datasetModal, setDatasetModal] = useState(null); // { id, isNew } | null
  const [reconModal, setReconModal] = useState(null); // { id, isNew } | null
  const sidebarWidth = sidebarOpen ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED;
  const location = useLocation();
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
    window.addEventListener('fyntrac:open:report', onReport);
    window.addEventListener('fyntrac:open:dataset', onDataset);
    window.addEventListener('fyntrac:open:metric', onMetric);
    window.addEventListener('fyntrac:open:recon', onRecon);
    return () => {
      window.removeEventListener('fyntrac:open:report', onReport);
      window.removeEventListener('fyntrac:open:dataset', onDataset);
      window.removeEventListener('fyntrac:open:metric', onMetric);
      window.removeEventListener('fyntrac:open:recon', onRecon);
    };
  }, [navigate]);

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar open={sidebarOpen} width={sidebarWidth} onToggle={() => setSidebarOpen((o) => !o)} />
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
            bgcolor: 'background.default',
            mt: `${TOPBAR_HEIGHT}px`,
            p: 3,
          }}
        >
          <Box key={location.pathname} className="fyntrac-fade-in">
            <Outlet />
          </Box>
        </Box>
      </Box>

      {/* Global drawers/modals */}
      <AIChatDrawer
        open={aiOpen}
        onClose={() => { setAiOpen(false); setAiSeedPrompt(''); }}
        initialPrompt={aiSeedPrompt}
        seedKey={aiSeedKey}
      />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />

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
    </Box>
  );
}
