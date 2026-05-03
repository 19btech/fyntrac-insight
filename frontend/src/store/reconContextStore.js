import { create } from 'zustand';

/**
 * Holds the "active reconciliation" so the global AI drawer can ground
 * answers in whatever recon the user is currently editing.
 *
 * ReconPreviewDialog calls setRecon(...) on hydrate / change and
 * clearRecon() on close. AIChatDrawer reads `recon` lazily and forwards
 * it to the backend.
 */
const useReconContextStore = create((set) => ({
  recon: null,
  setRecon: (recon) => set({ recon }),
  clearRecon: () => set({ recon: null }),
}));

export default useReconContextStore;
