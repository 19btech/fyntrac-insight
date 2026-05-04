const router = require('express').Router();
const Recon = require('../models/Recon.model');
const ReconRun = require('../models/ReconRun.model');
const ReconCsvFile = require('../models/ReconCsvFile.model');
const SavedModel = require('../models/SavedModel.model');
const reconService = require('../services/recon.service');

const MAX_CSV_BYTES = 10 * 1024 * 1024;   // 10 MB raw text limit
// Cap stored parsedRows to avoid exceeding MongoDB's 16 MB BSON document limit.
// (Storing both raw text + parsed row objects for a 10 MB CSV would push ~25 MB total.)
const MAX_CSV_STORED_ROWS = 50_000;

// ─── CSV upload (JSON body — base64 or raw text) ──────────────────────────
// POST /api/recons/csv/preview { filename, raw } → { columns, types, sample, rowCount }
router.post('/csv/preview', async (req, res) => {
  try {
    const { filename, raw } = req.body || {};
    if (typeof raw !== 'string') return res.status(400).json({ error: 'raw (CSV text) required' });
    if (raw.length > MAX_CSV_BYTES) return res.status(413).json({ error: `CSV too large (>${MAX_CSV_BYTES} bytes)` });
    const { columns, rows } = reconService.parseCsv(raw);
    const types = reconService.inferTypes(columns, rows);
    res.json({ filename, columns, types, sample: rows.slice(0, 50), rowCount: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/recons/csv → save CSV file (returns id to use as side.refId)
router.post('/csv', async (req, res) => {
  try {
    const { filename, raw } = req.body || {};
    if (typeof raw !== 'string') return res.status(400).json({ error: 'raw (CSV text) required' });
    if (raw.length > MAX_CSV_BYTES) return res.status(413).json({ error: `CSV too large (>${MAX_CSV_BYTES} bytes)` });
    const { columns, rows } = reconService.parseCsv(raw);
    const types = reconService.inferTypes(columns, rows);
    const storedRows = rows.slice(0, MAX_CSV_STORED_ROWS);
    const f = await req.model('ReconCsvFile').create({
      tenantId: req.user.tenantId,
      filename: filename || 'upload.csv',
      uploadedBy: req.user.userId,
      sizeBytes: Buffer.byteLength(raw, 'utf8'),
      rowCount: rows.length,
      columns,
      inferredTypes: types,
      // Do NOT store `raw` — parsedRows is the canonical store (avoids double-storing
      // ~10 MB text + ~15 MB BSON objects in the same document).
      // Old uploads that have `raw` but no `parsedRows` still work via the fallback
      // in materializeSide: parseCsv(f.raw).
      sampleRows: rows.slice(0, 50),
      parsedRows: storedRows,
    });
    res.status(201).json({
      _id: f._id, filename: f.filename, columns: f.columns,
      types: f.inferredTypes, rowCount: f.rowCount, sample: f.sampleRows,
      rowsTruncated: rows.length > MAX_CSV_STORED_ROWS,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/recons/csv/:id → metadata + sample (not raw, kept light)
router.get('/csv/:id', async (req, res) => {
  try {
    const f = await req.model('ReconCsvFile').findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!f) return res.status(404).json({ error: 'CSV not found' });
    res.json({
      _id: f._id, filename: f.filename, columns: f.columns,
      types: f.inferredTypes, rowCount: f.rowCount, sample: f.sampleRows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Source columns helper (for mapping wizard) ───────────────────────────
// POST /api/recons/source/columns { kind, refId } → { columns, types, sample }
router.post('/source/columns', async (req, res) => {
  try {
    const { kind, refId } = req.body || {};
    if (!kind || !refId) return res.status(400).json({ error: 'kind and refId required' });
    // Use columns-only materialization for datasets to avoid running the full pipeline
    const side = await reconService.materializeColumnsOnly({ kind, refId }, req.user);
    const types = reconService.inferTypes(side.columns, side.rows);
    res.json({ name: side.name, columns: side.columns, types, sample: side.rows.slice(0, 25), rowCount: side.rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/recons/suggest-mapping { sourceA, sourceB } → { keys, measures, attributes }
router.post('/suggest-mapping', async (req, res) => {
  try {
    const { sourceA, sourceB } = req.body || {};
    if (!sourceA || !sourceB) return res.status(400).json({ error: 'sourceA and sourceB required' });
    // Use columns-only materialization (≤200 rows) — the suggestion algorithm only needs
    // a sample to compute name similarity, value overlap, and cardinality.
    const [a, b] = await Promise.all([
      reconService.materializeColumnsOnly(sourceA, req.user),
      reconService.materializeColumnsOnly(sourceB, req.user),
    ]);
    const draft = reconService.suggestMapping(a, b);
    res.json(draft);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ─── Recon CRUD ───────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const recons = await req.model('Recon').find({
      tenantId: req.user.tenantId,
      archived: { $ne: true },
    }).sort({ updatedAt: -1 });
    res.json(recons);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name) return res.status(400).json({ error: 'name required' });
    if (!body.sourceA || !body.sourceB) return res.status(400).json({ error: 'sourceA and sourceB required' });
    // Hydrate display names so list views are nice
    body.sourceA.displayName = await displayName(body.sourceA, req.user);
    body.sourceB.displayName = await displayName(body.sourceB, req.user);
    const recon = await req.model('Recon').create({
      ...body,
      tenantId: req.user.tenantId,
      createdBy: req.user.userId,
    });
    res.status(201).json(recon);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const recon = await req.model('Recon').findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!recon) return res.status(404).json({ error: 'Recon not found' });
    res.json(recon);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const recon = await req.model('Recon').findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!recon) return res.status(404).json({ error: 'Recon not found' });
    const fields = ['name', 'description', 'sourceA', 'sourceB', 'mapping', 'options', 'schedule', 'pinnedNote'];
    for (const f of fields) if (req.body[f] !== undefined) recon[f] = req.body[f];
    if (req.body.sourceA) recon.sourceA.displayName = await displayName(recon.sourceA, req.user);
    if (req.body.sourceB) recon.sourceB.displayName = await displayName(recon.sourceB, req.user);
    await recon.save();
    res.json(recon);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const recon = await req.model('Recon').findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      { archived: true, archivedAt: new Date() },
      { new: true }
    );
    if (!recon) return res.status(404).json({ error: 'Recon not found' });
    res.json({ archived: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Run + history ────────────────────────────────────────────────────────

router.post('/:id/run', async (req, res) => {
  try {
    const recon = await req.model('Recon').findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!recon) return res.status(404).json({ error: 'Recon not found' });

    // Fetch the most-recent successful prior run so the engine can age
    // persistent breaks and flag new ones. A failure here must NOT block the
    // run — aging is a nice-to-have, not a hard requirement.
    let previousRun = null;
    try {
      previousRun = await req.model('ReconRun').findOne({
        reconId: recon._id,
        tenantId: req.user.tenantId,
        error: { $in: [null, undefined, ''] },
      }).sort({ runAt: -1 });
    } catch (_) { /* noop */ }

    let runRec;
    try {
      const result = await reconService.runRecon(recon, req.user, previousRun);
      runRec = await req.model('ReconRun').create({
        reconId: recon._id,
        tenantId: req.user.tenantId,
        runBy: req.user.userId,
        durationMs: result.durationMs,
        mappingSnapshot: recon.mapping,
        optionsSnapshot: recon.options,
        summary: result.summary,
        rows: result.rows,
        totalRows: result.totalRows,
        rowsTruncated: result.rowsTruncated,
      });
      recon.lastRun = { at: new Date(), runId: String(runRec._id), summary: result.summary };
      await recon.save();
    } catch (e) {
      runRec = await req.model('ReconRun').create({
        reconId: recon._id,
        tenantId: req.user.tenantId,
        runBy: req.user.userId,
        error: e.message,
        mappingSnapshot: recon.mapping,
        optionsSnapshot: recon.options,
      });
      return res.status(500).json({ error: e.message, runId: runRec._id });
    }

    res.json({ runId: runRec._id, summary: runRec.summary, durationMs: runRec.durationMs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/runs', async (req, res) => {
  try {
    const runs = await req.model('ReconRun').find({ reconId: req.params.id, tenantId: req.user.tenantId })
      .sort({ runAt: -1 })
      .limit(50)
      .select('runAt runBy durationMs error summary');
    res.json(runs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/runs/:runId', async (req, res) => {
  try {
    const run = await req.model('ReconRun').findOne({ _id: req.params.runId, tenantId: req.user.tenantId });
    if (!run) return res.status(404).json({ error: 'Run not found' });
    const status = req.query.status; // matched | mismatched | only_a | only_b | undefined
    const limit = Math.min(Number(req.query.limit) || 200, 2000);
    const skip = Number(req.query.skip) || 0;
    let rows = run.rows || [];
    if (status) rows = rows.filter((r) => r.status === status);
    const sliced = rows.slice(skip, skip + limit);
    res.json({
      _id: run._id, reconId: run.reconId, runAt: run.runAt, runBy: run.runBy,
      durationMs: run.durationMs, error: run.error,
      summary: run.summary, mapping: run.mappingSnapshot, options: run.optionsSnapshot,
      rows: sliced, total: rows.length, skip, limit,
      rowsTruncated: run.rowsTruncated || false, totalRows: run.totalRows,
      signOff: run.signOff || { certified: false },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/runs/:runId/export', async (req, res) => {
  try {
    const run = await req.model('ReconRun').findOne({ _id: req.params.runId, tenantId: req.user.tenantId });
    if (!run) return res.status(404).json({ error: 'Run not found' });
    const status = req.query.status; // optional
    let rows = run.rows || [];
    if (status) rows = rows.filter((r) => r.status === status);

    const measureKeys = Object.keys(run.summary?.totals || {});
    const cols = ['status', 'key', 'category', 'note', 'age', 'attr_issues'];
    for (const m of measureKeys) cols.push(`${m}_a`, `${m}_b`, `${m}_diff`);

    const escape = (v) => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.join(',')];
    for (const r of rows) {
      const a = r.a || {}; const b = r.b || {}; const d = r.deltas || {};
      const attrText = Array.isArray(r.attrIssues) && r.attrIssues.length
        ? r.attrIssues.map((x) => `${x.field}: ${x.a} \u2260 ${x.b}`).join(' | ')
        : '';
      const row = [r.status, r.key, r.category || '', r.note || '', r.age ?? '', attrText];
      for (const m of measureKeys) row.push(a[m] ?? '', b[m] ?? '', d[m]?.diff ?? '');
      lines.push(row.map(escape).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="recon-${run._id}${status ? '-' + status : ''}.csv"`);
    res.send(lines.join('\n'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Per-row notes / category (in-place edits on a stored run) ────────────
// PATCH /api/recons/runs/:runId/row { key, category?, note? }
// Updates exactly one row inside ReconRun.rows. We match by key + status when
// status is supplied (a single key may appear in only one bucket per run).
router.patch('/runs/:runId/row', async (req, res) => {
  try {
    const { key, status, category, note } = req.body || {};
    if (key == null) return res.status(400).json({ error: 'key required' });
    const run = await req.model('ReconRun').findOne({ _id: req.params.runId, tenantId: req.user.tenantId });
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (run.signOff?.certified) return res.status(409).json({ error: 'Run is signed off; unlock to edit' });

    const idx = (run.rows || []).findIndex((r) => r.key === key && (!status || r.status === status));
    if (idx === -1) return res.status(404).json({ error: 'Row not found in this run' });

    const row = run.rows[idx];
    if (category !== undefined) row.category = category || '';
    if (note !== undefined) {
      row.note = note || '';
      row.noteBy = req.user.userId;
      row.noteAt = new Date();
    }
    run.rows[idx] = row;
    run.markModified('rows');
    await run.save();
    res.json({ ok: true, row });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Sign-off / certification ─────────────────────────────────────────────
// POST /api/recons/runs/:runId/signoff { note?, certified? }
// Default certified=true. Pass certified=false to unlock a previously signed
// run. Once certified, per-row note edits are blocked above.
router.post('/runs/:runId/signoff', async (req, res) => {
  try {
    const { note, certified } = req.body || {};
    const run = await req.model('ReconRun').findOne({ _id: req.params.runId, tenantId: req.user.tenantId });
    if (!run) return res.status(404).json({ error: 'Run not found' });
    const wantCertified = certified === false ? false : true;
    run.signOff = {
      certified: wantCertified,
      by: wantCertified ? req.user.userId : '',
      at: wantCertified ? new Date() : null,
      note: note || '',
    };
    await run.save();
    res.json({ ok: true, signOff: run.signOff });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── helpers ──────────────────────────────────────────────────────────────
async function displayName(side, user) {
  try {
    if (side.kind === 'dataset') {
      const ds = await req.model('SavedModel').findOne({ _id: side.refId, tenantId: user.tenantId }).select('name');
      return ds?.name;
    }
    if (side.kind === 'csv') {
      const f = await req.model('ReconCsvFile').findOne({ _id: side.refId, tenantId: user.tenantId }).select('filename');
      return f?.filename;
    }
  } catch (_) { /* noop */ }
  return undefined;
}

module.exports = router;
