const router = require('express').Router();
const Subscription = require('../models/Subscription.model');

// GET /api/subscriptions
router.get('/', async (req, res) => {
  const items = await req.model('Subscription').find({ tenantId: req.user.tenantId }).sort({ createdAt: -1 });
  res.json(items);
});

// POST /api/subscriptions  { dashboardId, cron, recipients[], subject }
router.post('/', async (req, res) => {
  const { dashboardId, cron, recipients, subject } = req.body;
  if (!dashboardId || !cron || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'dashboardId, cron, recipients[] required' });
  }
  const sub = await req.model('Subscription').create({
    tenantId: req.user.tenantId,
    dashboardId,
    cron,
    recipients,
    subject,
    createdBy: req.user.userId,
  });
  res.status(201).json(sub);
});

// PUT /api/subscriptions/:id
router.put('/:id', async (req, res) => {
  const sub = await req.model('Subscription').findOne({ _id: req.params.id, tenantId: req.user.tenantId });
  if (!sub) return res.status(404).json({ error: 'Not found' });
  ['cron', 'recipients', 'subject', 'enabled'].forEach((k) => {
    if (req.body[k] !== undefined) sub[k] = req.body[k];
  });
  await sub.save();
  res.json(sub);
});

// DELETE /api/subscriptions/:id
router.delete('/:id', async (req, res) => {
  await req.model('Subscription').deleteOne({ _id: req.params.id, tenantId: req.user.tenantId });
  res.json({ deleted: true });
});

module.exports = router;
