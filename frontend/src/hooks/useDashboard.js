import { useState, useEffect, useCallback } from 'react';
import api from './useQuery';

const BLANK = { name: 'Untitled Dashboard', cards: [], layout: [], filters: [] };

export default function useDashboard(id) {
  const isNew = id === 'new';
  const [dashboard, setDashboard] = useState(isNew ? BLANK : null);
  const [loading, setLoading] = useState(!isNew);
  const [fetchError, setFetchError] = useState('');

  const fetch = useCallback(() => {
    if (!id || isNew) { setLoading(false); return; }
    setLoading(true);
    setFetchError('');
    api.get(`/dashboards/${id}`)
      .then((r) => setDashboard(r.data))
      .catch((e) => setFetchError(e?.response?.data?.error || 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  useEffect(() => { fetch(); }, [fetch]);

  // For existing dashboards: PUT to update. For new: caller handles POST.
  const save = useCallback(async (data) => {
    if (isNew) return; // no-op; handleSave in Dashboard.jsx does the POST
    const res = await api.put(`/dashboards/${id}`, data);
    setDashboard(res.data);
  }, [id, isNew]);

  return { dashboard, setDashboard, loading, fetchError, save, refresh: fetch, isNew };
}
