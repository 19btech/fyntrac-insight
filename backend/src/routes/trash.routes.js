const router = require('express').Router();

// Model name map — resolved at request-time via req.model() for tenant isolation
const MODEL_MAP = {
  dashboard: 'Dashboard',
  question: 'Question',
  model: 'SavedModel',
  metric: 'Metric',
  recon: 'Recon',
};

// GET /api/trash — list all archived items for the tenant, across all entity types
router.get('/', async (req, res) => {
  try {
    const tenantFilter = { tenantId: req.user.tenantId, archived: true };
    const [dashboards, questions, models, metrics, recons] = await Promise.all([
      req.model('Dashboard').find(tenantFilter).select('name description archivedAt updatedAt').lean(),
      req.model('Question').find(tenantFilter).select('name description archivedAt updatedAt').lean(),
      req.model('SavedModel').find(tenantFilter).select('name description archivedAt updatedAt').lean(),
      req.model('Metric').find(tenantFilter).select('name archivedAt updatedAt').lean(),
      req.model('Recon').find(tenantFilter).select('name description archivedAt updatedAt').lean(),
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
  const modelName = MODEL_MAP[req.params.type];
  if (!modelName) return res.status(400).json({ error: 'Invalid type' });
  const item = await req.model(modelName).findOneAndUpdate(
    { _id: req.params.id, tenantId: req.user.tenantId },
    { archived: false, $unset: { archivedAt: 1 } },
    { new: true }
  );
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ restored: true });
});

// DELETE /api/trash/:type/:id — permanent delete
router.delete('/:type/:id', async (req, res) => {
  const modelName = MODEL_MAP[req.params.type];
  if (!modelName) return res.status(400).json({ error: 'Invalid type' });
  const item = await req.model(modelName).findOneAndDelete({
    _id: req.params.id,
    tenantId: req.user.tenantId,
    archived: true, // safety: only permanently delete already-archived items
  });
  if (!item) return res.status(404).json({ error: 'Not found or not archived' });
  // Cascade-delete recon run history and uploaded CSV files
  if (req.params.type === 'recon') {
    await Promise.all([
      req.model('ReconRun').deleteMany({ reconId: item._id }),
      req.model('ReconCsvFile').deleteMany({
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
  const archivedRecons = await req.model('Recon').find(filter).select('_id').lean();
  const reconIds = archivedRecons.map((r) => r._id);
  const results = await Promise.all([
    ...Object.values(MODEL_MAP).map((name) => req.model(name).deleteMany(filter)),
    req.model('ReconRun').deleteMany({ reconId: { $in: reconIds } }),
  ]);
  const total = results.reduce((sum, r) => sum + (r.deletedCount || 0), 0);
  res.json({ deleted: total });
});

module.exports = router;
