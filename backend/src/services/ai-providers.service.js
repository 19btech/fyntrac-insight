const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { GoogleGenAI } = require('@google/genai');

/**
 * Multi-provider AI abstraction. Each function takes a `creds` object
 * { provider, apiKey, model } and returns a normalized response.
 *
 * Supported providers: 'anthropic' | 'openai' | 'gemini'
 */

const DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
};

/**
 * Static fallback model lists per provider.
 * Used when the provider doesn't expose a /models listing for this key
 * (Anthropic requires fallback; OpenAI + Gemini support live listing).
 */
const ANTHROPIC_MODELS = [
  { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
];

function clientFor(provider, apiKey) {
  if (!apiKey) throw new Error(`No API key configured for ${provider}`);
  switch (provider) {
    case 'anthropic': return new Anthropic({ apiKey });
    case 'openai': return new OpenAI({ apiKey });
    case 'gemini': return new GoogleGenAI({ apiKey });
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

// Appended (as its own delta) when a provider cut the answer off at max_tokens,
// so the user understands the reply is incomplete instead of silently truncated.
const TRUNCATION_NOTICE =
  "\n\n_…I hit my length limit, so this answer may be cut off. Ask me to \"continue\" and I'll pick up where I left off._";
const SAFETY_NOTICE = "\n\n_I wasn't able to complete that response. Try rephrasing your question._";

/**
 * Drain an Anthropic message stream, yielding text deltas and a closing notice
 * if the model was truncated at max_tokens.
 */
async function* anthropicTextDeltas(stream) {
  let stopReason = null;
  for await (const chunk of stream) {
    if (chunk.type === 'message_delta' && chunk.delta?.stop_reason) stopReason = chunk.delta.stop_reason;
    if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
      yield chunk.delta.text;
    }
  }
  if (stopReason === 'max_tokens') yield TRUNCATION_NOTICE;
}

/** Same for an OpenAI chat-completions stream (finish_reason === 'length'). */
async function* openaiTextDeltas(stream) {
  let finish = null;
  for await (const chunk of stream) {
    const c = chunk.choices?.[0];
    if (c?.finish_reason) finish = c.finish_reason;
    const t = c?.delta?.content;
    if (t) yield t;
  }
  if (finish === 'length') yield TRUNCATION_NOTICE;
}

/**
 * Same for a Gemini generateContentStream async iterable (@google/genai).
 * In the new SDK `chunk.text` is a string getter (the legacy SDK exposed it as
 * a function), so support both shapes.
 */
async function* geminiTextDeltas(geminiStream) {
  let finish = null;
  for await (const chunk of geminiStream) {
    const reason = chunk.candidates?.[0]?.finishReason;
    if (reason && reason !== 'STOP') finish = reason;
    let t = '';
    try { t = typeof chunk.text === 'function' ? chunk.text() : (chunk.text || ''); } catch { t = ''; }
    if (t) yield t;
  }
  if (finish === 'MAX_TOKENS') yield TRUNCATION_NOTICE;
  else if (finish === 'SAFETY' || finish === 'RECITATION') yield SAFETY_NOTICE;
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
    yield* anthropicTextDeltas(stream);
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
    yield* openaiTextDeltas(stream);
    return;
  }
  if (provider === 'gemini') {
    const ai = clientFor(provider, apiKey);
    // Convert messages to Gemini "contents" format
    const contents = messages
      .filter((x) => x.role !== 'system')
      .map((x) => ({
        role: x.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: x.content }],
      }));
    const stream = await ai.models.generateContentStream({
      model: m,
      contents,
      config: { systemInstruction: system, maxOutputTokens: maxTokens },
    });
    yield* geminiTextDeltas(stream);
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

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOL_DESC =
  'Run a MongoDB aggregation pipeline against a named collection to compute exact results ' +
  'from ALL rows in the tenant dataset. Use this whenever the user asks for a total, count, ' +
  'average, max, min, top-N, or any other aggregate that requires the full dataset. ' +
  'Do NOT use this for questions that can be answered from the sample rows already in context.';

const RUN_SQL_DESC =
  'Run a read-only SQL SELECT against the user\'s data to ANSWER a data question. ' +
  'Tables are the MongoDB collections in the catalog; columns are their fields. ' +
  'Dialect: DuckDB (PostgreSQL-like) — JOINs, CTEs (WITH), CASE, window functions allowed. ' +
  'Only SELECT/WITH is permitted (no writes). The FULL result is shown to the user as an interactive ' +
  'table, so after calling this give a brief 1–2 sentence interpretation — do NOT repeat all the rows. ' +
  'Use for "what / how many / total / compare / trend / top-N" questions.';

const PROPOSE_KPI_DESC =
  'Propose a KPI for the user to review and create. The user sees a confirmation card and decides ' +
  'whether to create it (you do NOT create it directly). Provide a name, an optional description, the ' +
  'source collection, and the aggregation. ' +
  'ANALYSE THE REQUEST FIRST: if the KPI implies a SUBSET of rows (e.g. a specific status, event type, ' +
  'product, region, or "active"/"open"/"EOD" qualifier), include `filters` to scope it — do not filter ' +
  'when the KPI is genuinely over all rows. Time-over-time intelligence (current vs previous period) is ' +
  'added automatically, so you do not need to specify it. Use when the user asks to create/build a KPI or metric.';

const SQL_PROP = { sql: { type: 'string', description: 'A single read-only SQL SELECT statement' } };
const KPI_PROPS = {
  name: { type: 'string', description: 'Short KPI name' },
  description: { type: 'string', description: 'Optional plain-English description' },
  collection: { type: 'string', description: 'Source MongoDB collection name' },
  agg: { type: 'string', description: 'Aggregation: one of $sum, $avg, $count, $min, $max' },
  field: { type: 'string', description: 'Numeric field to aggregate (omit for $count)' },
  filters: {
    type: 'array',
    description: 'Optional row filters that scope the KPI. Add when the request implies a subset. '
      + 'Each item: { field, operator, value }. operator ∈ $eq,$ne,$gt,$gte,$lt,$lte,$in,$regex. '
      + 'For $in, value is a comma-separated list.',
    items: {
      type: 'object',
      properties: {
        field: { type: 'string', description: 'Field name to filter on' },
        operator: { type: 'string', description: '$eq, $ne, $gt, $gte, $lt, $lte, $in, or $regex' },
        value: { type: 'string', description: 'Comparison value (numbers as strings are fine)' },
      },
      required: ['field', 'operator', 'value'],
    },
  },
};

const ANTHROPIC_TOOLS = [
  {
    name: 'compute_aggregation',
    description: TOOL_DESC,
    input_schema: {
      type: 'object',
      properties: {
        collection: { type: 'string', description: 'MongoDB collection name to query' },
        pipeline: {
          type: 'array',
          items: { type: 'object' },
          description: 'MongoDB aggregation pipeline stages as an array of stage objects',
        },
      },
      required: ['collection', 'pipeline'],
    },
  },
  {
    name: 'run_sql',
    description: RUN_SQL_DESC,
    input_schema: { type: 'object', properties: SQL_PROP, required: ['sql'] },
  },
  {
    name: 'propose_kpi',
    description: PROPOSE_KPI_DESC,
    input_schema: { type: 'object', properties: KPI_PROPS, required: ['name', 'collection', 'agg'] },
  },
];

const OPENAI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'compute_aggregation',
      description: TOOL_DESC,
      parameters: {
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'MongoDB collection name to query' },
          pipeline: {
            type: 'array',
            items: { type: 'object' },
            description: 'MongoDB aggregation pipeline stages',
          },
        },
        required: ['collection', 'pipeline'],
      },
    },
  },
  {
    type: 'function',
    function: { name: 'run_sql', description: RUN_SQL_DESC, parameters: { type: 'object', properties: SQL_PROP, required: ['sql'] } },
  },
  {
    type: 'function',
    function: { name: 'propose_kpi', description: PROPOSE_KPI_DESC, parameters: { type: 'object', properties: KPI_PROPS, required: ['name', 'collection', 'agg'] } },
  },
];

