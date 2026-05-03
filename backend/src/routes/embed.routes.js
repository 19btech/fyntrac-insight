const router = require('express').Router();
const jwt = require('jsonwebtoken');
const Dashboard = require('../models/Dashboard.model');
const Question = require('../models/Question.model');
const mongoService = require('../services/mongo.service');

/**
 * Metabase v60 "Static Embedding" — host signs a short-lived JWT with HS256
 * containing { resource: { dashboard: <id> } | { question: <id> }, params: {...}, exp }.
 * The embedded iframe loads /embed/dashboard/<jwt> on the frontend, which calls these
 * endpoints. NO end-user JWT or login required. Locked-down to whitelisted resources only.
 *
 * Set EMBEDDING_SECRET_KEY in .env. Embedding is disabled if the env var is missing.
 */

function decodeEmbedToken(token) {
  const secret = process.env.EMBEDDING_SECRET_KEY;
  if (!secret) throw new Error('Embedding is not enabled (EMBEDDING_SECRET_KEY missing)');
  return jwt.verify(token, secret, { algorithms: ['HS256'] });
}

function buildEmbedUser(payload) {
  // Synthetic user: only carries the tenantId from the signed token.
  return {
    userId: 'embed',
    tenantId: payload.tenantId,
    attributes: payload.attributes || {},
  };
}

// GET /api/embed/dashboard/:token
router.get('/dashboard/:token', async (req, res) => {
  try {
    const payload = decodeEmbedToken(req.params.token);
    const dashboardId = payload?.resource?.dashboard;
    if (!dashboardId) return res.status(400).json({ error: 'Token missing resource.dashboard' });

    const dashboard = await Dashboard.findOne({
      _id: dashboardId,
      tenantId: payload.tenantId,
      archived: { $ne: true },
    }).select('-versions');
    if (!dashboard) return res.status(404).json({ error: 'Dashboard not found' });

    res.json(dashboard);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// POST /api/embed/dashboard/:token/card/:cardId/query
router.post('/dashboard/:token/card/:cardId/query', async (req, res) => {
  try {
    const payload = decodeEmbedToken(req.params.token);
    const dashboardId = payload?.resource?.dashboard;
    const dashboard = await Dashboard.findOne({
      _id: dashboardId,
      tenantId: payload.tenantId,
    });
    if (!dashboard) return res.status(404).json({ error: 'Dashboard not found' });

    const card = (dashboard.cards || []).find((c) => c.i === req.params.cardId);
    if (!card || !card.questionId) return res.status(404).json({ error: 'Card not found' });

    const question = await Question.findOne({
      _id: card.questionId,
      tenantId: payload.tenantId,
    });
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const user = buildEmbedUser(payload);
    const pipeline = question.queryConfig?.pipeline || [];
    const result = await mongoService.executePipeline(
      question.queryConfig?.collection,
      pipeline,
      user
    );
    res.json({ ...result, question: { name: question.name, chartConfig: question.chartConfig } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/embed/question/:token
router.get('/question/:token', async (req, res) => {
  try {
    const payload = decodeEmbedToken(req.params.token);
    const questionId = payload?.resource?.question;
    if (!questionId) return res.status(400).json({ error: 'Token missing resource.question' });

    const question = await Question.findOne({
      _id: questionId,
      tenantId: payload.tenantId,
      archived: { $ne: true },
    });
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const user = buildEmbedUser(payload);
    const result = await mongoService.executePipeline(
      question.queryConfig?.collection,
      question.queryConfig?.pipeline || [],
      user
    );
    res.json({ ...result, question: { name: question.name, chartConfig: question.chartConfig } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
