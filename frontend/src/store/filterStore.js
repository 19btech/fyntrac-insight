import { create } from 'zustand';

/**
 * Zustand store for dashboard cross-filtering state.
 * All DashboardCard components subscribe to this store
 * and re-fetch their data when filter values change.
 */
const useFilterStore = create((set) => ({
  filters: {}, // { [fieldName]: value }

  setFilter: (field, value) =>
    set((state) => ({
      filters: { ...state.filters, [field]: value },
    })),

  clearFilter: (field) =>
    set((state) => {
      const next = { ...state.filters };
      delete next[field];
      return { filters: next };
    }),

  reset: () => set({ filters: {} }),
}));

export default useFilterStore;