const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'compute_aggregation',
        description: TOOL_DESC,
        parametersJsonSchema: {
          type: 'object',
          properties: {
            collection: { type: 'string', description: 'MongoDB collection name to query' },
            pipeline: { type: 'array', items: { type: 'object' }, description: 'MongoDB aggregation pipeline stages' },
          },
          required: ['collection', 'pipeline'],
        },
      },
      { name: 'run_sql', description: RUN_SQL_DESC, parametersJsonSchema: { type: 'object', properties: SQL_PROP, required: ['sql'] } },
      { name: 'propose_kpi', description: PROPOSE_KPI_DESC, parametersJsonSchema: { type: 'object', properties: KPI_PROPS, required: ['name', 'collection', 'agg'] } },
    ],
  },
];

/**
 * Wrap a client-renderable artifact as a fenced block injected into the text
 * stream. The chat UI intercepts ```fyntrac-artifact``` blocks and renders them
 * as rich inline cards (result tables, KPI-draft confirm cards, …).
 */
function artifactBlock(artifact) {
  return `\n\n\`\`\`fyntrac-artifact\n${JSON.stringify(artifact)}\n\`\`\`\n\n`;
}
// Tool results may be { forModel, clientArtifact }. The model only needs the
// compact `forModel`; the rich `clientArtifact` is streamed to the browser.
function forModelOf(toolResult) {
  return (toolResult && toolResult.forModel !== undefined) ? toolResult.forModel : toolResult;
}

/**
 * Agentic streaming chat with tool-calling support.
 * Accepts an `onToolCall(name, input)` async function that executes server-side
 * tools and returns their result. Yields text deltas to the caller.
 *
 * Tool-calling loop (max 5 iterations):
 *   1. Non-streaming call to detect tool invocations.
 *   2. If tool_use detected → execute onToolCall, append result, continue loop.
 *   3. When no tool_use → stream the final answer.
 *
 * Falls back to plain streamChat when onToolCall is not provided.
 */
