const router = require('express').Router();
const SavedModel = require('../models/SavedModel.model');
const Question = require('../models/Question.model');
const mongoService = require('../services/mongo.service');
const { compileSteps } = require('../services/dataset-compiler.service');

function compileIfNeeded(body) {
  if (Array.isArray(body.steps) && body.steps.length > 0) {
    return compileSteps(body.steps);
  }
  return Array.isArray(body.pipeline) ? body.pipeline : [];
}

router.get('/', async (req, res) => {
  try {
    const models = await req.model('SavedModel').find({
      tenantId: req.user.tenantId,
      archived: { $ne: true },
    }).select('-versions').sort({ pinned: -1, updatedAt: -1 });
    res.json(models);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, description, sourceCollection, steps, columnOrder, verified, pinned } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!sourceCollection) return res.status(400).json({ error: 'sourceCollection is required' });
    let pipeline;
    try { pipeline = compileIfNeeded(req.body); }
    catch (e) { return res.status(400).json({ error: e.message }); }
    const model = await req.model('SavedModel').create({
      name, description, sourceCollection, pipeline,
      steps: steps || [],
      columnOrder: Array.isArray(columnOrder) ? columnOrder : [],
      verified: !!verified, pinned: !!pinned,
      tenantId: req.user.tenantId,
      createdBy: req.user.userId,
    });
    res.status(201).json(model);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/preview-steps', async (req, res) => {
  try {
    const { sourceCollection, steps, sampleSize, previewLimit } = req.body;
    if (!sourceCollection) return res.status(400).json({ error: 'sourceCollection is required' });
    if (!Array.isArray(steps)) return res.status(400).json({ error: 'steps must be an array' });

    let prefix = [];
    if (sampleSize && Number(sampleSize) > 0) {
      prefix = [{ $sample: { size: Math.min(Number(sampleSize), 50000) } }];
    }

    // Build cumulative pipelines synchronously (each step appends to the previous),
    // then fire all count queries in parallel for maximum throughput.
    const cumulativeSnapshots = []; // { index, kind, pipeline }
    const enabled = (steps || []).filter((s) => s && !s.disabled);
    let cumulative = [...prefix];
    for (let i = 0; i < enabled.length; i++) {
      let compiled;
      try { compiled = compileSteps([enabled[i]]); }
      catch (e) { return res.status(400).json({ error: e.message }); }
      cumulative = [...cumulative, ...compiled];
      cumulativeSnapshots.push({ index: i, kind: enabled[i].kind, pipeline: [...cumulative] });
    }

    // All count queries run in parallel — avoids N sequential round-trips.
    const stepCounts = await Promise.all(
      cumulativeSnapshots.map(({ index, kind, pipeline }) =>
        mongoService.executePipeline(
          sourceCollection,
          [...pipeline, { $count: 'n' }],
          req.user
        )
          .then((r) => ({ index, kind, rowCount: r.data[0]?.n || 0 }))
          .catch((e) => ({ index, kind, error: e.message }))
      )
    );

    const limit = Math.min(Number(previewLimit) || 100, 500);
    const previewPipeline = [...cumulative, { $limit: limit }];
    const result = await mongoService.executePipeline(sourceCollection, previewPipeline, req.user);
    res.json({ ...result, stepCounts });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/compile', (req, res) => {
  try {
    const pipeline = compileSteps(req.body?.steps || []);
    res.json({ pipeline });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const model = await req.model('SavedModel').findOne({ _id: req.params.id, tenantId: req.user.tenantId })
      .select('-versions'); // versions are heavy and fetched separately via /:id/versions
    if (!model) return res.status(404).json({ error: 'Model not found' });
    res.json(model);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const model = await req.model('SavedModel').findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!model) return res.status(404).json({ error: 'Model not found' });
    const { name, description, sourceCollection, steps, columnOrder, verified, pinned } = req.body;

    // Snapshot the prior state into versions before mutating.
    const prior = {
      name: model.name,
      description: model.description,
      sourceCollection: model.sourceCollection,
      steps: model.steps,
      pipeline: model.pipeline,
      columnOrder: model.columnOrder,
      verified: model.verified,
    };
    const versions = Array.isArray(model.versions) ? model.versions : [];
    versions.push({
      version: versions.length + 1,
      snapshot: prior,
      createdBy: req.user.userId,
      createdAt: new Date(),
    });
    // Cap to the last 20 snapshots (drop oldest).
    model.versions = versions.slice(-20);

    if (name !== undefined) model.name = name;
    if (description !== undefined) model.description = description;
    if (sourceCollection !== undefined) model.sourceCollection = sourceCollection;
    if (verified !== undefined) model.verified = verified;
    if (pinned !== undefined) model.pinned = pinned;
    if (Array.isArray(columnOrder)) model.columnOrder = columnOrder;
    if (Array.isArray(steps)) {
      model.steps = steps;
      try { model.pipeline = compileSteps(steps); }
      catch (e) { return res.status(400).json({ error: e.message }); }
    } else if (Array.isArray(req.body.pipeline)) {
      model.pipeline = req.body.pipeline;
    }
    await model.save();
    res.json(model);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const model = await req.model('SavedModel').findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      { archived: true, archivedAt: new Date() },
      { new: true }
    );
    if (!model) return res.status(404).json({ error: 'Model not found' });
    res.json({ archived: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/preview', async (req, res) => {
  try {
    const model = await req.model('SavedModel').findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!model) return res.status(404).json({ error: 'Model not found' });
    const limit = Math.min(Number(req.body?.limit) || 50, 500);
    const previewPipeline = [...(model.pipeline || []), { $limit: limit }];
    const result = await mongoService.executePipeline(model.sourceCollection, previewPipeline, req.user);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/lineage', async (req, res) => {
  try {
    const model = await req.model('SavedModel').findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!model) return res.status(404).json({ error: 'Model not found' });
    const questions = await req.model('Question').find({
      tenantId: req.user.tenantId,
      archived: { $ne: true },
      $or: [
        { 'queryConfig.modelId': String(model._id) },
        { 'queryConfig.collection': model.name },
      ],
    }).select('name description updatedAt _id');
    res.json({ questions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/versions', async (req, res) => {
  try {
    const model = await req.model('SavedModel').findOne({ _id: req.params.id, tenantId: req.user.tenantId })
      .select('versions');
    if (!model) return res.status(404).json({ error: 'Model not found' });
    res.json(model.versions || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
