import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Button, Paper, Alert, Chip, Skeleton, Tooltip,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/TuneOutlined';
import ManageSearchIcon from '@mui/icons-material/ManageSearchOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import api from '../hooks/useQuery';
import InstrumentSearchBar from '../components/instruments/InstrumentSearchBar';
import InstrumentSourceRail from '../components/instruments/InstrumentSourceRail';
import InstrumentResultPanel from '../components/instruments/InstrumentResultPanel';
import InstrumentSourcesDialog from '../components/instruments/InstrumentSourcesDialog';
import usePageTitleStore from '../store/pageTitleStore';

const ACCENT = '#4f46e5';

/**
 * Instrument Browser — one instrument, every registered dataset and report.
 *
 * A search fans out across all enabled sources at once rather than loading the
 * selected one lazily: the row counts in the rail are the answer to "where
 * does this instrument appear?", which is most of the value, and they are only
 * meaningful if every source has actually run.
 */
export default function InstrumentBrowser() {
  const [sources, setSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [query, setQuery] = useState({ instrumentId: '', period: '' });
  const [periods, setPeriods] = useState([]);
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  // The search that produced the results on screen. Kept separate from `query`
  // so editing the box does not relabel results from the previous search.
  const [active, setActive] = useState(null);
  const [states, setStates] = useState({});   // sourceId -> { loading, rows, columns, ... }
  const [activeId, setActiveId] = useState(null);
  const [configOpen, setConfigOpen] = useState(false);

  const setPageTitle = usePageTitleStore((s) => s.setTitle);
  const clearPageTitle = usePageTitleStore((s) => s.clear);
  const runIdRef = useRef(0);

  useEffect(() => {
    setPageTitle('Instrument Browser');
    return () => clearPageTitle();
  }, [setPageTitle, clearPageTitle]);

  const loadSources = useCallback(async () => {
    try {
      const { data } = await api.get('/instruments/sources');
      setSources(data);
      setLoadError('');
      return data;
    } catch (e) {
      setLoadError(e.response?.data?.error || e.message || 'Could not load sources');
      return [];
    } finally {
      setLoadingSources(false);
    }
  }, []);

  useEffect(() => { loadSources(); }, [loadSources]);

  // Accounting periods come from ExecutionState.executionDate. Loaded once and
  // reused; the browser still works without them (the date picker is unaffected).
  useEffect(() => {
    let cancelled = false;
    api.get('/instruments/periods')
      .then(({ data }) => { if (!cancelled) setPeriods(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setPeriods([]); })
      .finally(() => { if (!cancelled) setLoadingPeriods(false); });
    return () => { cancelled = true; };
  }, []);

  const enabled = useMemo(
    () => sources.filter((s) => s.enabled && !s.missing),
    [sources]
  );

  // The first enabled source doubles as the type-ahead source for the search box.
  const suggestSourceId = enabled[0]?._id || null;

  const activeSource = useMemo(
    () => enabled.find((s) => s._id === activeId) || null,
    [enabled, activeId]
  );

  // Which dimension the period control filters by is a property of the SOURCE,
  // chosen when it was configured — not something to pick per search. The
  // selected source decides it, and the other option is disabled.
  const periodMode = activeSource?.dateMode
    || enabled[0]?.dateMode
    || 'postingDate';

  const runAll = useCallback(async (overrideInstrument) => {
    const instrumentId = (overrideInstrument ?? query.instrumentId ?? '').trim();
    if (!instrumentId || enabled.length === 0) return;

    const period = query.period || '';
    const runId = ++runIdRef.current;

    setActive({ instrumentId, period, periodMode });
    setStates(Object.fromEntries(enabled.map((s) => [s._id, { loading: true }])));
    setActiveId((cur) => (enabled.some((s) => s._id === cur) ? cur : enabled[0]._id));

    await Promise.all(
      enabled.map(async (source) => {
        try {
          const { data } = await api.post('/instruments/run', {
            sourceId: source._id,
            instrumentId,
            // A source applies this the way it was configured: a posting-date
            // source matches the day, a period source matches the month.
            period,
          });
          if (runId !== runIdRef.current) return; // a newer search already started
          setStates((prev) => ({
            ...prev,
            [source._id]: {
              loading: false,
              rows: data?.data || [],
              columns: data?.columns || [],
              rowCount: (data?.data || []).length,
              executionTime: data?.executionTime,
              truncated: !!data?.truncated,
              pushedDown: !!data?.pushedDown,
            },
          }));
        } catch (e) {
          if (runId !== runIdRef.current) return;
          setStates((prev) => ({
            ...prev,
            [source._id]: {
              loading: false,
              error: e.response?.data?.error || e.message || 'Query failed',
            },
          }));
        }
      })
    );
  }, [enabled, query.instrumentId, query.period, periodMode]);

  // Applied optimistically so the row lands where it was dropped without a
  // round trip; the saved order only decides the rail's order, never results,
  // so a failure is recoverable by reloading the list.
  const onReorder = useCallback(async (orderedIds) => {
    const byId = new Map(sources.map((s) => [s._id, s]));
    const next = orderedIds.map((id) => byId.get(id)).filter(Boolean);
    const previous = sources;
    setSources(next);
    try {
      await api.post('/instruments/sources/reorder', { ids: orderedIds });
    } catch (e) {
      setSources(previous);
      setLoadError(e.response?.data?.error || 'Could not save the new order');
    }
  }, [sources]);

  // After the config dialog changes the registry, results on screen refer to a
  // source list that no longer matches — clear them rather than show stale counts.
  const onConfigChanged = useCallback(async () => {
    const next = await loadSources();
    setStates({});
    setActive(null);
    setActiveId(null);
    return next;
  }, [loadSources]);

  const totalHits = useMemo(
    () => Object.values(states).reduce((n, s) => n + (s?.rowCount || 0), 0),
    [states]
  );

  const anyLoading = Object.values(states).some((s) => s?.loading);

  /* ── Header ── */
  const header = (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent="space-between"
      alignItems={{ sm: 'flex-start' }}
      spacing={1.5}
      sx={{ mb: 2.5 }}
    >
      <Box>
        <Stack direction="row" alignItems="center" spacing={1.25}>
          <Box sx={{ width: 34, height: 34, borderRadius: '10px', bgcolor: '#eef2ff', color: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ManageSearchIcon sx={{ fontSize: 20 }} />
          </Box>
          <Typography variant="h1">Instrument Browser</Typography>
        </Stack>
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mt: 0.75 }}>
          Trace a single instrument across every dataset and report you choose to surface here.
        </Typography>
      </Box>

      {sources.length > 0 && (
        <Button
          startIcon={<TuneIcon sx={{ fontSize: 18 }} />}
          onClick={() => setConfigOpen(true)}
          sx={{ borderRadius: '10px', fontWeight: 600, border: '1px solid', borderColor: 'divider', px: 2, flexShrink: 0 }}
        >
          Configure sources
        </Button>
      )}
    </Stack>
  );

  /* ── First run: nothing registered yet ── */
  if (!loadingSources && sources.length === 0) {
    return (
      <Box className="fyntrac-fade-in">
        {header}
        {loadError && <Alert severity="error" sx={{ borderRadius: '12px', mb: 2 }}>{loadError}</Alert>}
        <Paper
          elevation={0}
          sx={{
            borderRadius: '16px', border: '1px dashed', borderColor: '#c7d2fe',
            background: 'linear-gradient(135deg, rgba(30,64,175,0.04) 0%, rgba(99,102,241,0.03) 100%)',
            p: 6, textAlign: 'center',
          }}
        >
          <Stack alignItems="center" spacing={2}>
            <Box sx={{ width: 56, height: 56, borderRadius: '18px', bgcolor: '#fff', color: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(15,23,42,0.06)' }}>
              <LayersOutlinedIcon sx={{ fontSize: 26 }} />
            </Box>
            <Typography sx={{ fontSize: '1.05rem', fontWeight: 700 }}>
              Choose what the browser should show
            </Typography>
            <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', maxWidth: 460 }}>
              Pick the datasets and reports you want to inspect instrument by instrument. For each one you
              map the column holding the instrument ID, and optionally the posting date.
            </Typography>
            <Button
              variant="contained"
              startIcon={<TuneIcon />}
              onClick={() => setConfigOpen(true)}
              sx={{ borderRadius: '10px', mt: 0.5, px: 3, boxShadow: 'none', '&:hover': { boxShadow: 'none' } }}
            >
              Configure sources
            </Button>
          </Stack>
        </Paper>

        <InstrumentSourcesDialog
          open={configOpen}
          onClose={() => setConfigOpen(false)}
          sources={sources}
          onChanged={onConfigChanged}
        />
      </Box>
    );
  }

  return (
    <Box className="fyntrac-fade-in">
      {header}

      {loadError && <Alert severity="error" sx={{ borderRadius: '12px', mb: 2 }}>{loadError}</Alert>}

      <InstrumentSearchBar
        instrumentId={query.instrumentId}
        period={query.period}
        periodMode={periodMode}
        activeSourceLabel={activeSource?.label || ''}
        onChange={(patch) => setQuery((q) => ({ ...q, ...patch }))}
        onSearch={(override) => runAll(typeof override === 'string' ? override : undefined)}
        searching={anyLoading}
        suggestSourceId={suggestSourceId}
        periods={periods}
        loadingPeriods={loadingPeriods}
        disabled={loadingSources || enabled.length === 0}
      />

      {!loadingSources && enabled.length === 0 && (
        <Alert severity="info" sx={{ borderRadius: '12px', mt: 2 }}
          action={<Button size="small" onClick={() => setConfigOpen(true)}>Configure</Button>}>
          Every source is currently disabled or its dataset/report was removed. Enable at least one to search.
        </Alert>
      )}

      {/* Result summary strip */}
      {active && !anyLoading && (
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 2 }}>
          <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
            {totalHits > 0
              ? `Found ${totalHits.toLocaleString()} rows for ${active.instrumentId} across ${Object.values(states).filter((s) => s?.rowCount > 0).length} of ${enabled.length} sources`
              : `No source has rows for ${active.instrumentId}${active.period ? ` in ${active.period}` : ''}`}
          </Typography>
          {active.period && (
            <Chip size="small" label={active.period}
              sx={{ height: 20, borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600, bgcolor: '#fef3c7', color: '#92400e' }} />
          )}
        </Stack>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '256px minmax(0, 1fr)' },
          gap: 2,
          mt: 2,
          alignItems: 'start',
        }}
      >
        <InstrumentSourceRail
          sources={sources}
          states={states}
          activeId={activeId}
          onSelect={setActiveId}
          onReorder={onReorder}
          loading={loadingSources}
        />

        <Box sx={{ minWidth: 0 }}>
          {loadingSources ? (
            <Skeleton variant="rounded" height={420} sx={{ borderRadius: '16px' }} />
          ) : !active ? (
            <Paper
              elevation={0}
              sx={{ borderRadius: '16px', border: '1px solid', borderColor: 'divider', p: 7, textAlign: 'center' }}
            >
              <Stack alignItems="center" spacing={1.5}>
                <Box sx={{ width: 52, height: 52, borderRadius: '16px', bgcolor: '#f1f5f9', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ManageSearchIcon sx={{ fontSize: 24 }} />
                </Box>
                <Typography sx={{ fontSize: '0.95rem', fontWeight: 700 }}>Search an instrument</Typography>
                <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', maxWidth: 420 }}>
                  Enter an instrument ID above to see it across all {enabled.length}{' '}
                  {enabled.length === 1 ? 'source' : 'sources'}. Leave the posting date blank to include every date.
                </Typography>
              </Stack>
            </Paper>
          ) : activeSource ? (
            <InstrumentResultPanel
              source={activeSource}
              state={states[activeSource._id]}
              instrumentId={active.instrumentId}
              period={active.period}
              periodMode={active.periodMode}
            />
          ) : null}
        </Box>
      </Box>

      <InstrumentSourcesDialog
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        sources={sources}
        onChanged={onConfigChanged}
      />
    </Box>
  );
}
