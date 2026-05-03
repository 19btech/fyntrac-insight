const router = require('express').Router();
const aiService = require('../services/ai.service');
const schemaService = require('../services/schema.service');
const AuditLog = require('../models/AuditLog.model');

/**
 * Build schema context for AI prompts: list of { name, fields[] }
 */
async function buildSchemaContext(user) {
  const collectionNames = await schemaService.listCollections();
  const contexts = await Promise.all(
    collectionNames.map(async (name) => {
      const fields = await schemaService.getCollectionFields(name, user);
      return { name, fields };
    })
  );
  return contexts;
}

// POST /api/ai/chat  (Server-Sent Events streaming)
router.post('/chat', async (req, res) => {
  const { messages, dashboardContext } = req.body;
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages must be an array' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const schemaContext = await buildSchemaContext(req.user);
    const stream = aiService.streamChatResponse(messages, schemaContext, req.user, dashboardContext);

    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// POST /api/ai/generate-pipeline
router.post('/generate-pipeline', async (req, res) => {
  const { naturalLanguage, collection } = req.body;
  if (!naturalLanguage) {
    return res.status(400).json({ error: 'naturalLanguage is required' });
  }

  try {
    const schemaContext = await buildSchemaContext(req.user);
    const result = await aiService.generatePipeline(naturalLanguage, schemaContext, req.user);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/insight  (SSE streaming)
router.post('/insight', async (req, res) => {
  const { chartData, chartConfig } = req.body;
  if (!Array.isArray(chartData)) {
    return res.status(400).json({ error: 'chartData must be an array' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const schemaContext = await buildSchemaContext(req.user);
    const stream = aiService.streamInsight(chartData, chartConfig, schemaContext, req.user);

    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// POST /api/ai/suggestions
router.post('/suggestions', async (req, res) => {
  const { collection } = req.body;
  if (!collection) return res.status(400).json({ error: 'collection is required' });

  try {
    const fields = await schemaService.getCollectionFields(collection, req.user);
    const suggestions = await aiService.getSuggestions(collection, fields, req.user);
    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/plan  (structured plan: { plan, sources, builderState, chartType })
router.post('/plan', async (req, res) => {
  const { prompt, intent, currentContext } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  try {
    const schemaContext = await buildSchemaContext(req.user);
    const plan = await aiService.generatePlan({ prompt, intent, currentContext }, schemaContext, req.user);
    AuditLog.create({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      action: 'ai.plan',
      resourceType: 'ai',
      metadata: { intent, prompt: String(prompt).slice(0, 240) },
    }).catch(() => {});
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/explain  (structured: { summary, drivers, followUps })
router.post('/explain', async (req, res) => {
  const { data, chartConfig, kpiContext, prompt } = req.body || {};
  if (!Array.isArray(data)) return res.status(400).json({ error: 'data must be an array' });
  try {
    const schemaContext = await buildSchemaContext(req.user);
    const out = await aiService.explainResult({ data, chartConfig, kpiContext, prompt }, schemaContext, req.user);
    AuditLog.create({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      action: 'ai.explain',
      resourceType: 'ai',
      metadata: { rows: data.length, chart: chartConfig?.chartType },
    }).catch(() => {});
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/mapping-suggest  (AI-powered recon mapping suggestion)
router.post('/mapping-suggest', async (req, res) => {
  const { columnsA, columnsB } = req.body || {};
  if (!Array.isArray(columnsA) || !Array.isArray(columnsB)) {
    return res.status(400).json({ error: 'columnsA and columnsB must be arrays' });
  }
  try {
    const result = await aiService.suggestReconMapping({ columnsA, columnsB }, req.user);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/suggest-target  (AI-powered KPI target suggestion)
router.post('/suggest-target', async (req, res) => {
  const { name, description, direction } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const result = await aiService.suggestKpiTarget({ name, description, direction }, req.user);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
