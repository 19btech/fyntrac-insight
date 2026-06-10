import api from './useQuery';

const BASE_URL = process.env.REACT_APP_API_BASE_URL || '/api';

/**
 * Stream an SSE endpoint.
 * @param {string} path - API path (e.g. '/ai/chat')
 * @param {object} body - Request body
 * @param {function} onChunk - Called with each text chunk
 * @param {AbortSignal} [signal] - Optional signal to cancel the in-flight stream
 */
export async function streamSSE(path, body, onChunk, signal) {
  const token = sessionStorage.getItem('insight_auth_token');
  const tenant = sessionStorage.getItem('insight_tenant');
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (tenant) headers['X-Tenant'] = tenant;

  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    // Pre-stream / transport failure (auth gateway, network, infra) — the body
    // is not an SSE stream here, so produce a friendly message from the status.
    let friendly = 'Something went wrong reaching the assistant. Please try again.';
    if (response.status === 401 || response.status === 403) {
      friendly = 'Your session has expired. Please refresh the page and sign back in.';
    } else if (response.status === 429) {
      friendly = "I'm getting a lot of requests right now. Give me a few seconds and try again.";
    } else if (response.status >= 500) {
      friendly = 'The assistant is temporarily unavailable. Please try again in a moment.';
    }
    const e = new Error(friendly);
    e.code = 'transport';
    e.httpStatus = response.status;
    throw e;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // Backstop watchdog: if the backend wedges and sends nothing for this long,
  // give up gracefully instead of spinning forever. The server has its own
  // (shorter) timeouts, so this only fires if the server itself is unreachable.
  const IDLE_MS = 120000;
  const readWithTimeout = () => Promise.race([
    reader.read(),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('The assistant took too long to respond. Please try again.')), IDLE_MS);
    }),
  ]);

  while (true) {
    let res;
    try {
      res = await readWithTimeout();
    } catch (e) {
      reader.cancel().catch(() => {});
      throw e;
    }
    const { done, value } = res;
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE messages are terminated by a blank line ("\n\n"), NOT a single "\n".
    // A single message can span multiple lines and may contain embedded
    // newlines inside its JSON payload (e.g. provider error messages).
    const messages = buffer.split('\n\n');
    buffer = messages.pop(); // keep incomplete last message

    for (const message of messages) {
      // Concatenate all `data:` lines in this message (per SSE spec).
      const dataLines = message
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(l.startsWith('data: ') ? 6 : 5));
      if (dataLines.length === 0) continue;
      const data = dataLines.join('\n');
      if (data === '[DONE]') return;
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        // Malformed payload — skip this message.
        continue;
      }
      if (parsed.error) {
        // Backend already classified this into layman-friendly text; carry the
        // category/retryable hint along for callers that special-case them.
        const e = new Error(parsed.error);
        e.code = parsed.code;
        e.retryable = parsed.retryable;
        throw e;
      }
      if (parsed.text) onChunk(parsed.text);
    }
  }
}

export default { streamSSE };
