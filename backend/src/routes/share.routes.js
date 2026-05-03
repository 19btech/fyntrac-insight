const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const ShareToken = require('../models/ShareToken.model');
const Dashboard = require('../models/Dashboard.model');
const Question = require('../models/Question.model');
const mongoService = require('../services/mongo.service');

const MAX_SHARED_ROWS = parseInt(process.env.MAX_QUERY_ROWS || '50000', 10);

// POST /api/share  (protected — called with the same JWT the app already has)
// The route is mounted before the global authMiddleware, so we invoke it inline.
router.post('/', (req, res) => {
  // Import inline so this public-mount file doesn't create a circular dep at startup.
  const authMiddleware = require('../middleware/auth.middleware');
  authMiddleware(req, res, async () => {
    try {
      const { dashboardId, expiresInDays } = req.body;
      if (!dashboardId) return res.status(400).json({ error: 'dashboardId is required' });

      const dashboard = await Dashboard.findOne({
        _id: dashboardId,
        tenantId: req.user.tenantId,
      });
      if (!dashboard) return res.status(404).json({ error: 'Dashboard not found' });

      const token = uuidv4();
      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 86400000)
        : null;

      const share = await ShareToken.create({
        token,
        tenantId: req.user.tenantId,
        dashboardId,
        expiresAt,
        createdBy: req.user.userId,
      });

      res.status(201).json({ token, url: `/share/${token}`, expiresAt: share.expiresAt });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
});

// GET /api/share/:token  (public — no auth required)
router.get('/:token', async (req, res) => {
  try {
    const share = await ShareToken.findOne({ token: req.params.token });
    if (!share) return res.status(404).json({ error: 'Share link not found' });
    if (share.expiresAt && share.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Share link has expired' });
    }

    const dashboard = await Dashboard.findById(share.dashboardId).select('-versions');
    if (!dashboard) return res.status(404).json({ error: 'Dashboard not found' });

    res.json(dashboard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/share/q/:token  — public question (signed by question.publicShareToken)
router.get('/q/:token', async (req, res) => {
  try {
    const q = await Question.findOne({ publicShareToken: req.params.token, archived: { $ne: true } });
    if (!q) return res.status(404).json({ error: 'Question not found' });
    const fakeUser = { tenantId: q.tenantId, attributes: {}, userId: 'public' };
    const pipeline = q.queryConfig?.pipeline || [];
    const hasLimit = pipeline.some((s) => s.$limit !== undefined);
    const cappedPipeline = hasLimit ? pipeline : [...pipeline, { $limit: MAX_SHARED_ROWS }];
    const result = await mongoService.executePipeline(
      q.queryConfig?.collection,
      cappedPipeline,
      fakeUser
    );
    res.json({ ...result, question: { name: q.name, description: q.description, chartConfig: q.chartConfig } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
