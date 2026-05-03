import { create } from 'zustand';

/**
 * Holds the "active dataset" context so the global AI drawer can ground
 * answers in whatever dataset the user is currently building/viewing.
 *
 * DatasetPreviewDialog (and the standalone DatasetEditor page) call
 * setDataset(...) whenever the dataset, steps, source or preview change,
 * and clearDataset() on close/unmount. AIChatDrawer reads `dataset`
 * lazily inside sendChat and forwards it to the backend alongside the
 * existing activeReport context.
 */
const useDatasetContextStore = create((set) => ({
  dataset: null,
  setDataset: (dataset) => set({ dataset }),
  clearDataset: () => set({ dataset: null }),
}));

export default useDatasetContextStore;
