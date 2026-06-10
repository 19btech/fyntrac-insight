import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Box } from '@mui/material';
import CollectionPicker from './CollectionPicker';
import FilterBuilder from './FilterBuilder';
import SummarizePanel from './SummarizePanel';
import SortLimitPanel from './SortLimitPanel';
import BuilderStepCard from './BuilderStepCard';

/**
 * Compose a MongoDB aggregation pipeline from visual builder state.
 * Order: $match (filters) → $group (summarize) → $sort → $limit
 *
 * `sorts` is an ordered list of `{ field, dir }`; we collapse it into a
 * single $sort stage that preserves key order so Mongo sorts by the first
 * field, then breaks ties with the second, etc.
 */
function buildPipeline({ filters, groupBys, metrics, sorts, limit }) {
  const stages = [];

  // FILTERS → $match (supports inline rows + savedFilterRef chips)
  const matchObj = {};
  const savedAnds = [];
  for (const f of filters) {
    if (f.savedFilterRef?.match) { savedAnds.push(f.savedFilterRef.match); continue; }
    if (!f.field || !f.operator) continue;
    if (f.operator === '$exists') {
      matchObj[f.field] = { $exists: true };
    } else if (f.operator === '$in' || f.operator === '$nin') {
      matchObj[f.field] = { [f.operator]: String(f.value).split(',').map((v) => v.trim()).filter(Boolean) };
    } else if (f.operator === '$regex') {
      matchObj[f.field] = { $regex: f.value, $options: 'i' };
    } else {
      const numVal = parseFloat(f.value);
      matchObj[f.field] = { [f.operator]: isNaN(numVal) || f.value === '' ? f.value : numVal };
    }
  }
  const hasInline = Object.keys(matchObj).length > 0;
  if (hasInline && savedAnds.length === 0) stages.push({ $match: matchObj });
  else if (!hasInline && savedAnds.length === 1) stages.push({ $match: savedAnds[0] });
  else if (hasInline || savedAnds.length > 0) {
    stages.push({ $match: { $and: [hasInline ? matchObj : null, ...savedAnds].filter(Boolean) } });
  }

  // SUMMARIZE → $group
  const cleanGroups = (groupBys || []).filter(Boolean);
  if (cleanGroups.length > 0 || metrics.length > 0) {
    // Composite _id for multi group-by; mongo doesn't allow dots in keys, so flatten.
    const safeKey = (path) => path.replace(/\./g, '_');
    let groupId;
    if (cleanGroups.length === 0) {
      groupId = null;
    } else if (cleanGroups.length === 1) {
      groupId = `$${cleanGroups[0]}`;
    } else {
      groupId = Object.fromEntries(cleanGroups.map((g) => [safeKey(g), `$${g}`]));
    }

    const group = { _id: groupId };
    for (const m of metrics) {
      const alias = m.alias || (m.agg === '$count' ? 'count' : `${m.agg.replace('$', '')}_${(m.field || 'val').replace(/\./g, '_')}`);
      if (m.agg === '$count') {
        group[alias] = { $sum: 1 };
      } else if (m.field) {
        group[alias] = { [m.agg]: `$${m.field}` };
      }
    }
    stages.push({ $group: group });

    // Project group keys back to flat columns + metrics
    const projection = { _id: 0 };
    if (cleanGroups.length === 1) {
      projection[cleanGroups[0]] = '$_id';
    } else if (cleanGroups.length > 1) {
      for (const g of cleanGroups) projection[g] = `$_id.${safeKey(g)}`;
    }
    for (const k of Object.keys(group)) {
      if (k !== '_id') projection[k] = 1;
    }
    stages.push({ $project: projection });
  }

  // SORT — multi-field, ordered. Skip blank rows so an unfinished sort
  // entry doesn't blow up the pipeline.
  const sortObj = {};
  for (const s of sorts || []) {
    if (!s || !s.field) continue;
    sortObj[s.field] = s.dir === 'asc' ? 1 : -1;
  }
  if (Object.keys(sortObj).length > 0) {
    stages.push({ $sort: sortObj });
  }

  // LIMIT
  if (limit && limit > 0) {
    stages.push({ $limit: limit });
  }

  return stages;
}

/**
 * Hydrate the multi-sort array from `initialState`. Accepts the new
 * `sorts: [{field, dir}]` shape and falls back to the legacy single-field
 * `sortField` / `sortDir` keys so saved reports keep working.
 */
function normalizeSorts(initialState) {
  if (!initialState) return [];
  if (Array.isArray(initialState.sorts) && initialState.sorts.length) {
    return initialState.sorts
      .filter((s) => s && typeof s === 'object')
      .map((s) => ({ field: s.field || '', dir: s.dir === 'asc' ? 'asc' : 'desc' }));
  }
  if (initialState.sortField) {
    return [{ field: initialState.sortField, dir: initialState.sortDir === 'asc' ? 'asc' : 'desc' }];
  }
  return [];
}

