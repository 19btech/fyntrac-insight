const crypto = require('crypto');
const mongoService = require('./mongo.service');
const cacheService = require('./cache.service');
const duckdbService = require('./duckdb.service');
require('mingo/init/system'); // register all aggregation operators ($group, $sum, …)
const { aggregate: mingoAggregate } = require('mingo');

const MAX_ROWS = parseInt(process.env.MAX_QUERY_ROWS || '50000', 10);
// Cap on rows materialised from a SQL-backed dataset before the report's own
// pipeline runs over them in-memory. Prism datasets used as report sources are
// typically shaped/aggregated, so this is generous.
const SQL_DATASET_MAX = parseInt(process.env.MAX_SQL_DATASET_ROWS || '100000', 10);

/**
 * Strip `_`-prefixed system fields from a row — mirrors executePipeline so a
 * SQL-dataset report behaves identically to a Mongo one (e.g. a `$group` must
 * `$project` its `_id` into a named field to be displayed).
 */
function stripSystemKeys(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (!k.startsWith('_')) out[k] = v;
  }
  return out;
}

/** Derive an ordered column list from result rows (union of keys, first-seen). */
function columnsFromRows(rows, fallback = []) {
  if (!rows || !rows.length) return fallback;
  const seen = [];
  const set = new Set();
  for (const row of rows) {
    for (const k of Object.keys(row || {})) {
      if (k.startsWith('_')) continue;
      if (!set.has(k)) { set.add(k); seen.push(k); }
    }
  }
  return seen.length ? seen : fallback;
}

/**
 * Substitute {{variable_name}} template placeholders in a pipeline JSON string.
 */
