const router = require('express').Router();
const AuditLog = require('../models/AuditLog.model');

// GET /api/admin/audit
// Query params: action, resourceType, userId, from, to, limit (default 100), skip (default 0)
router.get('/audit', async (req, res) => {
  try {
    // Only admin and editor roles can access audit logs
    if (req.user.role !== 'admin' && req.user.role !== 'editor') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { action, resourceType, userId, from, to, limit = 100, skip = 0 } = req.query;

    const filter = { tenantId: req.user.tenantId };
    if (action) filter.action = action;
    if (resourceType) filter.resourceType = resourceType;
    if (userId) filter.userId = userId;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      req.model('AuditLog').find(filter)
        .sort({ createdAt: -1 })
        .skip(Number(skip))
        .limit(Math.min(Number(limit), 500)),
      req.model('AuditLog').countDocuments(filter),
    ]);

    res.json({ logs, total, skip: Number(skip), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/audit/summary
// Returns aggregated stats: top actions, active users, avg execution time — last 30 days
router.get('/audit/summary', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'editor') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const base = { tenantId: req.user.tenantId, createdAt: { $gte: since } };

    const [
      topActions,
      activeUsers,
      avgExecTime,
      dailyActivity,
    ] = await Promise.all([
      req.model('AuditLog').aggregate([
        { $match: base },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      req.model('AuditLog').aggregate([
        { $match: base },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      req.model('AuditLog').aggregate([
        { $match: { ...base, executionTimeMs: { $exists: true } } },
        { $group: { _id: '$action', avgMs: { $avg: '$executionTimeMs' }, count: { $sum: 1 } } },
        { $sort: { avgMs: -1 } },
        { $limit: 10 },
      ]),

      req.model('AuditLog').aggregate([
        { $match: base },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({ topActions, activeUsers, avgExecTime, dailyActivity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