export default function QueryBuilderPanel({
  collection,
  datasetId,
  onCollectionChange,
  onSourceChange,
  onPipelineChange,
  initialState,
  onStateChange,
  collapseAll = false,
}) {
  const [filters, setFilters] = useState(() => initialState?.filters || []);
  const [groupBys, setGroupBys] = useState(() => initialState?.groupBys || []);
  const [metrics, setMetrics] = useState(() => initialState?.metrics || []);
  const [sorts, setSorts] = useState(() => normalizeSorts(initialState));
  const [limit, setLimit] = useState(() => initialState?.limit ?? 100);

  // Tracks the last builder state we either consumed from `initialState` or
  // pushed up via `onStateChange`. Used to break the feedback loop where
  // hydrating from initialState triggers onStateChange, which re-renders the
  // parent with a new initialState reference, which would otherwise re-hydrate
  // and cause an infinite flicker.
  const lastSyncedJsonRef = useRef('');

  // Hydrate from initialState when it actually changes (e.g. saved question
  // loaded async, or the user reverts a version). Compare by content so a
  // round-tripped object with identical values is a no-op.
  useEffect(() => {
    if (!initialState) return;
    const json = JSON.stringify({
      filters: initialState.filters || [],
      groupBys: initialState.groupBys || [],
      metrics: initialState.metrics || [],
      sorts: normalizeSorts(initialState),
      limit: initialState.limit ?? 100,
    });
    if (json === lastSyncedJsonRef.current) return;
    lastSyncedJsonRef.current = json;
    setFilters(initialState.filters || []);
    setGroupBys(initialState.groupBys || []);
    setMetrics(initialState.metrics || []);
    setSorts(normalizeSorts(initialState));
    setLimit(initialState.limit ?? 100);
  }, [initialState]);

  // Reset builder when the user changes collection — but NOT on the initial
  // load where collection is set together with initialState. Per product
  // requirement: changing the source clears all filters, grouping, sorting,
  // and limit so the user starts from a clean slate.
  const prevCollectionRef = useRef(collection);
  useEffect(() => {
    const prev = prevCollectionRef.current;
    if (prev && collection && prev !== collection) {
      setFilters([]);
      setGroupBys([]);
      setMetrics([]);
      setSorts([]);
      setLimit(100);
    }
    prevCollectionRef.current = collection;
  }, [collection]);

  const pipeline = useMemo(
    () => buildPipeline({ filters, groupBys, metrics, sorts, limit }),
    [filters, groupBys, metrics, sorts, limit]
  );

  // Push pipeline JSON up to the parent editor
  useEffect(() => {
    onPipelineChange?.(JSON.stringify(pipeline, null, 2));
  }, [pipeline, onPipelineChange]);

  // Push raw builder state up so the parent can persist it with the question.
  // We mirror the primary sort into the legacy sortField/sortDir keys so older
  // consumers (AI plan generator, dashboard cards) keep working. We also
  // record what we sent in `lastSyncedJsonRef` so the hydrate-from-initialState
  // effect skips the round-trip and avoids the flicker loop.
  useEffect(() => {
    const primary = sorts[0];
    const next = {
      filters, groupBys, metrics, sorts, limit,
      sortField: primary?.field || '',
      sortDir: primary?.dir || 'desc',
    };
    lastSyncedJsonRef.current = JSON.stringify({
      filters, groupBys, metrics, sorts, limit,
    });
    onStateChange?.(next);
  }, [filters, groupBys, metrics, sorts, limit, onStateChange]);

  // Compact summaries shown when each step card is collapsed.
  const fromSummary = collection ? collection : 'No source picked yet';
  const filterSummary = filters.length === 0 ? 'No filters' : `${filters.length} filter${filters.length === 1 ? '' : 's'}`;
  const sumSummary = (groupBys.length === 0 && metrics.length === 0)
    ? 'No grouping — raw rows'
    : `${groupBys.length} group${groupBys.length === 1 ? '' : 's'} · ${metrics.length} metric${metrics.length === 1 ? '' : 's'}`;
  const validSorts = sorts.filter((s) => s && s.field);
  const sortSummary = validSorts.length === 0
    ? `Limit ${limit || '∞'}`
    : validSorts.length === 1
      ? `Sort by ${validSorts[0].field} ${validSorts[0].dir === 'asc' ? '↑' : '↓'} · limit ${limit || '∞'}`
      : `Sort by ${validSorts.length} fields · limit ${limit || '∞'}`;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <BuilderStepCard
        index={1} kind="source" label="From"
        helper="Pick the dataset (recommended) or raw collection to query."
        summary={fromSummary}
        defaultOpen={collapseAll ? false : !collection}
      >
        <CollectionPicker
          collection={collection}
          datasetId={datasetId}
          onCollectionChange={onCollectionChange}
          onSourceChange={onSourceChange}
          exclude={['EventHistory']}
        />
      </BuilderStepCard>

      {collection && (
        <>
          <BuilderStepCard
            index={2} kind="filter" label="Filter"
            helper="Narrow rows with field-level filter rules."
            summary={filterSummary}
            defaultOpen={collapseAll ? false : filters.length === 0}
          >
            <FilterBuilder collection={collection} datasetId={datasetId} filters={filters} onChange={setFilters} />
          </BuilderStepCard>

          <BuilderStepCard
            index={3} kind="summarize" label="Summarize"
            helper="Group and aggregate. Skip to keep raw rows."
            summary={sumSummary}
            defaultOpen={collapseAll ? false : (groupBys.length === 0 && metrics.length === 0)}
          >
            <SummarizePanel
              collection={collection}
              datasetId={datasetId}
              groupBys={groupBys}
              metrics={metrics}
              onGroupBysChange={setGroupBys}
              onMetricsChange={setMetrics}
            />
          </BuilderStepCard>

          <BuilderStepCard
            index={4} kind="sort" label="Sort & Limit"
            helper="Order results and cap row count."
            summary={sortSummary}
            defaultOpen={false}
          >
            <SortLimitPanel
              collection={collection}
              datasetId={datasetId}
              sorts={sorts}
              limit={limit}
              onSortsChange={setSorts}
              onLimitChange={setLimit}
            />
          </BuilderStepCard>
        </>
      )}
    </Box>
  );
}
