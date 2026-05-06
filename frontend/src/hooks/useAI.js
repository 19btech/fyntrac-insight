import api from './useQuery';

const BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000/api';

/**
 * Stream an SSE endpoint.
 * @param {string} path - API path (e.g. '/ai/chat')
 * @param {object} body - Request body
 * @param {function} onChunk - Called with each text chunk
 */
export async function streamSSE(path, body, onChunk) {
  const token = sessionStorage.getItem('insight_auth_token');
  const tenant = sessionStorage.getItem('insight_tenant');
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenant ? { 'X-Tenant': tenant } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
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
      if (parsed.error) throw new Error(parsed.error);
      if (parsed.text) onChunk(parsed.text);
    }
  }
}

export default { streamSSE };
