const router = require('express').Router();
const queryRunner = require('../services/query-runner.service');
const instrumentService = require('../services/instrument.service');

/**
 * Instrument Browser.
 *
 * Queries are built and run here rather than on the client so the filter can
 * use real Date objects and the source's detected column types — a filter
 * assembled in the browser has to travel as JSON, which rules out both and
 * forces the slow, index-less catch-all form. Execution itself is delegated to
 * query-runner.service, the same code path POST /api/query/run uses.
 *
 * All model access uses req.model() for per-tenant connection isolation.
 */

const DEFAULT_ROW_CAP = parseInt(process.env.INSTRUMENT_ROW_CAP || '5000', 10);
const PROBE_CONCURRENCY = 5;
const PERIOD_COLLECTION = process.env.INSTRUMENT_PERIOD_COLLECTION || 'ExecutionState';
const PERIOD_FIELD = process.env.INSTRUMENT_PERIOD_FIELD || 'executionDate';

/** Run `fn` over `items` at most `n` at a time. */
async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

function datasetExec(model) {
  return { collection: model.sourceCollection || '', pipeline: [], sourceModelId: String(model._id) };
}

function reportExec(question) {
  const cfg = question.queryConfig || {};
  // A report may sit on top of a dataset. The editor stores that as
  // queryConfig.source.datasetId; the schema also has a sourceModelId column.
  const modelId = cfg.source?.datasetId || question.sourceModelId || null;
  return {
    collection: cfg.collection || '',
    pipeline: Array.isArray(cfg.pipeline) ? cfg.pipeline : [],
    ...(modelId ? { sourceModelId: String(modelId) } : {}),
  };
}

/**
 * Resolve a source to { name, exec, stages }.
 *
 * `stages` is every stage that will run before the browser's filter if it is
 * appended — the dataset's own pipeline plus, for a report, the report's. It
 * is what decides whether the filter can safely be prepended instead.
 */
async function resolveSource(src, tenantId, getModel) {
  if (src.sourceType === 'dataset') {
    const model = await getModel('SavedModel').findOne({ _id: src.sourceId, tenantId, archived: { $ne: true } }).lean();
    if (!model) return null;
    return {
      name: model.name,
      description: model.description || '',
      verified: !!model.verified,
      exec: datasetExec(model),
      // A SQL dataset is materialised by DuckDB and filtered in memory, so
      // prepending buys nothing and the stage order must stay as-is.
      stages: model.sourceMode === 'savedQuery' ? [{ $project: {} }] : (model.pipeline || []),
      savedQuerySql: model.sourceMode === 'savedQuery' ? (model.savedQuerySql || '') : '',
    };
  }

  const question = await getModel('Question').findOne({ _id: src.sourceId, tenantId, archived: { $ne: true } }).lean();
  if (!question) return null;

  const exec = reportExec(question);
  let stages = exec.pipeline;
  let sql = '';
  if (exec.sourceModelId) {
    const model = await getModel('SavedModel').findOne({ _id: exec.sourceModelId, tenantId }).lean();
    if (model) {
      stages = model.sourceMode === 'savedQuery'
        ? [{ $project: {} }]
        : [...(model.pipeline || []), ...stages];
      sql = model.sourceMode === 'savedQuery' ? (model.savedQuerySql || '') : '';
    }
  }
  return {
    name: question.name,
    description: question.description || '',
    verified: !!question.verified,
    exec,
    stages,
    savedQuerySql: sql,
    // A report carries its own visualization. The browser filters the report's
    // rows but should still draw them the way the report was designed.
    chartConfig: question.chartConfig || null,
  };
}

function serialize(src, resolved) {
  return {
    _id: String(src._id),
    sourceType: src.sourceType,
    sourceId: String(src.sourceId),
    label: src.label || resolved?.name || '(removed)',
    description: resolved?.description || '',
    verified: !!resolved?.verified,
    instrumentField: src.instrumentField,
    dateMode: src.dateMode,
    dateField: src.dateField,
    dateFieldType: src.dateFieldType,
    enabled: src.enabled !== false,
    order: src.order || 0,
    missing: !resolved,
    // Null for datasets — only a report has a saved chart.
    chartConfig: resolved?.chartConfig || null,
  };
}

