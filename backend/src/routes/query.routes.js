const router = require('express').Router();
const mongoService = require('../services/mongo.service');
const cacheService = require('../services/cache.service');
const AuditLog = require('../models/AuditLog.model');
const SavedModel = require('../models/SavedModel.model');

const MAX_ROWS = parseInt(process.env.MAX_QUERY_ROWS || '50000', 10);

/**
 * Substitute {{variable_name}} template placeholders in a pipeline JSON string.
 */
function substituteVariables(pipeline, variables) {
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

// POST /api/query/run
router.post('/run', async (req, res) => {
  const { collection, pipeline, variables, cacheTTL, sourceModelId } = req.body;

  let effectiveCollection = collection;
  let effectivePipeline = pipeline;

  // v60: question built on top of a saved model — prepend the model's pipeline
  if (sourceModelId) {
    try {
      const model = await req.model('SavedModel').findOne({
        _id: sourceModelId,
        tenantId: req.user.tenantId,
        archived: { $ne: true },
      });
      if (!model) return res.status(404).json({ error: 'Source model not found' });
      effectiveCollection = model.sourceCollection;
      effectivePipeline = [...(model.pipeline || []), ...(Array.isArray(pipeline) ? pipeline : [])];
    } catch (err) {
      return res.status(400).json({ error: 'Invalid sourceModelId' });
    }
  }

  if (!effectiveCollection || typeof effectiveCollection !== 'string') {
    return res.status(400).json({ error: 'collection is required' });
  }
  if (!Array.isArray(effectivePipeline)) {
    return res.status(400).json({ error: 'pipeline must be a JSON array' });
  }

  const cacheKey = cacheService.buildCacheKey(
    req.user.tenantId,
    effectiveCollection,
    effectivePipeline,
    variables
  );

  const cached = await cacheService.get(cacheKey);
  if (cached) {
    res.set('X-Cache', 'HIT');
    return res.json({ ...cached, cachedAt: cached.cachedAt });
  }

  try {
    const substituted = substituteVariables(effectivePipeline, variables);
    const hasLimit = substituted.some((s) => s.$limit !== undefined);
    const cappedPipeline = hasLimit ? substituted : [...substituted, { $limit: MAX_ROWS }];
    const result = await mongoService.executePipeline(effectiveCollection, cappedPipeline, req.user);
    const truncated = !hasLimit && result.data.length >= MAX_ROWS;
    const payload = { ...result, truncated, cachedAt: new Date().toISOString() };
    await cacheService.set(cacheKey, payload, cacheTTL && Number(cacheTTL) > 0 ? Number(cacheTTL) : undefined);
    res.set('X-Cache', 'MISS');

    // Audit log (fire-and-forget)
    req.model('AuditLog').create({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      action: 'query.run',
      resourceType: 'collection',
      resourceId: effectiveCollection,
      executionTimeMs: result.executionTime,
    }).catch(() => {});

    res.json(payload);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
