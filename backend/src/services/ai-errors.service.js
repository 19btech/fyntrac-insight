/**
 * Central error classifier for all AI (LLM provider) calls.
 *
 * Provider SDKs (Anthropic / OpenAI / Gemini) throw a grab-bag of error shapes
 * with status codes and opaque messages. This maps any of them to a single,
 * predictable result the UI can act on:
 *
 *   { code, userMessage, retryable, httpStatus }
 *
 * - code        machine-readable category (for client special-casing / metrics)
 * - userMessage layman-friendly text safe to show in the chat — never leaks
 *               stack traces, SQL, status codes, or raw provider messages
 * - retryable   true when simply trying again might work (transient)
 * - httpStatus  status to use for non-streaming JSON endpoints
 *
 * IMPORTANT: log the *original* error server-side; only `userMessage` is ever
 * sent to the browser.
 */

const MESSAGES = {
  context_length: {
    userMessage:
      'This conversation has gotten too long for me to read all at once. Try starting a new chat, or ask a more specific question.',
    retryable: false,
    httpStatus: 413,
  },
  rate_limit: {
    userMessage: "I'm getting a lot of requests right now. Give me a few seconds and try again.",
    retryable: true,
    httpStatus: 429,
  },
  quota: {
    userMessage:
      'The AI service has run out of usage credits. Please contact your administrator to top it up.',
    retryable: false,
    httpStatus: 402,
  },
  auth: {
    userMessage:
      "I can't reach the AI service — the connection key looks invalid. An admin will need to check the AI settings.",
    retryable: false,
    httpStatus: 401,
  },
  not_configured: {
    userMessage:
      "AI features aren't set up yet. Ask an admin to add an AI provider and key in Settings.",
    retryable: false,
    httpStatus: 400,
  },
  model_unavailable: {
    userMessage:
      "The selected AI model isn't available anymore. Please pick a different model in AI settings.",
    retryable: false,
    httpStatus: 400,
  },
  overloaded: {
    userMessage: 'The AI service is temporarily overloaded. Please try again in a moment.',
    retryable: true,
    httpStatus: 503,
  },
  timeout: {
    userMessage:
      'That took too long and timed out. Please try again — if it keeps happening, check your connection.',
    retryable: true,
    httpStatus: 504,
  },
  safety: {
    userMessage: "I wasn't able to answer that one. Try rephrasing your question.",
    retryable: false,
    httpStatus: 422,
  },
  unknown: {
    userMessage:
      'Something went wrong on my end. Please try again — if it keeps happening, let your administrator know.',
    retryable: true,
    httpStatus: 500,
  },
};

/** True if `hay` contains any of `needles` (case-insensitive). */
function has(hay, ...needles) {
  return needles.some((n) => hay.includes(n));
}

/**
 * Classify an arbitrary error thrown by a provider SDK or our own service code.
 * @param {*} err
 * @returns {{ code: string, userMessage: string, retryable: boolean, httpStatus: number }}
 */
function classifyAIError(err) {
  const status = err?.status ?? err?.statusCode ?? err?.response?.status;
  // Normalise every text source we might match on into one lowercase blob.
  const msg = String(
    err?.message ||
      err?.error?.message ||
      err?.error?.error?.message ||
      err ||
      '',
  ).toLowerCase();
  const type = String(
    err?.error?.type || err?.error?.error?.type || err?.type || err?.code || '',
  ).toLowerCase();

  let code = 'unknown';

  // ── Our own pre-flight error (resolveCreds throws this) ────────────────────
  if (has(msg, 'no api key configured')) code = 'not_configured';
  // ── Context / token-window overflow (distinct from output max_tokens) ──────
  else if (
    has(
      msg,
      'prompt is too long',
      'maximum context length',
      'context_length_exceeded',
      'context length',
      'too many tokens',
      'token count',
      'exceeds the maximum',
      'input is too long',
    ) ||
    has(type, 'context_length_exceeded')
  ) {
    code = 'context_length';
  }
  // ── Auth / invalid key ─────────────────────────────────────────────────────
  else if (
    status === 401 ||
    has(type, 'authentication', 'invalid_api_key', 'permission_denied') ||
    has(msg, 'invalid api key', 'incorrect api key', 'unauthorized', 'api key not valid')
  ) {
    code = 'auth';
  }
  // ── Quota / billing exhausted (retrying won't help) ────────────────────────
  else if (
    has(type, 'insufficient_quota', 'billing') ||
    has(msg, 'insufficient_quota', 'exceeded your current quota', 'billing', 'out of credit', 'credit balance')
  ) {
    code = 'quota';
  }
  // ── Rate limit (transient) ─────────────────────────────────────────────────
  else if (status === 429 || has(type, 'rate_limit', 'resource_exhausted') || has(msg, 'rate limit', 'too many requests')) {
    code = 'rate_limit';
  }
  // ── Model not found / no access / deprecated ───────────────────────────────
  else if (
    has(msg, 'model not found', 'does not exist', 'no such model', 'unknown model', 'is not supported', 'deprecated') ||
    (status === 404 && has(msg, 'model'))
  ) {
    code = 'model_unavailable';
  }
  // ── Provider overloaded / temporary 5xx ────────────────────────────────────
  else if (status === 529 || status === 503 || has(type, 'overloaded') || has(msg, 'overloaded', 'service unavailable', 'temporarily unavailable')) {
    code = 'overloaded';
  }
  // ── Timeout / network ──────────────────────────────────────────────────────
  else if (
    has(type, 'econnreset', 'etimedout', 'enotfound', 'econnrefused', 'epipe') ||
    has(msg, 'timeout', 'timed out', 'network', 'socket hang up', 'connection error', 'fetch failed') ||
    err?.name === 'APIConnectionError' ||
    err?.name === 'APIConnectionTimeoutError'
  ) {
    code = 'timeout';
  }
  // ── Safety / content filter ────────────────────────────────────────────────
  else if (has(type, 'safety') || has(msg, 'safety', 'blocked', 'content management policy', 'content policy', 'finishreason: safety')) {
    code = 'safety';
  }
  // ── Generic 5xx fallbacks ──────────────────────────────────────────────────
  else if (typeof status === 'number' && status >= 500) {
    code = 'overloaded';
  }

  return { code, ...MESSAGES[code] };
}

module.exports = { classifyAIError, MESSAGES };
