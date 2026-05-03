import { create } from 'zustand';

/**
 * Tiny global store for the current page's display title.
 *
 * Pages (QuestionEditor, DashboardPage, ReconEditor, etc.) call setTitle()
 * on mount/load. The Topbar reads it to render a clean breadcrumb instead of
 * exposing raw Mongo ObjectIds in the URL.
 */
const usePageTitleStore = create((set) => ({
  title: '',
  setTitle: (title) => set({ title: title || '' }),
  clear: () => set({ title: '' }),
}));

export default usePageTitleStore;
