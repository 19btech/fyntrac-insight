const router = require('express').Router();
const Dashboard = require('../models/Dashboard.model');
const Question = require('../models/Question.model');
const SavedModel = require('../models/SavedModel.model');
const Metric = require('../models/Metric.model');
const Recon = require('../models/Recon.model');
const ReconRun = require('../models/ReconRun.model');
const ReconCsvFile = require('../models/ReconCsvFile.model');

const MODEL_MAP = {
  dashboard: Dashboard,
  question: Question,
  model: SavedModel,
  metric: Metric,
  recon: Recon,
};

// GET /api/trash — list all archived items for the tenant, across all entity types
router.get('/', async (req, res) => {
  try {
    const tenantFilter = { tenantId: req.user.tenantId, archived: true };
    const [dashboards, questions, models, metrics, recons] = await Promise.all([
      Dashboard.find(tenantFilter).select('name description archivedAt updatedAt').lean(),
      Question.find(tenantFilter).select('name description archivedAt updatedAt').lean(),
      SavedModel.find(tenantFilter).select('name description archivedAt updatedAt').lean(),
      Metric.find(tenantFilter).select('name archivedAt updatedAt').lean(),
      Recon.find(tenantFilter).select('name description archivedAt updatedAt').lean(),
    ]);
    const tag = (arr, type) => arr.map((d) => ({ ...d, _type: type }));
    const items = [
      ...tag(dashboards, 'dashboard'),
      ...tag(questions, 'question'),
      ...tag(models, 'model'),
      ...tag(metrics, 'metric'),
      ...tag(recons, 'recon'),
    ].sort((a, b) => new Date(b.archivedAt || b.updatedAt) - new Date(a.archivedAt || a.updatedAt));
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/trash/:type/:id/restore
router.post('/:type/:id/restore', async (req, res) => {
  const Model = MODEL_MAP[req.params.type];
  if (!Model) return res.status(400).json({ error: 'Invalid type' });
  const item = await Model.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.user.tenantId },
    { archived: false, $unset: { archivedAt: 1 } },
    { new: true }
  );
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ restored: true });
});

// DELETE /api/trash/:type/:id — permanent delete
router.delete('/:type/:id', async (req, res) => {
  const Model = MODEL_MAP[req.params.type];
  if (!Model) return res.status(400).json({ error: 'Invalid type' });
  const item = await Model.findOneAndDelete({
    _id: req.params.id,
    tenantId: req.user.tenantId,
    archived: true, // safety: only permanently delete already-archived items
  });
  if (!item) return res.status(404).json({ error: 'Not found or not archived' });
  // Cascade-delete recon run history and uploaded CSV files
  if (req.params.type === 'recon') {
    await Promise.all([
      ReconRun.deleteMany({ reconId: item._id }),
      ReconCsvFile.deleteMany({
        tenantId: req.user.tenantId,
        _id: { $in: [item.sourceA?.refId, item.sourceB?.refId].filter(Boolean) },
      }),
    ]);
  }
  res.json({ deleted: true });
});

// POST /api/trash/empty — permanent delete all archived items for tenant
router.post('/empty', async (req, res) => {
  const filter = { tenantId: req.user.tenantId, archived: true };
  // Find archived recons first so we can cascade-delete their runs
  const archivedRecons = await Recon.find(filter).select('_id').lean();
  const reconIds = archivedRecons.map((r) => r._id);
  const results = await Promise.all([
    ...Object.values(MODEL_MAP).map((M) => M.deleteMany(filter)),
    ReconRun.deleteMany({ reconId: { $in: reconIds } }),
  ]);
  const total = results.reduce((sum, r) => sum + (r.deletedCount || 0), 0);
  res.json({ deleted: total });
});

module.exports = router;
