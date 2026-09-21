const router = require('express').Router();
const mongoService = require('../services/mongo.service');
const duckdbService = require('../services/duckdb.service');
const schemaService = require('../services/schema.service');
const sqlExportService = require('../services/sql-export.service');
const aiService = require('../services/ai.service');
const { parseAndValidate } = require('../services/sql-pushdown.service');
const queryRunner = require('../services/query-runner.service');
const lineageService = require('../services/lineage.service');
require('../models/SavedQuery.model');
require('../models/SqlExport.model');

// POST /api/query/run
router.post('/run', async (req, res) => {
  const { collection, pipeline, variables, cacheTTL, sourceModelId } = req.body;
  try {
    const { payload, cacheHit } = await queryRunner.runQuery({
      collection, pipeline, variables, cacheTTL, sourceModelId, user: req.user,
    });
    res.set('X-Cache', cacheHit ? 'HIT' : 'MISS');
    res.json(payload);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// SQL Lab — read-only SQL over MongoDB via DuckDB
// ─────────────────────────────────────────────────────────────────────────

/**
 * GET /api/query/collections
 * All queryable collections plus their fields, for the SQL Lab sidebar and
 * editor autocomplete. Reuses the existing schema service (same tenant
 * security + exclusion rules as every other picker).
 */
router.get('/collections', async (req, res) => {
  try {
    // SQL Lab list — includes picker-only collections (e.g. EventHistory).
    const names = await mongoService.getSqlCollections(req.user);
    const collections = await Promise.all(
      names.map(async (name) => {
        let fields = [];
        try {
          fields = await schemaService.getCollectionFields(name, req.user);
        } catch {
          fields = [];
        }
        return { name, fields };
      })
    );
    res.json({ collections });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/query/sql
 * Run a read-only SELECT. Body: { sql, page, pageSize }.
 * Returns one page of rows plus total rowCount, columns, and executionTime.
 */
router.post('/sql', async (req, res) => {
  const { sql, page, pageSize, sort } = req.body || {};
  if (!sql || typeof sql !== 'string') {
    return res.status(400).json({ error: 'sql is required' });
  }
  try {
    const result = await duckdbService.runQuery({
      sql,
      user: req.user,
      page: Number.isInteger(page) ? page : 0,
      pageSize: Math.min(Math.max(parseInt(pageSize, 10) || 100, 1), 1000),
      sort: Array.isArray(sort) ? sort : [],
    });

    req.model('AuditLog').create({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      action: 'query.sql',
      resourceType: 'sql',
      resourceId: 'sql-lab',
      executionTimeMs: result.executionTime,
    }).catch(() => {});

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/query/export
 * Kick off an async full-result CSV export. Body: { sql }.
 * Returns the job (status: pending) and estimatedRows immediately.
 */
router.post('/export', async (req, res) => {
  const { sql } = req.body || {};
  if (!sql || typeof sql !== 'string') {
    return res.status(400).json({ error: 'sql is required' });
  }
  try {
    // estimateRows also parse-validates the SQL, so an invalid/non-SELECT query
    // fails fast here (400) instead of silently inside the background job.
    const estimatedRows = await duckdbService.estimateRows({ sql, user: req.user });
    const job = await sqlExportService.createExport({ sql, user: req.user, estimatedRows });
    res.status(202).json({ job, estimatedRows });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** GET /api/query/exports — list the requester's export jobs. */
router.get('/exports', async (req, res) => {
  try {
    const jobs = await sqlExportService.listExports(req.user);
    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/query/exports/:id/download — stream a finished CSV. */
router.get('/exports/:id/download', async (req, res) => {
  try {
    const result = await sqlExportService.getDownload(req.params.id, req.user);
    if (!result) return res.status(404).json({ error: 'Export not found' });
    if (!result.filePath) {
      return res.status(409).json({ error: `Export is "${result.job.status}", not ready yet` });
    }
    res.download(result.filePath, result.job.fileName);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/query/ai-sql
 * Natural language -> a read-only DuckDB SELECT. Body: { prompt }.
 * The model is grounded on the SQL Lab catalog (collections + fields, incl.
 * EventHistory) and the engine's supported SQL surface. Returns { sql }.
 */
router.post('/ai-sql', async (req, res) => {
  const { prompt, currentSql, gridContext } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'prompt is required' });
  }
  try {
    const names = await mongoService.getSqlCollections(req.user);
    const schemaContext = await Promise.all(
      names.map(async (name) => {
        let fields = [];
        try {
          fields = await schemaService.getCollectionFields(name, req.user);
        } catch {
          fields = [];
        }
        return { name, fields };
      })
    );
    const raw = await aiService.generateSql(prompt, schemaContext, req.user, { currentSql, gridContext });
    const sql = extractSql(raw);
    if (!sql) return res.status(502).json({ error: 'The assistant did not return a SQL query. Try rephrasing.' });
    res.json({ sql });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Pull the SQL out of the model's reply: prefer a ```sql fence, then any code
// fence, else fall back to the first SELECT/WITH statement in the text.
function extractSql(text) {
  if (!text) return '';
  const fence = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  let sql = fence ? fence[1] : text;
  const m = sql.match(/\b(WITH|SELECT)\b[\s\S]*/i);
  if (m) sql = m[0];
  return sql.trim().replace(/;+\s*$/, '');
}

// ── Saved queries ──────────────────────────────────────────────────────────

/** GET /api/query/saved — list the requester's saved queries. */
router.get('/saved', async (req, res) => {
  try {
    const queries = await req.model('SavedQuery').find({ tenantId: req.user.tenantId, userId: req.user.userId })
      .sort({ updatedAt: -1 })
      .lean();
    // Annotate each with its primary (first) collection so the dataset builder
    // can warn when a query's source differs from the dataset's source table.
    for (const q of queries) {
      q.primaryCollection = null;
      try {
        const { tables } = parseAndValidate(q.sql);
        if (tables.length) {
          q.primaryCollection = (await mongoService.resolveCollection(tables[0], req.user)) || tables[0];
        }
      } catch {
        // unparsable/legacy query — leave null
      }
    }
    res.json({ queries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/query/saved — create a saved query. Body: { name, sql }. */
router.post('/saved', async (req, res) => {
  const { name, sql } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (!sql || !sql.trim()) return res.status(400).json({ error: 'sql is required' });
  try {
    const query = await req.model('SavedQuery').create({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      name: name.trim(),
      sql,
      createdBy: req.user.userId,
    });
    res.status(201).json(query);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** PUT /api/query/saved/:id — update name and/or sql. */
router.put('/saved/:id', async (req, res) => {
  const { name, sql } = req.body || {};
  try {
    const query = await req.model('SavedQuery').findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
      userId: req.user.userId,
    });
    if (!query) return res.status(404).json({ error: 'Saved query not found' });
    if (typeof name === 'string' && name.trim()) query.name = name.trim();
    if (typeof sql === 'string') query.sql = sql;
    await query.save();

    // Datasets snapshot this SQL, so saving here has to refresh them or they
    // keep running the previous version. Everything below a dataset (reports,
    // KPIs, recons, dashboards, Instrument Browser sources) resolves it at run
    // time and so follows automatically — `propagated` reports that reach.
    let propagated = null;
    try {
      propagated = await lineageService.propagateSavedQuery(query, req.user, req.model);
    } catch (e) {
      // The query itself is saved; a propagation failure must not undo that.
      console.error('[query.saved] propagation failed:', e.message);
    }

    res.json({ ...query.toObject(), propagated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/query/saved/:id/impact
 * What an edit to this query would touch. Lets the editor warn before saving
 * rather than after.
 */
router.get('/saved/:id/impact', async (req, res) => {
  try {
    const query = await req.model('SavedQuery').findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    }).lean();
    if (!query) return res.status(404).json({ error: 'Saved query not found' });
    res.json(await lineageService.impactOfSavedQuery(query._id, req.user.tenantId, req.model));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** DELETE /api/query/saved/:id — remove a saved query. */
router.delete('/saved/:id', async (req, res) => {
  try {
    const deleted = await req.model('SavedQuery').findOneAndDelete({
      _id: req.params.id,
      tenantId: req.user.tenantId,
      userId: req.user.userId,
    });
    if (!deleted) return res.status(404).json({ error: 'Saved query not found' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/query/exports/:id — remove a job + its file. */
router.delete('/exports/:id', async (req, res) => {
  try {
    const ok = await sqlExportService.deleteExport(req.params.id, req.user);
    if (!ok) return res.status(404).json({ error: 'Export not found' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
