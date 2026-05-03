const router = require('express').Router();
const Metric = require('../models/Metric.model');
const SavedModel = require('../models/SavedModel.model');
const Question = require('../models/Question.model');
const mongoService = require('../services/mongo.service');
const AuditLog = require('../models/AuditLog.model');
const { compileKpi, compileSide, buildMatch, comparisonMatch, coerceValue: compilerCoerceValue } = require('../services/kpi-compiler.service');
const { compileSavedFilter } = require('../services/saved-filter.service');

// executePipeline's normalizeBson converts BSON Dates to ISO strings.
// This regex lets us detect and convert them back to Date objects where needed.
const _ISO_DATE_DETECT_RX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// ── In-process caches ─────────────────────────────────────────────────────────
//
// PERFORMANCE: with millions of source rows, each evaluate call runs 2–3
// aggregations. Caching avoid repeated identical runs within the same minute.
//
// Source cache: stores the resolved { collection, prefix } for dataset/question
// sources. These rarely change, so a 5-minute TTL is safe.
const _sourceCache = new Map(); // key: `${tenantId}:${kind}:${id}` → { collection, prefix, ts }
const SOURCE_CACHE_TTL = 5 * 60_000; // 5 minutes

// Eval cache: stores the full evaluate result per metric per tenant.
// TTL is intentionally short (60 s) so live dashboards still feel up-to-date.
const _evalCache = new Map(); // key: `${tenantId}:${metricId}` → { data, ts }
const EVAL_CACHE_TTL = 60_000; // 60 seconds

function _sourceKey(tenantId, kind, id) { return `${tenantId}:${kind}:${id}`; }
function _evalKey(tenantId, metricId) { return `${tenantId}:${metricId}`; }

// Invalidate the eval-cache entry whenever a metric is saved/deleted.
function _invalidateEval(tenantId, metricId) {
  _evalCache.delete(_evalKey(tenantId, metricId));
}

function effectivePipeline(metric, periodMatch = null) {
  if (metric.definition && metric.definition.numerator) {
    return compileKpi(metric.definition, periodMatch);
  }
  return metric.pipeline || [];
}

/**
 * Resolve a KPI's `source` (kind+id) to the underlying collection name and a
 * prefix pipeline that must run *before* the KPI aggregation. Returns
 * `{ collection, prefix }`. Throws if the referenced dataset/question is gone.
 *
 * Results are cached for SOURCE_CACHE_TTL (5 min) to avoid a DB read on
 * every evaluate call — critical when evaluating many KPIs simultaneously.
 */
async function resolveSource(metric, user) {
  const src = metric.source;
  if (!src || !src.kind || src.kind === 'collection') {
    return { collection: metric.collection, prefix: [] };
  }

  const cacheKey = _sourceKey(user.tenantId, src.kind, String(src.id));
  const cached = _sourceCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < SOURCE_CACHE_TTL) {
    return { collection: cached.collection, prefix: cached.prefix };
  }

  let result;
  if (src.kind === 'dataset') {
    if (!src.id) throw new Error('source.id required for dataset source');
    const ds = await SavedModel.findOne({ _id: src.id, tenantId: user.tenantId, archived: { $ne: true } });
    if (!ds) throw new Error('Source dataset not found');
    result = { collection: ds.sourceCollection, prefix: ds.pipeline || [] };
  } else if (src.kind === 'question') {
    if (!src.id) throw new Error('source.id required for question source');
    const q = await Question.findOne({ _id: src.id, tenantId: user.tenantId, archived: { $ne: true } });
    if (!q) throw new Error('Source report not found');
    const cfg = q.queryConfig || {};
    if (!cfg.collection) throw new Error('Source report has no collection');
    result = { collection: cfg.collection, prefix: Array.isArray(cfg.pipeline) ? cfg.pipeline : [] };
  } else {
    result = { collection: metric.collection, prefix: [] };
  }

  _sourceCache.set(cacheKey, { ...result, ts: Date.now() });
  return result;
}

function extractValue(execResult) {
  // executePipeline returns { data, columns, executionTime }
  const rows = execResult?.data || execResult || [];
  if (!rows.length) return null;
  const row = rows[0];
  if (row.value !== undefined) return row.value;
  // fall back to first non-_id field
  for (const k of Object.keys(row)) {
    if (k !== '_id') return row[k];
  }
  return null;
}