function substituteVariables(pipeline, variables) {
  // Short-circuit when there is nothing to substitute. The body below round
  // trips through JSON, which would turn any Date in the pipeline into a
  // string — and a stringified date never matches a BSON date field. The
  // Instrument Browser builds real Dates, so this path has to leave them be.
  // (It also skips a stringify/parse of the whole pipeline on every query.)
  if (!variables || Object.keys(variables).length === 0) return pipeline;

  let str = JSON.stringify(pipeline);
  for (const [key, value] of Object.entries(variables || {})) {
    // Escape the value for safe JSON injection
    const safeValue = JSON.stringify(value);
    // Replace "{{key}}" string occurrences (the quotes are part of surrounding JSON)
    str = str.replace(new RegExp(`"\\{\\{${key}\\}\\}"`, 'g'), safeValue);
    // Also replace bare {{key}} inside string values
    str = str.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
  }
  return JSON.parse(str);
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Execute a query and return { payload, cacheHit }.
 *
 * Extracted from POST /api/query/run so other features (the Instrument
 * Browser) can run datasets and reports without re-implementing the
 * dataset-vs-report and Mongo-vs-SQL(DuckDB) branches.
 *
 * `prependStages` / `appendStages` wrap the caller's pipeline once the source
 * model has been resolved. Prepending matters for performance: a $match placed
 * before a dataset's own stages can still use a collection index, while the
 * same $match appended after them cannot.
 *
 * Uses `user.getModel(name)` for tenant-scoped model access (set by
 * tenantDbMiddleware in tenant-db.service.js).
 */
async function runQuery({
  collection,
  pipeline,
  variables,
  cacheTTL,
  sourceModelId,
  user,
  prependStages = [],
  appendStages = [],
  audit = true,
  prefilter = null,
  prelimit = 0,
  rootStages = [],
}) {
  let effectiveCollection = collection;
  let effectivePipeline = Array.isArray(pipeline) ? pipeline : [];

  if (sourceModelId) {
    let model;
    try {
      model = await user.getModel('SavedModel').findOne({
        _id: sourceModelId,
        tenantId: user.tenantId,
        archived: { $ne: true },
      });
    } catch (err) {
      throw httpError(400, 'Invalid sourceModelId');
    }
    if (!model) throw httpError(404, 'Source model not found');

    if (model.sourceMode === 'savedQuery' && model.savedQuerySql) {
      // SQL (Prism) dataset: DuckDB defines the columns, so run the dataset SQL
      // and apply the caller's pipeline over its output in-memory.
      const reportPipeline = [
        ...prependStages,
        ...substituteVariables(effectivePipeline, variables),
        ...appendStages,
      ];
      // The dataset's SQL is part of the key. A Mongo dataset's pipeline is
      // already embedded in the key via effectivePipeline, but a SQL dataset's
      // query is not — so without this, editing the Prism query and re-running
      // would hit the cache and return rows from the OLD query.
      const sqlFingerprint = crypto
        .createHash('sha1')
        .update(model.savedQuerySql || '')
        .digest('hex')
        .slice(0, 12);
      const cacheKey = cacheService.buildCacheKey(
        user.tenantId,
        `dataset:${model._id}:${sqlFingerprint}${prefilter ? `:${JSON.stringify(prefilter)}` : ''}${prelimit ? `:pl${prelimit}` : ''}`,
        reportPipeline,
        variables,
      );
      const cached = await cacheService.get(cacheKey);
      if (cached) return { payload: { ...cached, cachedAt: cached.cachedAt }, cacheHit: true };

      const started = Date.now();
      // `prefilter` narrows the Mongo read that feeds DuckDB. Without it a SQL
      // dataset streams its whole source collection into a temp table on every
      // run, which dwarfs the cost of the filter itself.
      const base = await duckdbService.runQuery({
        sql: model.savedQuerySql, user, page: 0, pageSize: SQL_DATASET_MAX, prefilter, prelimit,
      });
      const baseRows = base.rows || [];
      let out = reportPipeline.length ? mingoAggregate(baseRows, reportPipeline) : baseRows;
      const hasLimit = reportPipeline.some((s) => s && s.$limit !== undefined);
      const truncated = (!hasLimit && out.length >= MAX_ROWS) || baseRows.length >= SQL_DATASET_MAX;
      if (!hasLimit && out.length > MAX_ROWS) out = out.slice(0, MAX_ROWS);
      const cleanData = out.map(stripSystemKeys);
      const payload = {
        data: cleanData,
        columns: columnsFromRows(cleanData, base.columns || []),
        truncated,
        executionTime: Date.now() - started,
        cachedAt: new Date().toISOString(),
      };
      await cacheService.set(cacheKey, payload, cacheTTL && Number(cacheTTL) > 0 ? Number(cacheTTL) : undefined);
      if (audit) {
        user.getModel('AuditLog').create({
          tenantId: user.tenantId, userId: user.userId, action: 'query.run',
          resourceType: 'dataset', resourceId: String(model._id), executionTimeMs: payload.executionTime,
        }).catch(() => {});
      }
      return { payload, cacheHit: false };
    }

    // Steps dataset — prepend the compiled Mongo pipeline (Mongo-on-Mongo).
    effectiveCollection = model.sourceCollection;
    effectivePipeline = [...(model.pipeline || []), ...effectivePipeline];
  }

  effectivePipeline = [...prependStages, ...effectivePipeline, ...appendStages];

  if (!effectiveCollection || typeof effectiveCollection !== 'string') {
    throw httpError(400, 'collection is required');
  }
  if (!Array.isArray(effectivePipeline)) {
    throw httpError(400, 'pipeline must be a JSON array');
  }

  const cacheKey = cacheService.buildCacheKey(
    user.tenantId,
    effectiveCollection,
    rootStages.length ? [...rootStages, ...effectivePipeline] : effectivePipeline,
    variables,
  );
  const cached = await cacheService.get(cacheKey);
  if (cached) return { payload: { ...cached, cachedAt: cached.cachedAt }, cacheHit: true };

  const substituted = substituteVariables(effectivePipeline, variables);
  const hasLimit = substituted.some((s) => s.$limit !== undefined);
  const cappedPipeline = hasLimit ? substituted : [...substituted, { $limit: MAX_ROWS }];
  const result = await mongoService.executePipeline(effectiveCollection, cappedPipeline, user, { rootStages });
  const truncated = !hasLimit && result.data.length >= MAX_ROWS;
  const payload = { ...result, truncated, cachedAt: new Date().toISOString() };
  await cacheService.set(cacheKey, payload, cacheTTL && Number(cacheTTL) > 0 ? Number(cacheTTL) : undefined);

  if (audit) {
    user.getModel('AuditLog').create({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'query.run',
      resourceType: 'collection',
      resourceId: effectiveCollection,
      executionTimeMs: result.executionTime,
    }).catch(() => {});
  }

  return { payload, cacheHit: false };
}

module.exports = {
  runQuery,
  stripSystemKeys,
  columnsFromRows,
  substituteVariables,
  MAX_ROWS,
  SQL_DATASET_MAX,
};