async function* streamChatWithTools({
  provider, apiKey, model, system, messages, maxTokens = 2048, onToolCall,
}) {
  if (!onToolCall) {
    yield* streamChat({ provider, apiKey, model, system, messages, maxTokens });
    return;
  }

  const m = model || DEFAULT_MODELS[provider];
  const MAX_ITERATIONS = 5;

  // ── Anthropic ──────────────────────────────────────────────────────────────
  if (provider === 'anthropic') {
    const a = clientFor(provider, apiKey);
    let anthropicMessages = messages.filter((x) => x.role !== 'system');

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const resp = await a.messages.create({
        model: m, max_tokens: maxTokens, system,
        tools: ANTHROPIC_TOOLS,
        messages: anthropicMessages,
      });

      if (resp.stop_reason === 'tool_use') {
        const toolBlock = resp.content.find((b) => b.type === 'tool_use');
        const toolResult = await onToolCall(toolBlock.name, toolBlock.input);
        if (toolResult && toolResult.clientArtifact) yield artifactBlock(toolResult.clientArtifact);
        anthropicMessages = [
          ...anthropicMessages,
          { role: 'assistant', content: resp.content },
          {
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: JSON.stringify(forModelOf(toolResult)),
            }],
          },
        ];
        continue;
      }

      // No tool use — stream the final answer without tools so we get deltas.
      const stream = a.messages.stream({
        model: m, max_tokens: maxTokens, system,
        messages: anthropicMessages,
      });
      yield* anthropicTextDeltas(stream);
      return;
    }

    // Max iterations exhausted — stream without tools.
    const stream = a.messages.stream({ model: m, max_tokens: maxTokens, system, messages: anthropicMessages });
    yield* anthropicTextDeltas(stream);
    return;
  }

  // ── OpenAI ─────────────────────────────────────────────────────────────────
  if (provider === 'openai') {
    const o = clientFor(provider, apiKey);
    const sysMsg = system ? [{ role: 'system', content: system }] : [];
    let openaiMessages = [...sysMsg, ...messages];

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const resp = await o.chat.completions.create({
        model: m, max_tokens: maxTokens,
        tools: OPENAI_TOOLS, tool_choice: 'auto',
        messages: openaiMessages,
      });

      const choice = resp.choices[0];
      if (choice.finish_reason === 'tool_calls') {
        const tc = choice.message.tool_calls[0];
        let input;
        try { input = JSON.parse(tc.function.arguments); } catch { input = {}; }
        const toolResult = await onToolCall(tc.function.name, input);
        if (toolResult && toolResult.clientArtifact) yield artifactBlock(toolResult.clientArtifact);
        openaiMessages = [
          ...openaiMessages,
          { role: 'assistant', content: choice.message.content || null, tool_calls: choice.message.tool_calls },
          { role: 'tool', tool_call_id: tc.id, content: JSON.stringify(forModelOf(toolResult)) },
        ];
        continue;
      }

      // Stream final answer without tools.
      const stream = await o.chat.completions.create({
        model: m, max_tokens: maxTokens, stream: true,
        messages: openaiMessages,
      });
      yield* openaiTextDeltas(stream);
      return;
    }

    // Max iterations exhausted.
    const stream = await o.chat.completions.create({
      model: m, max_tokens: maxTokens, stream: true, messages: openaiMessages,
    });
    yield* openaiTextDeltas(stream);
    return;
  }

  // ── Gemini ─────────────────────────────────────────────────────────────────
  if (provider === 'gemini') {
    const ai = clientFor(provider, apiKey);
    const baseConfig = { systemInstruction: system, maxOutputTokens: maxTokens };

    let geminiContents = messages
      .filter((x) => x.role !== 'system')
      .map((x) => ({
        role: x.role === 'assistant' ? 'model' : 'user',
        parts: Array.isArray(x.content) ? x.content : [{ text: x.content }],
      }));

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const resp = await ai.models.generateContent({
        model: m,
        contents: geminiContents,
        config: { ...baseConfig, tools: GEMINI_TOOLS },
      });
      const candidate = resp.candidates?.[0];
      const funcCallPart = candidate?.content?.parts?.find((p) => p.functionCall);

      if (funcCallPart) {
        const { name, args } = funcCallPart.functionCall;
        const toolResult = await onToolCall(name, args);
        if (toolResult && toolResult.clientArtifact) yield artifactBlock(toolResult.clientArtifact);
        geminiContents = [
          ...geminiContents,
          { role: 'model', parts: candidate.content.parts },
          {
            role: 'user',
            parts: [{ functionResponse: { name, response: { output: JSON.stringify(forModelOf(toolResult)) } } }],
          },
        ];
        continue;
      }

      // Stream final answer.
      const stream = await ai.models.generateContentStream({ model: m, contents: geminiContents, config: baseConfig });
      yield* geminiTextDeltas(stream);
      return;
    }

    // Max iterations exhausted.
    const stream = await ai.models.generateContentStream({ model: m, contents: geminiContents, config: baseConfig });
    yield* geminiTextDeltas(stream);
    return;
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

module.exports = {
  DEFAULT_MODELS,
  ANTHROPIC_MODELS,
  testApiKey,
  listModels,
  streamChat,
  streamChatWithTools,
  complete,
};
