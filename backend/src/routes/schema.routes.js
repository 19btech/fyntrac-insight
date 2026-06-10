const router = require('express').Router();
const schemaService = require('../services/schema.service');
const mongoService = require('../services/mongo.service');
const duckdbService = require('../services/duckdb.service');
require('../models/SavedModel.model');
require('../models/Question.model');

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

// GET /api/schema/collections/:kind/:id/fields
// Resolve the fields/columns produced by a dynamic report source (question / dataset).
router.get('/collections/:kind/:id/fields', async (req, res) => {
  const { kind, id } = req.params;
  try {
    if (kind === 'collection') {
      const fields = await schemaService.getCollectionFields(id, req.user);
      return res.json(fields);
    }
    if (kind === 'dataset') {
      if (!id) return res.status(400).json({ error: 'id is required for dataset source' });
      const ds = await req.model('SavedModel').findOne({ _id: id, tenantId: req.user.tenantId, archived: { $ne: true } });
      if (!ds) return res.status(404).json({ error: 'Dataset not found' });
      // SQL-backed datasets define their columns via the saved query, NOT the
      // source collection — run the query and infer fields from its output.
      // Steps-backed datasets carry a compiled Mongo pipeline we can sample.
      if (ds.sourceMode === 'savedQuery' && ds.savedQuerySql) {
        const result = await duckdbService.runQuery({ sql: ds.savedQuerySql, user: req.user, page: 0, pageSize: 200 });
        const fields = mongoService.inferSchemaFromRows(result.rows || [], result.columns || [], '');
        return res.json(fields);
      }
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
    res.status(400).json({ error: `Unsupported source kind: ${kind}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/schema/collections/:name/fields/:field/values
// Return distinct values for a field to populate autocomplete filters.
router.get('/collections/:name/fields/:field/values', async (req, res) => {
  const { name, field } = req.params;
  const { search, limit = 50 } = req.query;
  try {
    const values = await schemaService.getFieldValues(name, field, search, parseInt(limit, 10), req.user);
    res.json(values);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/schema/source/fields
// Unified endpoint that returns fields for any report source (kind + optional id)
router.get('/source/fields', async (req, res) => {
  const { kind, id, name } = req.query;
  try {
    if (!kind || kind === 'collection') {
      if (!name) return res.status(400).json({ error: 'name is required for collection source' });
      const fields = await schemaService.getCollectionFields(name, req.user);
      return res.json(fields);
    }
    if (kind === 'dataset') {
      if (!id) return res.status(400).json({ error: 'id is required for dataset source' });
      const ds = await req.model('SavedModel').findOne({ _id: id, tenantId: req.user.tenantId, archived: { $ne: true } });
      if (!ds) return res.status(404).json({ error: 'Dataset not found' });
      if (ds.sourceMode === 'savedQuery' && ds.savedQuerySql) {
        const result = await duckdbService.runQuery({ sql: ds.savedQuerySql, user: req.user, page: 0, pageSize: 200 });
        const fields = mongoService.inferSchemaFromRows(result.rows || [], result.columns || [], '');
        return res.json(fields);
      }
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
    res.status(400).json({ error: `Unsupported source kind: ${kind}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/schema/source/values
// Unified autocomplete endpoint that samples distinct values from a source's pipeline output.
router.get('/source/values', async (req, res) => {
  const { kind, id, name, field, search, limit = 50 } = req.query;
  if (!field) return res.status(400).json({ error: 'field is required' });

  try {
    let collection;
    let prefix;

    if (!kind || kind === 'collection') {
      if (!name) return res.status(400).json({ error: 'name is required for collection source' });
      collection = name; prefix = [];
    } else if (kind === 'dataset') {
      if (!id) return res.status(400).json({ error: 'id is required for dataset source' });
      const ds = await req.model('SavedModel').findOne({ _id: id, tenantId: req.user.tenantId, archived: { $ne: true } });
      if (!ds) return res.status(404).json({ error: 'Dataset not found' });
      // SQL-backed datasets: the field is a query-output column that does not
      // exist on the source collection, so pull distinct values from the SQL.
      if (ds.sourceMode === 'savedQuery' && ds.savedQuerySql) {
        const inner = ds.savedQuerySql.replace(/;\s*$/, '');
        const qField = `"${String(field).replace(/"/g, '""')}"`;
        let sql = `SELECT DISTINCT ${qField} AS value FROM (${inner}) AS _ds WHERE ${qField} IS NOT NULL`;
        if (search && search.trim()) {
          sql += ` AND CAST(${qField} AS VARCHAR) ILIKE '${search.trim().replace(/'/g, "''")}%'`;
        }
        sql += ` ORDER BY value LIMIT ${limit}`;
        const r = await duckdbService.runQuery({ sql, user: req.user, page: 0, pageSize: limit });
        return res.json((r.rows || []).map((x) => x.value).filter((v) => v != null));
      }
      collection = ds.sourceCollection; prefix = ds.pipeline || [];
    } else if (kind === 'question') {
      if (!id) return res.status(400).json({ error: 'id is required for report source' });
      const q = await req.model('Question').findOne({ _id: id, tenantId: req.user.tenantId, archived: { $ne: true } });
      if (!q) return res.status(404).json({ error: 'Report not found' });
      const cfg = q.queryConfig || {};
      if (!cfg.collection) return res.status(400).json({ error: 'Report has no collection' });
      collection = cfg.collection; prefix = cfg.pipeline || [];
    } else {
      return res.status(400).json({ error: `Unsupported source kind: ${kind}` });
    }

    const values = await mongoService.sampleDistinctValues(
      collection,
      prefix,
      field,
      search,
      parseInt(limit, 10),
      req.user
    );
    res.json(values);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
