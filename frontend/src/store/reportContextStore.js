import { create } from 'zustand';

/**
 * Holds the "active report" context so the global AI drawer can ground
 * answers in whatever the user is currently looking at.
 *
 * QuestionEditor calls setReport(...) whenever the report, pipeline or
 * results change, and clearReport() on unmount. AIChatDrawer reads
 * `report` lazily inside sendChat and forwards it to the backend.
 */
const useReportContextStore = create((set) => ({
  report: null,
  setReport: (report) => set({ report }),
  clearReport: () => set({ report: null }),
}));

export default useReportContextStore;