// GET /api/metrics
router.get('/', async (req, res) => {
  try {
    const metrics = await Metric.find({ tenantId: req.user.tenantId, archived: { $ne: true } }).sort({ updatedAt: -1 });
    res.json(metrics);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/metrics
router.post('/', async (req, res) => {
  try {
    const { name, description, collection, source, pipeline, definition, format, targets,
      displayFormat, prefix, suffix, goalValue, trend, verified } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    // For dataset/question sources, the underlying collection is derived
    // server-side so callers don't have to pre-resolve it.
    let effectiveCollection = collection;
    let normalizedSource = source && source.kind ? source : { kind: 'collection' };
    if (normalizedSource.kind === 'dataset') {
      if (!normalizedSource.id) return res.status(400).json({ error: 'source.id is required for dataset source' });
      const ds = await SavedModel.findOne({ _id: normalizedSource.id, tenantId: req.user.tenantId });
      if (!ds) return res.status(400).json({ error: 'Source dataset not found' });
      effectiveCollection = ds.sourceCollection;
      normalizedSource.name = ds.name;
    } else if (normalizedSource.kind === 'question') {
      if (!normalizedSource.id) return res.status(400).json({ error: 'source.id is required for report source' });
      const q = await Question.findOne({ _id: normalizedSource.id, tenantId: req.user.tenantId });
      if (!q) return res.status(400).json({ error: 'Source report not found' });
      effectiveCollection = q.queryConfig?.collection;
      normalizedSource.name = q.name;
    }
    if (!effectiveCollection) return res.status(400).json({ error: 'collection is required' });
    if (!definition?.numerator && (!Array.isArray(pipeline) || pipeline.length === 0)) {
      return res.status(400).json({ error: 'either definition.numerator or pipeline is required' });
    }
    const metric = await Metric.create({
      name, description, collection: effectiveCollection,
      source: normalizedSource,
      pipeline: pipeline || [],
      definition: definition || null,
      format: format || null,
      targets: targets || null,
      displayFormat: displayFormat || (format?.kind) || 'number',
      prefix, suffix, goalValue,
      trend: trend || { enabled: false },
      verified: !!verified,
      tenantId: req.user.tenantId,
      createdBy: req.user.userId,
    });
    AuditLog.create({ tenantId: req.user.tenantId, userId: req.user.userId, action: 'metric.create', resourceId: metric._id, resourceType: 'metric' }).catch(() => {});
    res.status(201).json(metric);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * Core metric evaluation engine — shared by the saved-metric evaluate route
 * and the unsaved evaluate-preview route (KPI modal live rail).
 *
 * Includes full time-intelligence: period-field auto-detection, saved date-
 * filter fallback, and current/previous period aggregation (fused $facet or
 * two-pass depending on definition shape).
 *
 * @param {object} metric  Metric-like: { collection, source, definition, pipeline, trend }
 * @param {object} user    req.user ({ tenantId, userId, … })
 * @returns {{ value, trendValue, comparison, currentPeriodValue, previousPeriodValue, executionTimeMs }}
 */
async function runEvaluation(metric, user) {
  const start = Date.now();
  const def = metric.definition;
  const timeFilter = def?.timeFilter || null;
  const periodField = def?.periodField || null;

  const resolved = await resolveSource(metric, user); // throws if source is missing

  // ── Date helpers ──────────────────────────────────────────────────────────
  const startOfDayUTC = (d) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };
  const endOfDayUTC   = (d) => { const x = new Date(d); x.setUTCHours(23, 59, 59, 999); return x; };
  const toPeriodMatch = (field, value) =>
    value instanceof Date
      ? { [field]: { $gte: startOfDayUTC(value), $lte: endOfDayUTC(value) } }
      : { [field]: value };
  const dayLabelToDate = (label) => {
    const d = new Date(label + 'T00:00:00.000Z');
    return isNaN(d.getTime()) ? null : d;
  };

  // ── Period detection ──────────────────────────────────────────────────────
  const periodFilterRule = (def?.filters || []).find(
    (f) => f && f.field === periodField && f.operator !== '$exists'
  );
  let currentPeriodMatch  = null;
  let previousPeriodMatch = null;
  let currentPeriodValue  = null;
  let previousPeriodValue = null;

  if (periodField) {
    const coercedFilterValue = periodFilterRule && periodFilterRule.operator === '$eq'
      ? compilerCoerceValue(periodFilterRule.value)
      : null;

    if (coercedFilterValue != null) {
      // User pinned the current period explicitly via an $eq filter.
      currentPeriodValue = coercedFilterValue;
      currentPeriodMatch = toPeriodMatch(periodField, currentPeriodValue);
      const isDateValue  = coercedFilterValue instanceof Date;
      const ltBound      = isDateValue ? startOfDayUTC(coercedFilterValue) : coercedFilterValue;

      if (isDateValue) {
        const prevPipeline = [
          ...resolved.prefix,
          { $match: { [periodField]: { $exists: true, $ne: null, $lt: ltBound } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: `$${periodField}` } } } },
          { $sort: { _id: -1 } }, { $limit: 1 },
          { $project: { _id: 0, periodValue: '$_id' } },
        ];
        const prev = await mongoService.executePipeline(resolved.collection, prevPipeline, user);
        if (prev.data && prev.data.length) {
          const rawPrev = prev.data[0].periodValue;
          previousPeriodValue = rawPrev;
          const prevDate = dayLabelToDate(rawPrev);
          previousPeriodMatch = prevDate ? toPeriodMatch(periodField, prevDate) : { [periodField]: rawPrev };
        }
      } else {
        const prevPipeline = [
          ...resolved.prefix,
          { $match: { [periodField]: { $exists: true, $ne: null, $lt: ltBound } } },
          { $sort: { [periodField]: -1 } }, { $limit: 1 },
          { $project: { _id: 0, periodValue: `$${periodField}` } },
        ];
        const prev = await mongoService.executePipeline(resolved.collection, prevPipeline, user);
        if (prev.data && prev.data.length) {
          previousPeriodValue = prev.data[0].periodValue;
          previousPeriodMatch = { [periodField]: previousPeriodValue };
        }
      }
    } else if (!periodFilterRule) {
      // No user constraint — auto-detect the latest two distinct period values.
      const samplePipe = [
        ...resolved.prefix,
        { $match: { [periodField]: { $exists: true, $ne: null } } },
        { $sort: { [periodField]: -1 } }, { $limit: 1 },
        { $project: { _id: 0, v: `$${periodField}` } },
      ];
      const sample = await mongoService.executePipeline(resolved.collection, samplePipe, user);
      const sampleVal = sample.data?.[0]?.v ?? null;
      // executePipeline's normalizeBson converts BSON Dates to ISO strings.
      // Convert them back so the instanceof Date branch fires for date fields.
      const resolvedSampleVal = (typeof sampleVal === 'string' && _ISO_DATE_DETECT_RX.test(sampleVal))
        ? new Date(sampleVal)
        : sampleVal;

      if (resolvedSampleVal instanceof Date) {
        const dayPipeline = [
          ...resolved.prefix,
          { $match: { [periodField]: { $exists: true, $ne: null } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: `$${periodField}` } } } },
          { $sort: { _id: -1 } }, { $limit: 2 },
          { $project: { _id: 0, periodValue: '$_id' } },
        ];
        const dd = await mongoService.executePipeline(resolved.collection, dayPipeline, user);
        const periods = (dd.data || []).map((r) => dayLabelToDate(r.periodValue) || r.periodValue);
        if (periods.length >= 1) { currentPeriodValue = periods[0]; currentPeriodMatch = toPeriodMatch(periodField, periods[0]); }
        if (periods.length >= 2) { previousPeriodValue = periods[1]; previousPeriodMatch = toPeriodMatch(periodField, periods[1]); }
      } else if (resolvedSampleVal != null) {
        currentPeriodValue = resolvedSampleVal;
        currentPeriodMatch = { [periodField]: resolvedSampleVal };
        const prevPipe = [
          ...resolved.prefix,
          { $match: { [periodField]: { $exists: true, $ne: null, $lt: resolvedSampleVal } } },
          { $sort: { [periodField]: -1 } }, { $limit: 1 },
          { $project: { _id: 0, v: `$${periodField}` } },
        ];
        const prevR = await mongoService.executePipeline(resolved.collection, prevPipe, user);
        if (prevR.data?.[0]?.v != null) {
          previousPeriodValue = prevR.data[0].v;
          previousPeriodMatch = { [periodField]: previousPeriodValue };
        }
      }
    }
    // (else: user used a range operator — trust the filter as-is, no auto period.)
  }

  const periodMatch = currentPeriodMatch || (timeFilter ? compileSavedFilter(timeFilter) : null);
  const activePeriodMatch = periodMatch && Object.keys(periodMatch).length ? periodMatch : null;

  // ── Aggregation ───────────────────────────────────────────────────────────
  const comparison = def?.comparison || (metric.trend?.enabled ? 'lastPeriod' : 'none');
  let value = null;
  let trendValue = null;

  const cmpDef = def && periodField
    ? { ...def, filters: (def.filters || []).filter((f) => f && f.field !== periodField) }
    : def;
  const canFacet = def?.numerator && !def?.denominator
    && comparison === 'lastPeriod' && previousPeriodMatch;

  if (canFacet) {
    const topMatch    = buildMatch(def.filters);
    const prevTopMatch = buildMatch(cmpDef.filters);
    const currentStages = compileSide(def.numerator, activePeriodMatch, topMatch);
    const prevStages    = compileSide(cmpDef.numerator, previousPeriodMatch, prevTopMatch);
    const facetPipeline = [
      ...resolved.prefix,
      { $facet: { current: currentStages, previous: prevStages } },
      { $project: {
        currentValue:  { $arrayElemAt: ['$current.value',  0] },
        previousValue: { $arrayElemAt: ['$previous.value', 0] },
      }},
    ];
    const facetResult = await mongoService.executePipeline(resolved.collection, facetPipeline, user);
    value      = facetResult.data?.[0]?.currentValue  ?? null;
    trendValue = facetResult.data?.[0]?.previousValue ?? null;
  } else {
    const kpiPipeline = effectivePipeline(metric, activePeriodMatch);
    const fullPipeline = kpiPipeline.length ? [...resolved.prefix, ...kpiPipeline] : [];
    const result = fullPipeline.length
      ? await mongoService.executePipeline(resolved.collection, fullPipeline, user)
      : { data: [] };
    value = extractValue(result);

    if (comparison && comparison !== 'none') {
      if (def?.numerator) {
        let cmpMatch = null;
        if (periodField) {
          if (comparison === 'lastPeriod') cmpMatch = previousPeriodMatch;
        } else {
          cmpMatch = comparisonMatch(timeFilter, comparison);
        }
        if (cmpMatch) {
          const cmpKpi = compileKpi(cmpDef, cmpMatch);
          const cmp = await mongoService.executePipeline(resolved.collection, [...resolved.prefix, ...cmpKpi], user);
          trendValue = extractValue(cmp);
        }
      } else if (Array.isArray(metric.trend?.comparisonPipeline) && metric.trend.comparisonPipeline.length) {
        const cmp = await mongoService.executePipeline(metric.collection, metric.trend.comparisonPipeline, user);
        trendValue = extractValue(cmp);
      }
    }
  }

  return { value, trendValue, comparison, currentPeriodValue, previousPeriodValue, executionTimeMs: Date.now() - start };
}

// POST /api/metrics/evaluate-preview
// Evaluates an *unsaved* metric definition inline — used by the KPI modal live preview rail.
// Uses the full runEvaluation engine (including period detection / time intelligence).
// Must be declared before GET /:id so "evaluate-preview" is not captured as a :id param.
router.post('/evaluate-preview', async (req, res) => {
  try {
    const { source, collection, definition, pipeline } = req.body;
    const fakeMetric = {
      collection: collection || '',
      source: source || { kind: 'collection' },
      definition: definition || null,
      pipeline: Array.isArray(pipeline) ? pipeline : [],
      trend: { enabled: false, comparisonPipeline: [] },
    };
    const ev = await runEvaluation(fakeMetric, req.user);
    res.json({
      value: ev.value,
      trendValue: ev.trendValue,
      comparison: ev.comparison,
      currentPeriod: ev.currentPeriodValue,
      previousPeriod: ev.previousPeriodValue,
      executionTimeMs: ev.executionTimeMs,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/metrics/:id/evaluate
//
// PERFORMANCE NOTE (millions of rows):
//   1. Source resolution is cached 5 min (see _sourceCache) — avoids a MongoDB
//      meta-read on every call for dataset/report sources.
//   2. Full result is cached 60 s (see _evalCache) — pages with many KPI tiles
//      share one execution per metric per minute.
//   3. Period detection uses $sort+$limit (2 indexed reads) instead of a full
//      $group across the whole collection. Requires a descending index on the
//      periodField in the source collection.
//   4. Current + previous aggregations are fused into a single $facet stage
//      for structured-definition KPIs, halving the number of collection scans.
router.post('/:id/evaluate', async (req, res) => {
  try {
    const metric = await Metric.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!metric) return res.status(404).json({ error: 'Metric not found' });

    // ── Result cache ──────────────────────────────────────────────────────
    const ek = _evalKey(req.user.tenantId, String(metric._id));
    const ec = _evalCache.get(ek);
    if (ec && (Date.now() - ec.ts) < EVAL_CACHE_TTL) return res.json(ec.data);

    const { value, trendValue, comparison, currentPeriodValue, previousPeriodValue, executionTimeMs } =
      await runEvaluation(metric, req.user);

    AuditLog.create({
      tenantId: req.user.tenantId, userId: req.user.userId,
      action: 'metric.evaluate', resourceId: metric._id, resourceType: 'metric', executionTimeMs,
    }).catch(() => {});

    const payload = {
      metricId: metric._id,
      name: metric.name,
      value,
      trendValue,
      comparison,
      currentPeriod:  currentPeriodValue,
      previousPeriod: previousPeriodValue,
      format:  metric.format,
      targets: metric.targets,
      executionTimeMs,
    };

    _evalCache.set(ek, { data: payload, ts: Date.now() });
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const metric = await Metric.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!metric) return res.status(404).json({ error: 'Metric not found' });
    res.json(metric);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/metrics/:id
router.put('/:id', async (req, res) => {
  try {
    const metric = await Metric.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!metric) return res.status(404).json({ error: 'Metric not found' });
    const { name, description, collection, source, pipeline, definition, format, targets,
      displayFormat, prefix, suffix, goalValue, trend, verified } = req.body;

    // If source changed, re-resolve underlying collection name.
    let nextCollection = collection ?? metric.collection;
    let nextSource = source !== undefined ? source : metric.source;
    if (source && source.kind && source.kind !== 'collection') {
      if (!source.id) return res.status(400).json({ error: 'source.id is required' });
      if (source.kind === 'dataset') {
        const ds = await SavedModel.findOne({ _id: source.id, tenantId: req.user.tenantId });
        if (!ds) return res.status(400).json({ error: 'Source dataset not found' });
        nextCollection = ds.sourceCollection;
        nextSource = { kind: 'dataset', id: source.id, name: ds.name };
      } else if (source.kind === 'question') {
        const q = await Question.findOne({ _id: source.id, tenantId: req.user.tenantId });
        if (!q) return res.status(400).json({ error: 'Source report not found' });
        nextCollection = q.queryConfig?.collection || nextCollection;
        nextSource = { kind: 'question', id: source.id, name: q.name };
      }
    } else if (source && source.kind === 'collection') {
      nextSource = { kind: 'collection', id: null, name: '' };
    }

    Object.assign(metric, {
      name: name ?? metric.name,
      description: description ?? metric.description,
      collection: nextCollection,
      source: nextSource,
      pipeline: pipeline ?? metric.pipeline,
      definition: definition !== undefined ? definition : metric.definition,
      format: format !== undefined ? format : metric.format,
      targets: targets !== undefined ? targets : metric.targets,
      displayFormat: displayFormat ?? metric.displayFormat,
      prefix: prefix ?? metric.prefix,
      suffix: suffix ?? metric.suffix,
      goalValue: goalValue ?? metric.goalValue,
      trend: trend ?? metric.trend,
      verified: verified !== undefined ? !!verified : metric.verified,
    });
    await metric.save();
    _invalidateEval(req.user.tenantId, req.params.id);
    res.json(metric);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/metrics/:id  (soft archive)
router.delete('/:id', async (req, res) => {
  try {
    const metric = await Metric.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      { archived: true, archivedAt: new Date() },
      { new: true }
    );
    if (!metric) return res.status(404).json({ error: 'Metric not found' });
    _invalidateEval(req.user.tenantId, req.params.id);
    res.json({ archived: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
