const router = require('express').Router();
const Dashboard = require('../models/Dashboard.model');
const Question = require('../models/Question.model');
const Metric = require('../models/Metric.model');
const SavedModel = require('../models/SavedModel.model');
const AuditLog = require('../models/AuditLog.model');

const MAX_VERSIONS = 15;

function snapshotDashboard(dashboard) {
  return {
    snapshottedAt: new Date().toISOString(),
    name: dashboard.name,
    description: dashboard.description,
    layout: dashboard.layout,
    cards: dashboard.cards,
    filters: dashboard.filters,
    tabs: dashboard.tabs,
  };
}

// GET /api/dashboards
router.get('/', async (req, res) => {
  try {
    const dashboards = await Dashboard.find({
      tenantId: req.user.tenantId,
      archived: { $ne: true },
    })
      .select('-versions')
      .sort({ updatedAt: -1 });
    res.json(dashboards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dashboards
router.post('/', async (req, res) => {
  try {
    const { name, description, layout, cards, filters, tabs, collectionId, sections, layoutMode, intent, draftedByAI } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const dashboard = await Dashboard.create({
      name,
      description,
      layout: layout || [],
      cards: cards || [],
      filters: filters || [],
      tabs: tabs || [],
      sections: sections || [],
      layoutMode: layoutMode || 'grid',
      intent,
      draftedByAI: !!draftedByAI,
      collectionId,
      tenantId: req.user.tenantId,
      createdBy: req.user.userId,
    });

    AuditLog.create({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      action: 'dashboard.create',
      resourceId: dashboard._id,
      resourceType: 'dashboard',
    }).catch(() => {});

    res.status(201).json(dashboard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboards/:id
router.get('/:id', async (req, res) => {
  try {
    const dashboard = await Dashboard.findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    });
    if (!dashboard) return res.status(404).json({ error: 'Dashboard not found' });

    AuditLog.create({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      action: 'dashboard.view',
      resourceId: dashboard._id,
      resourceType: 'dashboard',
    }).catch(() => {});

    res.json(dashboard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/dashboards/:id
router.put('/:id', async (req, res) => {
  try {
    const dashboard = await Dashboard.findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    });
    if (!dashboard) return res.status(404).json({ error: 'Dashboard not found' });

    // Save version snapshot before update
    const versions = [...(dashboard.versions || []), snapshotDashboard(dashboard)].slice(
      -MAX_VERSIONS
    );

    const { name, description, layout, cards, filters, tabs, pinned, autoRefreshSeconds, sections, layoutMode, autoApplyFilters, intent, draftedByAI } = req.body;
    Object.assign(dashboard, {
      name: name ?? dashboard.name,
      description: description ?? dashboard.description,
      layout: layout ?? dashboard.layout,
      cards: cards ?? dashboard.cards,
      filters: filters ?? dashboard.filters,
      tabs: tabs ?? dashboard.tabs,
      pinned: pinned ?? dashboard.pinned,
      autoRefreshSeconds: autoRefreshSeconds ?? dashboard.autoRefreshSeconds,
      sections: sections ?? dashboard.sections,
      layoutMode: layoutMode ?? dashboard.layoutMode,
      autoApplyFilters: autoApplyFilters ?? dashboard.autoApplyFilters,
      intent: intent ?? dashboard.intent,
      draftedByAI: draftedByAI ?? dashboard.draftedByAI,
      versions,
    });

    await dashboard.save();
    res.json(dashboard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/dashboards/:id  (soft archive — Metabase v60 trash)
router.delete('/:id', async (req, res) => {
  try {
    const dashboard = await Dashboard.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      { archived: true, archivedAt: new Date() },
      { new: true }
    );
    if (!dashboard) return res.status(404).json({ error: 'Dashboard not found' });
    res.json({ archived: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboards/:id/versions
router.get('/:id/versions', async (req, res) => {
  try {
    const dashboard = await Dashboard.findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    }).select('versions');
    if (!dashboard) return res.status(404).json({ error: 'Dashboard not found' });
    res.json(dashboard.versions || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dashboards/:id/restore/:versionIndex
router.post('/:id/restore/:versionIndex', async (req, res) => {
  try {
    const dashboard = await Dashboard.findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    });
    if (!dashboard) return res.status(404).json({ error: 'Dashboard not found' });

    const idx = parseInt(req.params.versionIndex, 10);
    const version = (dashboard.versions || [])[idx];
    if (!version) return res.status(404).json({ error: 'Version not found' });

    // Snapshot current state before overwriting so the restore is reversible.
    dashboard.versions = [...(dashboard.versions || []), snapshotDashboard(dashboard)].slice(-MAX_VERSIONS);

    Object.assign(dashboard, {
      name: version.name,
      description: version.description,
      layout: version.layout,
      cards: version.cards,
      filters: version.filters,
      tabs: version.tabs,
    });

    await dashboard.save();
    res.json(dashboard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboards/:id/sources
// Returns curated objects (KPIs/Datasets) and Questions referenced
// by this dashboard, plus per-card provenance — used by the AI co-pilot
// (slice A) and provenance chips (slice F).
router.get('/:id/sources', async (req, res) => {
  try {
  const dashboard = await Dashboard.findOne({
    _id: req.params.id, tenantId: req.user.tenantId,
  });
  if (!dashboard) return res.status(404).json({ error: 'Dashboard not found' });

  const allCards = [
    ...(dashboard.cards || []),
    ...((dashboard.tabs || []).flatMap((t) => t.cards || [])),
  ].filter((c) => c?.type === 'question' && c?.questionId);
  const questionIds = [...new Set(allCards.map((c) => String(c.questionId)))];

  const questions = await Question.find({
    _id: { $in: questionIds }, tenantId: req.user.tenantId,
  }).select('name verified queryConfig.collection queryConfig.draftedByAI updatedAt').lean();

  const collections = [...new Set(questions.map((q) => q.queryConfig?.collection).filter(Boolean))];

  const [kpis, datasets] = await Promise.all([
    Metric.find({ tenantId: req.user.tenantId, archived: { $ne: true }, collection: { $in: collections } })
      .select('name collection format').lean(),
    SavedModel.find({ tenantId: req.user.tenantId, archived: { $ne: true }, sourceCollection: { $in: collections } })
      .select('name sourceCollection verified').lean(),
  ]);

  const provenance = {};
  for (const q of questions) {
    provenance[q._id] = {
      name: q.name,
      verified: !!q.verified,
      draftedByAI: !!q.queryConfig?.draftedByAI,
      collection: q.queryConfig?.collection,
      relatedKpis: kpis.filter((k) => k.collection === q.queryConfig?.collection).map((k) => k.name),
      relatedDatasets: datasets.filter((d) => d.sourceCollection === q.queryConfig?.collection).map((d) => d.name),
    };
  }

  res.json({
    questions: questions.map((q) => ({ _id: q._id, name: q.name, verified: !!q.verified, draftedByAI: !!q.queryConfig?.draftedByAI })),
    kpis,
    datasets,
    collections,
    provenance,
  });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
