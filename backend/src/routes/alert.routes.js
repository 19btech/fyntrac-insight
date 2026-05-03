const router = require('express').Router();
const Alert = require('../models/Alert.model');

// GET /api/alerts
router.get('/', async (req, res) => {
  const alerts = await Alert.find({ tenantId: req.user.tenantId }).sort({ createdAt: -1 });
  res.json(alerts);
});

// POST /api/alerts
router.post('/', async (req, res) => {
  const { questionId, name, condition, frequency, recipients } = req.body;
  if (!questionId || !name || !condition) {
    return res.status(400).json({ error: 'questionId, name, and condition are required' });
  }

  const alert = await Alert.create({
    questionId,
    name,
    condition,
    frequency: frequency || '0 * * * *',
    recipients: recipients || [],
    tenantId: req.user.tenantId,
    createdBy: req.user.userId,
  });

  res.status(201).json(alert);
});

// PUT /api/alerts/:id
router.put('/:id', async (req, res) => {
  const alert = await Alert.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
  if (!alert) return res.status(404).json({ error: 'Alert not found' });

  const { name, condition, frequency, recipients, enabled } = req.body;
  Object.assign(alert, {
    name: name ?? alert.name,
    condition: condition ?? alert.condition,
    frequency: frequency ?? alert.frequency,
    recipients: recipients ?? alert.recipients,
    enabled: enabled ?? alert.enabled,
  });

  await alert.save();
  res.json(alert);
});

// DELETE /api/alerts/:id
router.delete('/:id', async (req, res) => {
  const alert = await Alert.findOneAndDelete({ _id: req.params.id, tenantId: req.user.tenantId });
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  res.json({ deleted: true });
});

module.exports = router;
