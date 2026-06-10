const router = require('express').Router();
const aiService = require('../services/ai.service');
const schemaService = require('../services/schema.service');
const { classifyAIError } = require('../services/ai-errors.service');
require('../models/AuditLog.model');

/**
 * Emit a layman-friendly error over an already-open SSE stream, then close it.
 * The full error is logged server-side; only the friendly text reaches the browser.
 */
function sseError(res, err, tag) {
  const info = classifyAIError(err);
  // eslint-disable-next-line no-console
  console.error(`[${tag}] AI error (${info.code}):`, err?.message || err);
  res.write(`data: ${JSON.stringify({ error: info.userMessage, code: info.code, retryable: info.retryable })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

/** Same, for non-streaming JSON endpoints. */
function jsonError(res, err, tag) {
  const info = classifyAIError(err);
  // eslint-disable-next-line no-console
  console.error(`[${tag}] AI error (${info.code}):`, err?.message || err);
  res.status(info.httpStatus || 500).json({ error: info.userMessage, code: info.code, retryable: info.retryable });
}

// A provider call can wedge without ever throwing or completing (e.g. an SDK
// that doesn't understand a newer model's response format), which would leave
// the SSE stream — and the chat UI — spinning forever. These guard against that.
const FIRST_TOKEN_TIMEOUT_MS = 60000; // allow a "thinking" model time before its first token
const IDLE_TIMEOUT_MS = 30000;        // max gap between tokens once flowing
const EMPTY_RESPONSE_MSG =
  "I wasn't able to generate a response that time. Please try again, or rephrase your question.";

/**
 * Wrap an async iterable so a stall (no first token, or a long gap between
 * tokens) rejects instead of hanging forever. On timeout/break we close the
 * underlying iterator so the provider stream is not left dangling.
 */
async function* withInactivityTimeout(iterable, { firstMs, idleMs }) {
  const it = iterable[Symbol.asyncIterator]();
  let first = true;
  try {
    while (true) {
      let timer;
      const limit = first ? firstMs : idleMs;
      // eslint-disable-next-line no-await-in-loop
      const result = await Promise.race([
        it.next(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('The assistant timed out waiting for the AI model')), limit);
        }),
      ]).finally(() => clearTimeout(timer));
      first = false;
      if (result.done) return;
      yield result.value;
    }
  } finally {
    if (typeof it.return === 'function') it.return().catch(() => {});
  }
}

/**
 * Build schema context for AI prompts: list of { name, fields[] }
 */
async function buildSchemaContext(user) {
  const collectionNames = await schemaService.listCollections(user);
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

  // Stop writing as soon as the user navigates away / closes the panel so we
  // don't keep streaming into a dead socket. NOTE: listen on `res`, not `req` —
  // for a POST SSE endpoint `req`'s 'close' fires as soon as the request body
  // is consumed (while the client is still connected), which would abort the
  // response before any chunk is written. `res` 'close' is the real disconnect.
  let clientGone = false;
  res.on('close', () => { if (!res.writableEnded) clientGone = true; });

  try {
    const schemaContext = await buildSchemaContext(req.user);
    const stream = aiService.streamChatResponse(messages, schemaContext, req.user, dashboardContext);

    let emittedText = false;
    for await (const chunk of withInactivityTimeout(stream, { firstMs: FIRST_TOKEN_TIMEOUT_MS, idleMs: IDLE_TIMEOUT_MS })) {
      if (clientGone) return;
      if (chunk && chunk.trim()) emittedText = true;
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }
    // Completed cleanly but with no content — show a friendly note rather than
    // leaving an empty assistant bubble.
    if (!emittedText && !clientGone) {
      res.write(`data: ${JSON.stringify({ text: EMPTY_RESPONSE_MSG })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    if (clientGone) return;
    sseError(res, err, 'ai/chat');
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
    jsonError(res, err, 'ai/generate-pipeline');
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

  // See the /chat handler — listen on `res`, not `req`, so the request-body
  // 'close' on a POST doesn't abort the stream before it starts.
  let clientGone = false;
  res.on('close', () => { if (!res.writableEnded) clientGone = true; });

  try {
    const schemaContext = await buildSchemaContext(req.user);
    const stream = aiService.streamInsight(chartData, chartConfig, schemaContext, req.user);

    let emittedText = false;
    for await (const chunk of withInactivityTimeout(stream, { firstMs: FIRST_TOKEN_TIMEOUT_MS, idleMs: IDLE_TIMEOUT_MS })) {
      if (clientGone) return;
      if (chunk && chunk.trim()) emittedText = true;
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }
    if (!emittedText && !clientGone) {
      res.write(`data: ${JSON.stringify({ text: EMPTY_RESPONSE_MSG })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    if (clientGone) return;
    sseError(res, err, 'ai/insight');
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
    jsonError(res, err, 'ai/suggestions');
  }
});

// POST /api/ai/plan  (structured plan: { plan, sources, builderState, chartType })
router.post('/plan', async (req, res) => {
  const { prompt, intent, currentContext } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  try {
    const schemaContext = await buildSchemaContext(req.user);
    const plan = await aiService.generatePlan({ prompt, intent, currentContext }, schemaContext, req.user);
    req.model('AuditLog').create({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      action: 'ai.plan',
      resourceType: 'ai',
      metadata: { intent, prompt: String(prompt).slice(0, 240) },
    }).catch(() => {});
    res.json(plan);
  } catch (err) {
    jsonError(res, err, 'ai/plan');
  }
});

// POST /api/ai/explain  (structured: { summary, drivers, followUps })
router.post('/explain', async (req, res) => {
  const { data, chartConfig, kpiContext, prompt } = req.body || {};
  if (!Array.isArray(data)) return res.status(400).json({ error: 'data must be an array' });
  try {
    const schemaContext = await buildSchemaContext(req.user);
    const out = await aiService.explainResult({ data, chartConfig, kpiContext, prompt }, schemaContext, req.user);
    req.model('AuditLog').create({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      action: 'ai.explain',
      resourceType: 'ai',
      metadata: { rows: data.length, chart: chartConfig?.chartType },
    }).catch(() => {});
    res.json(out);
  } catch (err) {
    jsonError(res, err, 'ai/explain');
  }
});

// POST /api/ai/mapping-suggest  (AI-powered recon mapping suggestion)
router.post('/mapping-suggest', async (req, res) => {
  const { columnsA, columnsB, sampleA, sampleB, typesA, typesB } = req.body || {};
  if (!Array.isArray(columnsA) || !Array.isArray(columnsB)) {
    return res.status(400).json({ error: 'columnsA and columnsB must be arrays' });
  }
  try {
    const result = await aiService.suggestReconMapping(
      { columnsA, columnsB, sampleA, sampleB, typesA, typesB },
      req.user,
    );
    res.json(result);
  } catch (err) {
    jsonError(res, err, 'ai/mapping-suggest');
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
    jsonError(res, err, 'ai/suggest-target');
  }
});

module.exports = router;
