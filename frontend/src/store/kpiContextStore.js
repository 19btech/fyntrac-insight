import { create } from 'zustand';

/**
 * Holds the "active KPI" context so the global AI drawer can ground
 * answers in whatever KPI the user is currently editing.
 *
 * MetricEditDialog calls setKpi(...) whenever a KPI is opened for editing
 * and clearKpi() on unmount. AIChatDrawer reads `kpi` lazily inside
 * sendChat and forwards it to the backend.
 */
const useKpiContextStore = create((set) => ({
  kpi: null,
  setKpi: (kpi) => set({ kpi }),
  clearKpi: () => set({ kpi: null }),
}));

export default useKpiContextStore;
