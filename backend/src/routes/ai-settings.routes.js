const router = require('express').Router();
const AISettings = require('../models/AISettings.model');
const credService = require('../services/ai-credentials.service');
const providers = require('../services/ai-providers.service');

const VALID_PROVIDERS = ['anthropic', 'openai', 'gemini'];

/** Strip encrypted keys before returning settings to the UI. */
function sanitize(doc) {
  const obj = doc?.toObject ? doc.toObject() : (doc || {});
  const out = {
    activeProvider: obj.activeProvider || 'anthropic',
    activeModel: obj.activeModel || '',
    conservativeMode: !!obj.conservativeMode,
    providers: {},
  };
  for (const p of VALID_PROVIDERS) {
    const cfg = obj.providers?.[p] || {};
    out.providers[p] = {
      hasKey: !!cfg.encryptedKey,
      keyHint: cfg.keyHint || '',
      model: cfg.model || providers.DEFAULT_MODELS[p],
      verifiedAt: cfg.verifiedAt || null,
    };
  }
  return out;
}

/** GET /api/ai-settings — current user's AI config (no raw keys). */
router.get('/', async (req, res) => {
  const doc = await req.model('AISettings').findOne({ tenantId: req.user.tenantId, userId: req.user.userId });
  res.json(sanitize(doc));
});

/**
 * PUT /api/ai-settings/key
 * Body: { provider, apiKey }   (apiKey may be empty string to clear)
 * Encrypts and stores the key, sets keyHint.
 */
router.put('/key', async (req, res) => {
  const { provider, apiKey } = req.body || {};
  if (!VALID_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: 'Invalid provider' });
  }

  const filter = { tenantId: req.user.tenantId, userId: req.user.userId };
  const doc = await req.model('AISettings').findOneAndUpdate(filter, filter, { upsert: true, new: true });

  if (!apiKey) {
    doc.providers[provider].encryptedKey = '';
    doc.providers[provider].keyHint = '';
    doc.providers[provider].verifiedAt = null;
  } else {
    doc.providers[provider].encryptedKey = credService.encrypt(apiKey);
    doc.providers[provider].keyHint = credService.keyHint(apiKey);
  }
  await doc.save();
  res.json(sanitize(doc));
});

/**
 * POST /api/ai-settings/test
 * Body: { provider, apiKey }   (uses provided key OR stored key if empty)
 * Returns { ok, error?, modelTested? }
 */
router.post('/test', async (req, res) => {
  const { provider } = req.body || {};
  let { apiKey } = req.body || {};
  if (!VALID_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: 'Invalid provider' });
  }
  if (!apiKey) {
    const doc = await req.model('AISettings').findOne({ tenantId: req.user.tenantId, userId: req.user.userId });
    const enc = doc?.providers?.[provider]?.encryptedKey;
    if (enc) {
      try { apiKey = credService.decrypt(enc); } catch { /* noop */ }
    }
  }
  if (!apiKey) return res.json({ ok: false, error: 'No API key provided or stored.' });

  const result = await providers.testApiKey(provider, apiKey);
  if (result.ok) {
    await req.model('AISettings').updateOne(
      { tenantId: req.user.tenantId, userId: req.user.userId },
      { $set: { [`providers.${provider}.verifiedAt`]: new Date() } },
      { upsert: true }
    );
  }
  res.json(result);
});

/**
 * GET /api/ai-settings/models?provider=...
 * Lists models available for that provider/key (uses stored key).
 * Optional: ?apiKey=... to test with a not-yet-saved key.
 */
router.get('/models', async (req, res) => {
  const { provider } = req.query;
  let apiKey = req.query.apiKey || '';
  if (!VALID_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: 'Invalid provider' });
  }
  if (!apiKey) {
    const doc = await req.model('AISettings').findOne({ tenantId: req.user.tenantId, userId: req.user.userId });
    const enc = doc?.providers?.[provider]?.encryptedKey;
    if (enc) {
      try { apiKey = credService.decrypt(enc); } catch { /* noop */ }
    }
  }
  if (!apiKey) return res.json({ models: [] });

  try {
    const models = await providers.listModels(provider, apiKey);
    res.json({ models });
  } catch (err) {
    res.status(400).json({ error: err.message, models: [] });
  }
});

/**
 * PUT /api/ai-settings/active
 * Body: { activeProvider, activeModel? }   — switch provider/model at runtime
 */
router.put('/active', async (req, res) => {
  const { activeProvider, activeModel } = req.body || {};
  if (!VALID_PROVIDERS.includes(activeProvider)) {
    return res.status(400).json({ error: 'Invalid provider' });
  }
  const filter = { tenantId: req.user.tenantId, userId: req.user.userId };
  const update = { activeProvider };
  if (typeof activeModel === 'string') {
    update.activeModel = activeModel;
    update[`providers.${activeProvider}.model`] = activeModel;
  }
  const doc = await req.model('AISettings').findOneAndUpdate(filter, { $set: update }, { upsert: true, new: true });
  res.json(sanitize(doc));
});

/**
 * PUT /api/ai-settings/conservative
 * Body: { conservativeMode: boolean }
 */
router.put('/conservative', async (req, res) => {
  const { conservativeMode } = req.body || {};
  const filter = { tenantId: req.user.tenantId, userId: req.user.userId };
  const doc = await req.model('AISettings').findOneAndUpdate(
    filter,
    { $set: { conservativeMode: !!conservativeMode } },
    { upsert: true, new: true }
  );
  res.json(sanitize(doc));
});

module.exports = router;
