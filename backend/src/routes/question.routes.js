const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const Question = require('../models/Question.model');
const AuditLog = require('../models/AuditLog.model');

const MAX_VERSIONS = 10;

function snapshotQuestion(q) {
  return {
    snapshottedAt: new Date().toISOString(),
    name: q.name,
    description: q.description,
    queryConfig: q.queryConfig,
    chartConfig: q.chartConfig,
  };
}

// GET /api/questions
router.get('/', async (req, res) => {
  try {
    const questions = await req.model('Question').find({
      tenantId: req.user.tenantId,
      archived: { $ne: true },
    }).sort({ updatedAt: -1 });
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/questions
router.post('/', async (req, res) => {
  try {
    const { name, description, type, queryConfig, chartConfig, collectionId, sourceModelId, cacheTTL } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const question = await req.model('Question').create({
      name,
      description,
      type: type || 'native',
      queryConfig,
      chartConfig,
      collectionId,
      sourceModelId,
      cacheTTL,
      tenantId: req.user.tenantId,
      createdBy: req.user.userId,
    });

    res.status(201).json(question);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/questions/:id
router.get('/:id', async (req, res) => {
  try {
    const question = await req.model('Question').findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    });
    if (!question) return res.status(404).json({ error: 'Question not found' });

    req.model('AuditLog').create({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      action: 'question.view',
      resourceId: question._id,
      resourceType: 'question',
    }).catch(() => {});

    res.json(question);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/questions/:id
router.put('/:id', async (req, res) => {
  try {
    const question = await req.model('Question').findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    });
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const { name, description, type, queryConfig, chartConfig, collectionId, sourceModelId, cacheTTL, verified, pinned } = req.body;

    // Snapshot before update (v60 question revision history)
    question.versions = [...(question.versions || []), snapshotQuestion(question)].slice(-MAX_VERSIONS);

    Object.assign(question, {
      name: name ?? question.name,
      description: description ?? question.description,
      type: type ?? question.type,
      queryConfig: queryConfig ?? question.queryConfig,
      chartConfig: chartConfig ?? question.chartConfig,
      collectionId: collectionId ?? question.collectionId,
      sourceModelId: sourceModelId ?? question.sourceModelId,
      cacheTTL: cacheTTL ?? question.cacheTTL,
      verified: verified ?? question.verified,
      pinned: pinned ?? question.pinned,
    });
    // chartConfig is Mixed — explicitly mark it modified so Mongoose persists
    // all fields including columnOrder, columnFormats, etc.
    question.markModified('chartConfig');
    question.markModified('queryConfig');

    await question.save();
    res.json(question);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/questions/:id/versions
router.get('/:id/versions', async (req, res) => {
  try {
    const q = await req.model('Question').findOne({ _id: req.params.id, tenantId: req.user.tenantId }).select('versions');
    if (!q) return res.status(404).json({ error: 'Question not found' });
    res.json(q.versions || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/questions/:id/restore/:idx
router.post('/:id/restore/:idx', async (req, res) => {
  try {
    const q = await req.model('Question').findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!q) return res.status(404).json({ error: 'Question not found' });
    const v = (q.versions || [])[parseInt(req.params.idx, 10)];
    if (!v) return res.status(404).json({ error: 'Version not found' });
    // Snapshot the CURRENT state before overwriting so the user can undo the restore.
    q.versions = [...(q.versions || []), snapshotQuestion(q)].slice(-MAX_VERSIONS);
    Object.assign(q, {
      name: v.name,
      description: v.description,
      queryConfig: v.queryConfig,
      chartConfig: v.chartConfig,
    });
    q.markModified('chartConfig');
    q.markModified('queryConfig');
    await q.save();
    res.json(q);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/questions/:id/share — issue / rotate public share token
router.post('/:id/share', async (req, res) => {
  try {
    const q = await req.model('Question').findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!q) return res.status(404).json({ error: 'Question not found' });
    q.publicShareToken = uuidv4();
    await q.save();
    res.json({ token: q.publicShareToken, url: `/share/q/${q.publicShareToken}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/questions/:id/share — revoke
router.delete('/:id/share', async (req, res) => {
  try {
    const q = await req.model('Question').findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!q) return res.status(404).json({ error: 'Question not found' });
    q.publicShareToken = undefined;
    await q.save();
    res.json({ revoked: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/questions/:id  (soft archive — Metabase v60 trash)
router.delete('/:id', async (req, res) => {
  try {
    const question = await req.model('Question').findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      { archived: true, archivedAt: new Date() },
      { new: true }
    );
    if (!question) return res.status(404).json({ error: 'Question not found' });
    res.json({ archived: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
