const router = require('express').Router();
const schemaService = require('../services/schema.service');
const mongoService = require('../services/mongo.service');

// GET /api/schema/collections
router.get('/collections', async (req, res) => {
  try {
    const collections = await schemaService.listCollections(req.user);
    res.json(collections);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/schema/collections/:name/fields
router.get('/collections/:name/fields', async (req, res) => {
  try {
    const fields = await schemaService.getCollectionFields(req.params.name, req.user);
    res.json(fields);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/schema/source/fields?kind=collection|dataset|question&name=...&id=...
 *
 * Unified field-introspection endpoint that the KPI editor (and other tools)
 * use to populate field pickers regardless of source kind.
 */
router.get('/source/fields', async (req, res) => {
  try {
    const { kind, name, id } = req.query;
    if (!kind) return res.status(400).json({ error: 'kind is required' });
    if (kind === 'collection') {
      if (!name) return res.status(400).json({ error: 'name is required for collection source' });
      const fields = await schemaService.getCollectionFields(name, req.user);
      return res.json(fields);
    }
    if (kind === 'dataset') {
      if (!id) return res.status(400).json({ error: 'id is required for dataset source' });
      const ds = await req.model('SavedModel').findOne({ _id: id, tenantId: req.user.tenantId, archived: { $ne: true } });
      if (!ds) return res.status(404).json({ error: 'Dataset not found' });
      const fields = await mongoService.inferSchemaFromPipeline(ds.sourceCollection, ds.pipeline || [], req.user);
      return res.json(fields);
    }
    if (kind === 'question') {
      if (!id) return res.status(400).json({ error: 'id is required for report source' });
      const q = await req.model('Question').findOne({ _id: id, tenantId: req.user.tenantId, archived: { $ne: true } });
      if (!q) return res.status(404).json({ error: 'Report not found' });
      const cfg = q.queryConfig || {};
      if (!cfg.collection) return res.status(400).json({ error: 'Report has no collection' });
      const fields = await mongoService.inferSchemaFromPipeline(cfg.collection, cfg.pipeline || [], req.user);
      return res.json(fields);
    }
    return res.status(400).json({ error: `unknown source kind: ${kind}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/schema/collections/:name/values?field=x&search=y&limit=20
 *
 * Returns up to `limit` (default 20, max 100) distinct non-null values for
 * `field` in the given collection, optionally filtered by a case-insensitive
 * prefix search on `search`. Used by the filter value autocomplete.
 *
 * Tenant isolation is applied via buildSecurityFilter inside executePipeline.
 */
router.get('/collections/:name/values', async (req, res) => {
  try {
    const { field, search, limit: rawLimit } = req.query;
    if (!field) return res.status(400).json({ error: 'field is required' });
    const limit = Math.min(parseInt(rawLimit, 10) || 20, 100);

    const pipeline = [
      { $match: { [field]: { $nin: [null, '', undefined] } } },
    ];

    // Apply case-insensitive prefix search if provided.
    if (search && search.trim()) {
      pipeline.push({
        $match: {
          [field]: { $regex: search.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), $options: 'i' },
        },
      });
    }

    pipeline.push(
      { $group: { _id: `$${field}` } },
      { $sort: { _id: 1 } },
      { $limit: limit },
      { $project: { _id: 0, value: '$_id' } },
    );

    const result = await mongoService.executePipeline(req.params.name, pipeline, req.user);
    const values = (result.data || []).map((r) => r.value).filter((v) => v != null);
    res.json(values);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/schema/source/values?kind=collection|dataset|question&name=...&id=...&field=...&search=...&limit=20
 *
 * Returns distinct non-null values for `field` in the resolved source.  Works
 * for plain collections as well as dataset/question sources (runs the source
 * prefix pipeline first).  Used by the KPI filter-value autocomplete.
 */
router.get('/source/values', async (req, res) => {
  try {
    const { kind, name, id, field, search, limit: rawLimit } = req.query;
    if (!field) return res.status(400).json({ error: 'field is required' });
    const limit = Math.min(parseInt(rawLimit, 10) || 20, 100);

    let collection, prefix;
    if (!kind || kind === 'collection') {
      if (!name) return res.status(400).json({ error: 'name is required for collection source' });
      collection = name; prefix = [];
    } else if (kind === 'dataset') {
      if (!id) return res.status(400).json({ error: 'id is required for dataset source' });
      const ds = await req.model('SavedModel').findOne({ _id: id, tenantId: req.user.tenantId, archived: { $ne: true } });
      if (!ds) return res.status(404).json({ error: 'Dataset not found' });
      collection = ds.sourceCollection; prefix = ds.pipeline || [];
    } else if (kind === 'question') {
      if (!id) return res.status(400).json({ error: 'id is required for report source' });
      const q = await req.model('Question').findOne({ _id: id, tenantId: req.user.tenantId, archived: { $ne: true } });
      if (!q) return res.status(404).json({ error: 'Report not found' });
      const cfg = q.queryConfig || {};
      if (!cfg.collection) return res.status(400).json({ error: 'Report has no collection' });
      collection = cfg.collection; prefix = Array.isArray(cfg.pipeline) ? cfg.pipeline : [];
    } else {
      return res.status(400).json({ error: `unknown source kind: ${kind}` });
    }

    const pipeline = [
      ...prefix,
      { $match: { [field]: { $nin: [null, '', undefined] } } },
    ];
    if (search && search.trim()) {
      pipeline.push({
        $match: {
          [field]: { $regex: search.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), $options: 'i' },
        },
      });
    }
    pipeline.push(
      { $group: { _id: `$${field}` } },
      { $sort: { _id: 1 } },
      { $limit: limit },
      { $project: { _id: 0, value: '$_id' } },
    );

    const result = await mongoService.executePipeline(collection, pipeline, req.user);
    const values = (result.data || []).map((r) => r.value).filter((v) => v != null);
    res.json(values);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