// ─── GET /api/instruments/sources ─────────────────────────────────────────
router.get('/sources', async (req, res) => {
  try {
    const srcs = await req.model('InstrumentSource').find({ tenantId: req.user.tenantId })
      .sort({ order: 1, createdAt: 1 })
      .lean();
    const out = await mapLimit(srcs, PROBE_CONCURRENCY, async (src) =>
      serialize(src, await resolveSource(src, req.user.tenantId, req.model))
    );
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/instruments/sources/available ───────────────────────────────
// Only datasets/reports that CAN be browsed: each is probed for one row, and
// kept if it exposes an instrument column plus a posting date or an accounting
// period. The detected candidates are returned so the dialog can pre-fill the
// mappings instead of making the user recall column names.
router.get('/sources/available', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const existing = await req.model('InstrumentSource').find({ tenantId }).select('sourceId').lean();
    const taken = new Set(existing.map((e) => String(e.sourceId)));

    const [models, questions] = await Promise.all([
      req.model('SavedModel').find({ tenantId, archived: { $ne: true } })
        .select('name description verified sourceCollection pipeline sourceMode savedQuerySql')
        .sort({ name: 1 }).lean(),
      req.model('Question').find({ tenantId, archived: { $ne: true } })
        .select('name description verified queryConfig sourceModelId chartConfig')
        .sort({ name: 1 }).lean(),
    ]);

    const candidates = [
      ...models.filter((m) => !taken.has(String(m._id))).map((m) => ({
        sourceId: String(m._id), sourceType: 'dataset', name: m.name,
        description: m.description || '', verified: !!m.verified, exec: datasetExec(m),
        sql: m.sourceMode === 'savedQuery' ? (m.savedQuerySql || '') : '',
      })),
      ...questions.filter((q) => !taken.has(String(q._id))).map((q) => ({
        sourceId: String(q._id), sourceType: 'report', name: q.name,
        description: q.description || '', verified: !!q.verified, exec: reportExec(q),
      })),
    ];

    const probed = await mapLimit(candidates, PROBE_CONCURRENCY, async (c) => {
      const { columns, types, error } = await instrumentService.probeSource(c.exec, req.user);
      if (error) return { ...c, skipped: true, reason: error };
      const aliasOf = c.sql ? (col) => instrumentService.resolveSqlAlias(c.sql, col) : null;
      const analysis = instrumentService.analyseColumns(columns, types, aliasOf);
      if (!analysis.eligible) {
        return {
          ...c,
          skipped: true,
          reason: analysis.instrument.length === 0
            ? 'No instrument ID column'
            : 'No posting date or accounting period column',
        };
      }
      const { sql, ...rest } = c;
      return { ...rest, columns, types, ...analysis };
    });

    const eligible = probed.filter((p) => !p.skipped);
    const skipped = probed.filter((p) => p.skipped)
      .map((p) => ({ name: p.name, sourceType: p.sourceType, reason: p.reason }));

    res.json({
      datasets: eligible.filter((p) => p.sourceType === 'dataset'),
      reports: eligible.filter((p) => p.sourceType === 'report'),
      skipped,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/instruments/sources/:id/columns ─────────────────────────────
// Column candidates for an ALREADY REGISTERED source, so the config dialog can
// offer its mappings as dropdowns instead of free text (where a typo silently
// produces a source that always returns nothing).
router.get('/sources/:id/columns', async (req, res) => {
  try {
    const src = await req.model('InstrumentSource').findOne({ _id: req.params.id, tenantId: req.user.tenantId }).lean();
    if (!src) return res.status(404).json({ error: 'Source not found' });

    const resolved = await resolveSource(src, req.user.tenantId, req.model);
    if (!resolved) return res.json({ columns: [], types: {}, instrument: [], postingDate: [], period: [] });

    const { columns, types, error } = await instrumentService.probeSource(resolved.exec, req.user);
    if (error) return res.json({ columns: [], types: {}, instrument: [], postingDate: [], period: [], error });

    const aliasOf = resolved.savedQuerySql
      ? (col) => instrumentService.resolveSqlAlias(resolved.savedQuerySql, col)
      : null;
    const analysis = instrumentService.analyseColumns(columns, types, aliasOf);
    res.json({ columns, types, ...analysis });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/instruments/periods ─────────────────────────────────────────
// Accounting periods, taken from ExecutionState.executionDate. A period id as
// stored on the instrument collections is the same month packed as YYYYMM
// (2026-07-31 -> 202607), so both forms are returned and the match uses
// whichever suits the source's mapped column.
router.get('/periods', async (req, res) => {
  try {
    const { payload } = await queryRunner.runQuery({
      collection: PERIOD_COLLECTION,
      pipeline: [
        { $match: { [PERIOD_FIELD]: { $ne: null } } },
        { $group: { _id: `$${PERIOD_FIELD}` } },
        { $sort: { _id: -1 } },
        { $limit: 240 },
        { $project: { _id: 0, value: '$_id' } },
      ],
      user: req.user,
      audit: false,
    });

    const periods = (payload.data || [])
      .map((r) => {
        const raw = r.value;
        const d = raw instanceof Date ? raw : new Date(raw?.$date ?? raw);
        if (Number.isNaN(d.getTime())) return null;
        const ymd = d.toISOString().slice(0, 10);
        return {
          value: ymd,
          periodId: Number(ymd.slice(0, 4)) * 100 + Number(ymd.slice(5, 7)),
          label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
        };
      })
      .filter(Boolean);

    res.json(periods);
  } catch (err) {
    // The browser still works without a period list — the user can type a date.
    res.status(200).json([]);
  }
});

/**
 * The Mongo-side predicate for a SQL dataset's source read.
 *
 * The browser filters on the dataset's OUTPUT columns, which a Prism query
 * routinely renames, so the filter has to be restated in the source collection's
 * own column names before it can be pushed down. Anything that cannot be proven
 * safe returns null: the filter then runs only over the materialised result,
 * which is slower but always correct.
 */
function buildPrefilter(src, resolved, { instrumentId, period }, match) {
  const sql = resolved.savedQuerySql;
  // Non-SQL sources filter in Mongo already; the match is used as-is.
  if (!sql) return match ? match.$match : null;

  const instrumentSource = instrumentService.resolveSqlAlias(sql, src.instrumentField) || src.instrumentField;
  if (!instrumentService.canPushdownToSql(sql, instrumentSource)) return null;

  const dateSource = src.dateField
    ? instrumentService.resolveSqlAlias(sql, src.dateField) || src.dateField
    : '';
  // Only narrow by period as well when that column is independently safe.
  const periodPushable = period && dateSource && instrumentService.canPushdownToSql(sql, dateSource);

  const translated = instrumentService.buildMatch(
    { ...src, instrumentField: instrumentSource, dateField: dateSource },
    { instrumentId, period: periodPushable ? period : '' }
  );
  return translated ? translated.$match : null;
}

/**
 * A narrowing $match to run BEFORE a Mongo source's own stages.
 *
 * When the pipeline reshapes (groups, renames), the filter cannot simply be
 * prepended under the output column's name — but the column can often still be
 * traced back to a source field, and filtering on that is equivalent whenever
 * the pipeline groups by it. Without this, every grouped dataset or report
 * re-reads the whole collection on each search.
 *
 * The caller still appends the real filter, so this is only ever an
 * optimisation: it removes rows the appended filter would have removed anyway.
 */
function buildMongoPrepend(src, resolved, { instrumentId }) {
  const stages = resolved.stages || [];
  const instrument = instrumentService.resolveMongoLineage(stages, src.instrumentField);
  if (!instrument.safe || !instrument.field) return null;

  // Instrument only. This stage runs ahead of executePipeline's expansion
  // stages, which coerce types (YYYYMMDD ints to dates, numeric strings to
  // doubles) — so a date or period predicate could legitimately depend on that
  // coercion and must NOT be moved in front of it. An instrument id is a plain
  // string key that no expansion touches, so it is safe here.
  const translated = instrumentService.buildMatch(
    {
      ...src,
      instrumentField: instrument.field,
      // A traced field may be a different column than the one whose type we
      // recorded, so only trust the stored type when the name is unchanged.
      instrumentFieldType:
        instrument.field === src.instrumentField ? src.instrumentFieldType : 'unknown',
      dateField: '',
    },
    { instrumentId, period: '' }
  );
  return translated || null;
}

// ─── POST /api/instruments/run ────────────────────────────────────────────
// Body: { sourceId, instrumentId, period }
router.post('/run', async (req, res) => {
  try {
    const { sourceId, instrumentId, period, limit } = req.body || {};
    if (!instrumentId || !String(instrumentId).trim()) {
      return res.status(400).json({ error: 'instrumentId is required' });
    }

    const src = await req.model('InstrumentSource').findOne({ _id: sourceId, tenantId: req.user.tenantId }).lean();
    if (!src) return res.status(404).json({ error: 'Source not found' });

    const resolved = await resolveSource(src, req.user.tenantId, req.model);
    if (!resolved) return res.status(404).json({ error: 'The underlying dataset/report no longer exists' });

    // A report's saved row cap ($limit) would otherwise run BEFORE this filter,
    // so the browser would search only the report's first N rows. Lift the cap
    // past the filter when it is a plain cap and not a "top N" ranking, so the
    // filter sees the report's full output and the cap then bounds THIS
    // instrument's rows.
    const { head, tail } = instrumentService.splitTrailingLimits(resolved.exec.pipeline);
    const hoistCap = tail.length > 0
      && instrumentService.isPlainRowCap([...(resolved.stages || []), ...head]);
    const execPipeline = hoistCap ? head : resolved.exec.pipeline;
    // With the cap lifted out, the remaining stages are what the filter has to
    // be traced through.
    const stages = hoistCap
      ? (resolved.stages || []).filter((st) => {
        const k = Object.keys(st || {})[0];
        return k !== '$limit' && k !== '$skip';
      })
      : resolved.stages;
    const resolvedForFilter = { ...resolved, stages };

    const match = instrumentService.buildMatch(src, { instrumentId, period });
    // Prepend where the source's stages keep field names intact — the match
    // then runs against the collection and can use an index on it.
    // Three ways the filter can reach the data instead of the result:
    //  1. the pipeline leaves names and row membership alone — prepend it as-is;
    //  2. it reshapes, but the column traces back to a source field — prepend a
    //     narrowing form and still append the real filter;
    //  3. it is a SQL dataset — hand the predicate to the Mongo read feeding DuckDB.
    const plainPrepend = match && instrumentService.canPrepend(stages);
    // Placed ahead of the type-expansion stages, where an index can still serve
    // it. Purely a narrowing — the real filter still runs further down.
    const rootMatch = match && !resolved.savedQuerySql
      ? buildMongoPrepend(src, resolvedForFilter, { instrumentId })
      : null;
    const prefilter = buildPrefilter(src, resolved, { instrumentId, period }, match);
    const cap = Math.min(Number(limit) || DEFAULT_ROW_CAP, 50000);

    const { payload, cacheHit } = await queryRunner.runQuery({
      collection: resolved.exec.collection,
      pipeline: execPipeline,
      sourceModelId: resolved.exec.sourceModelId,
      user: req.user,
      prependStages: plainPrepend ? [match] : [],
      rootStages: rootMatch ? [rootMatch] : [],
      appendStages: [...(match && !plainPrepend ? [match] : []), { $limit: cap }],
      // For a SQL (Prism) dataset the stages above run in memory AFTER DuckDB
      // has materialised the source. Handing the predicate over as a prefilter
      // lets Mongo narrow the feed instead, which is where the time actually
      // goes. It is applied twice, which is harmless.
      prefilter,
    });

    res.set('X-Cache', cacheHit ? 'HIT' : 'MISS');
    // True when the filter reached the data source rather than only the
    // materialised result — via a prepended Mongo stage, or (for a SQL
    // dataset) a predicate pushed into the read that feeds DuckDB.
    res.json({
      ...payload,
      pushedDown: !!rootMatch || !!plainPrepend || !!(resolved.savedQuerySql && prefilter),
    });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

// ─── POST /api/instruments/suggest ────────────────────────────────────────
// Distinct instrument ids starting with `prefix`.
//
// This runs on every few keystrokes, so it gets the same push-down treatment as
// a search: without it a SQL dataset would stream its whole source collection
// into DuckDB per keypress, and the type-ahead spinner would outlive the actual
// results by tens of seconds. A ^-anchored regex (no case-insensitive flag) can
// still use an index, so pushed down it stays cheap.
const SUGGEST_TIMEOUT_MS = parseInt(process.env.INSTRUMENT_SUGGEST_TIMEOUT_MS || '5000', 10);

router.post('/suggest', async (req, res) => {
  try {
    const { sourceId, prefix } = req.body || {};
    if (!prefix || String(prefix).trim().length < 2) return res.json([]);

    const src = await req.model('InstrumentSource').findOne({ _id: sourceId, tenantId: req.user.tenantId }).lean();
    if (!src) return res.json([]);
    const resolved = await resolveSource(src, req.user.tenantId, req.model);
    if (!resolved) return res.json([]);

    // Same case handling as /run: a `^`-anchored regex can use an index, an
    // `i`-flagged one cannot — so try the few plausible spellings as separate
    // anchored branches rather than case-folding. $or of anchored regexes stays
    // one index range scan per branch.
    const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prefixForms = instrumentService.caseVariants(String(prefix).trim());
    const prefixClause = (field) => (prefixForms.length === 1
      ? { [field]: { $regex: `^${esc(prefixForms[0])}` } }
      : { $or: prefixForms.map((f) => ({ [field]: { $regex: `^${esc(f)}` } })) });
    const match = { $match: prefixClause(src.instrumentField) };

    // Same reasoning as /run: a report's trailing row cap must not decide which
    // instruments are searchable, or the type-ahead only ever offers ids that
    // happen to sit inside the report's first N rows.
    const { head, tail } = instrumentService.splitTrailingLimits(resolved.exec.pipeline);
    const hoistCap = tail.length > 0
      && instrumentService.isPlainRowCap([...(resolved.stages || []), ...head]);
    const execPipeline = hoistCap ? head : resolved.exec.pipeline;
    const stages = hoistCap
      ? (resolved.stages || []).filter((st) => {
        const k = Object.keys(st || {})[0];
        return k !== '$limit' && k !== '$skip';
      })
      : resolved.stages;

    const prependable = instrumentService.canPrepend(stages);

    // Narrow at the source: into the Mongo feed for a SQL dataset, or ahead of
    // the type-expansion stages (where an index still applies) for a Mongo one.
    let prefilter = null;
    let rootStages = [];
    if (resolved.savedQuerySql) {
      const sourceCol = instrumentService.resolveSqlAlias(resolved.savedQuerySql, src.instrumentField)
        || src.instrumentField;
      if (instrumentService.canPushdownToSql(resolved.savedQuerySql, sourceCol)) {
        prefilter = prefixClause(sourceCol);
      }
    } else {
      const traced = instrumentService.resolveMongoLineage(stages, src.instrumentField);
      if (traced.safe && traced.field) rootStages = [{ $match: prefixClause(traced.field) }];
    }

    const run = queryRunner.runQuery({
      collection: resolved.exec.collection,
      pipeline: execPipeline,
      sourceModelId: resolved.exec.sourceModelId,
      user: req.user,
      prependStages: prependable ? [match] : [],
      rootStages,
      appendStages: [
        ...(prependable ? [] : [match]),
        { $group: { _id: `$${src.instrumentField}` } },
        { $sort: { _id: 1 } },
        { $limit: 10 },
        { $project: { _id: 0, value: '$_id' } },
      ],
      prefilter,
      audit: false,
    });

    // A source that cannot be narrowed is still slow. Give up rather than leave
    // the caller's spinner running: no suggestions is a fine outcome.
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), SUGGEST_TIMEOUT_MS);
    });
    const result = await Promise.race([run, timeout]).finally(() => clearTimeout(timer));
    if (!result) return res.json([]);

    res.json((result.payload.data || [])
      .map((r) => r.value)
      .filter((v) => v !== null && v !== undefined)
      .map(String));
  } catch {
    res.json([]); // suggestions are a nicety, never an error surface
  }
});

// ─── POST /api/instruments/sources ────────────────────────────────────────
router.post('/sources', async (req, res) => {
  try {
    const { sourceType, sourceId, label, instrumentField, dateMode, dateField } = req.body || {};

    if (!['dataset', 'report'].includes(sourceType)) {
      return res.status(400).json({ error: 'sourceType must be "dataset" or "report"' });
    }
    if (!sourceId) return res.status(400).json({ error: 'sourceId is required' });
    if (!instrumentField) return res.status(400).json({ error: 'instrumentField is required' });
    if (!['postingDate', 'accountingPeriod', 'none'].includes(dateMode)) {
      return res.status(400).json({ error: 'dateMode must be "postingDate", "accountingPeriod" or "none"' });
    }
    // 'none' means the source has no time dimension — browsed by instrument only.
    if (dateMode !== 'none' && !dateField) {
      return res.status(400).json({ error: 'dateField is required — pick a posting date or accounting period column' });
    }

    const resolved = await resolveSource({ sourceType, sourceId }, req.user.tenantId, req.model);
    if (!resolved) return res.status(404).json({ error: 'Source dataset/report not found' });

    // Detect the column types now so every later query can be index-friendly.
    const { columns, types } = await instrumentService.probeSource(resolved.exec, req.user);
    if (columns.length && !columns.includes(instrumentField)) {
      return res.status(400).json({ error: `"${instrumentField}" is not a column of this source` });
    }
    if (dateMode !== 'none' && columns.length && !columns.includes(dateField)) {
      return res.status(400).json({ error: `"${dateField}" is not a column of this source` });
    }

    const last = await req.model('InstrumentSource').findOne({ tenantId: req.user.tenantId })
      .sort({ order: -1 }).select('order').lean();

    const created = await req.model('InstrumentSource').create({
      tenantId: req.user.tenantId,
      sourceType,
      sourceId,
      label: label || '',
      instrumentField,
      dateMode,
      dateField: dateMode === 'none' ? '' : dateField,
      dateFieldType: dateMode === 'none' ? 'unknown' : (types[dateField] || 'unknown'),
      instrumentFieldType: types[instrumentField] === 'number' ? 'number'
        : types[instrumentField] === 'string' ? 'string' : 'unknown',
      order: (last?.order ?? -1) + 1,
      createdBy: req.user.userId,
    });

    res.status(201).json(serialize(created.toObject(), resolved));
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'That dataset/report is already on the Instrument Browser' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/instruments/sources/:id ─────────────────────────────────────
router.put('/sources/:id', async (req, res) => {
  try {
    const patch = {};
    for (const key of ['label', 'instrumentField', 'dateMode', 'dateField', 'enabled', 'order']) {
      if (req.body?.[key] !== undefined) patch[key] = req.body[key];
    }
    if (patch.instrumentField === '') return res.status(400).json({ error: 'instrumentField cannot be empty' });
    if (patch.dateMode && !['postingDate', 'accountingPeriod', 'none'].includes(patch.dateMode)) {
      return res.status(400).json({ error: 'dateMode must be "postingDate", "accountingPeriod" or "none"' });
    }
    if (patch.dateMode === 'none') patch.dateField = '';
    else if (patch.dateField === '') return res.status(400).json({ error: 'dateField cannot be empty' });

    const existing = await req.model('InstrumentSource').findOne({ _id: req.params.id, tenantId: req.user.tenantId }).lean();
    if (!existing) return res.status(404).json({ error: 'Source not found' });

    // Changing the mapped column can change its type, and a stale type would
    // build the wrong (silently empty) match.
    if (patch.dateField && patch.dateField !== existing.dateField) {
      const resolved = await resolveSource(existing, req.user.tenantId, req.model);
      if (resolved) {
        const { types } = await instrumentService.probeSource(resolved.exec, req.user);
        patch.dateFieldType = types[patch.dateField] || 'unknown';
      }
    }

    const updated = await req.model('InstrumentSource').findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId }, patch, { new: true }
    ).lean();

    res.json(serialize(updated, await resolveSource(updated, req.user.tenantId, req.model)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/instruments/sources/reorder ────────────────────────────────
router.post('/sources/reorder', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    await Promise.all(ids.map((id, idx) =>
      req.model('InstrumentSource').updateOne({ _id: id, tenantId: req.user.tenantId }, { order: idx })
    ));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/instruments/sources/:id ──────────────────────────────────
// Unregisters the source only; the dataset/report itself is untouched.
router.delete('/sources/:id', async (req, res) => {
  try {
    const removed = await req.model('InstrumentSource').findOneAndDelete({
      _id: req.params.id, tenantId: req.user.tenantId,
    });
    if (!removed) return res.status(404).json({ error: 'Source not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
