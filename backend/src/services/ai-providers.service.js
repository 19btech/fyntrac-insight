const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Multi-provider AI abstraction. Each function takes a `creds` object
 * { provider, apiKey, model } and returns a normalized response.
 *
 * Supported providers: 'anthropic' | 'openai' | 'gemini'
 */

const DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
};

/**
 * Static fallback model lists per provider.
 * Used when the provider doesn't expose a /models listing for this key
 * (Anthropic requires fallback; OpenAI + Gemini support live listing).
 */
const ANTHROPIC_MODELS = [
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
  { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
];

function clientFor(provider, apiKey) {
  if (!apiKey) throw new Error(`No API key configured for ${provider}`);
  switch (provider) {
    case 'anthropic': return new Anthropic({ apiKey });
    case 'openai': return new OpenAI({ apiKey });
    case 'gemini': return new GoogleGenerativeAI(apiKey);
    default: throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Validate a key by issuing a lightweight read-only request that does NOT
 * consume AI generation quota. Returns { ok, provider, models?, error? }.
 *
 * - Anthropic: hit the models list endpoint (read-only, no token cost)
 * - OpenAI:    models.list() (already read-only)
 * - Gemini:    fetch the models list via the REST API (no generation quota)
 */
async function testApiKey(provider, apiKey) {
  try {
    if (provider === 'anthropic') {
      // Anthropic models list — read-only, zero token cost.
      const a = new Anthropic({ apiKey });
      const res = await a.models.list({ limit: 1 }).catch(async () => {
        // Older SDK versions may not have models.list — fall back to a
        // 1-token ping only if list is unavailable.
        return a.messages.create({
          model: DEFAULT_MODELS.anthropic,
          max_tokens: 1,
          messages: [{ role: 'user', content: '.' }],
        });
      });
      return { ok: true, provider };
    }
    if (provider === 'openai') {
      const o = new OpenAI({ apiKey });
      await o.models.list();
      return { ok: true, provider };
    }
    if (provider === 'gemini') {
      // List models via the REST API — read-only, does not consume
      // generateContent quota at all.
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=1`;
      const res = await fetch(url);
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        const body = await res.json().catch(() => ({}));
        const msg = body?.error?.message || `HTTP ${res.status}`;
        return { ok: false, provider, error: msg };
      }
      if (!res.ok) {
        return { ok: false, provider, error: `HTTP ${res.status}` };
      }
      return { ok: true, provider };
    }
    return { ok: false, error: `Unknown provider: ${provider}` };
  } catch (err) {
    return { ok: false, provider, error: err.message || String(err) };
  }
}

/**
 * List the models available for a given provider/key.
 */
async function listModels(provider, apiKey) {
  if (!apiKey) return [];
  if (provider === 'anthropic') {
    return ANTHROPIC_MODELS;
  }
  if (provider === 'openai') {
    const o = new OpenAI({ apiKey });
    const res = await o.models.list();
    const all = (res.data || res || []).map((m) => ({ id: m.id, name: m.id }));
    // Filter to chat-capable models
    return all
      .filter((m) => /^(gpt-|o\d|chatgpt-)/i.test(m.id))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  if (provider === 'gemini') {
    // Google Gen AI REST: list via fetch (SDK doesn't expose listModels yet)
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );
    if (!res.ok) throw new Error(`Gemini list failed: ${res.status}`);
    const json = await res.json();
    return (json.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => ({
        id: m.name.replace(/^models\//, ''),
        name: m.displayName || m.name,
      }));
  }
  return [];
}

/**
 * Stream a chat completion. Yields plain-text deltas.
 * messages: [{ role: 'user'|'assistant'|'system', content }]
 */
async function* streamChat({ provider, apiKey, model, system, messages, maxTokens = 2048 }) {
  const m = model || DEFAULT_MODELS[provider];
  if (provider === 'anthropic') {
    const a = clientFor(provider, apiKey);
    const stream = a.messages.stream({
      model: m,
      max_tokens: maxTokens,
      system,
      messages: messages.filter((x) => x.role !== 'system'),
    });
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        yield chunk.delta.text;
      }
    }
    return;
  }
  if (provider === 'openai') {
    const o = clientFor(provider, apiKey);
    const stream = await o.chat.completions.create({
      model: m,
      max_tokens: maxTokens,
      stream: true,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages,
      ],
    });
    for await (const chunk of stream) {
      const t = chunk.choices?.[0]?.delta?.content;
      if (t) yield t;
    }
    return;
  }
  if (provider === 'gemini') {
    const g = clientFor(provider, apiKey).getGenerativeModel({
      model: m,
      systemInstruction: system,
    });
    // Convert messages to Gemini "contents" format
    const contents = messages
      .filter((x) => x.role !== 'system')
      .map((x) => ({
        role: x.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: x.content }],
      }));
    const result = await g.generateContentStream({ contents });
    for await (const chunk of result.stream) {
      const t = typeof chunk.text === 'function' ? chunk.text() : '';
      if (t) yield t;
    }
    return;
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

/**
 * Single-shot completion (non-streaming). Returns string.
 */
async function complete({ provider, apiKey, model, system, messages, maxTokens = 1024 }) {
  let acc = '';
  for await (const chunk of streamChat({ provider, apiKey, model, system, messages, maxTokens })) {
    acc += chunk;
  }
  return acc;
}

module.exports = {
  DEFAULT_MODELS,
  ANTHROPIC_MODELS,
  testApiKey,
  listModels,
  streamChat,
  complete,
};
