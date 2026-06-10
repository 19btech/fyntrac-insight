// Lightweight localStorage-backed store for Ask Insight conversation history.
// Each conversation: { id, title, ts, messages: [{ role, content }] } where
// content is plain text (artifact fences included) so it re-renders on reload.

const KEY = 'fyntrac_ai_conversations';
const MAX = 10; // keep only the last 10 conversations

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* quota / disabled */ }
}

export function newId() {
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function listConversations() {
  return read().slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, MAX);
}

export function getConversation(id) {
  return read().find((c) => c.id === id) || null;
}

export function upsertConversation(id, messages, title) {
  if (!id || !Array.isArray(messages) || messages.length === 0) return;
  const list = read();
  const idx = list.findIndex((c) => c.id === id);
  const entry = { id, title: title || 'New chat', ts: Date.now(), messages };
  if (idx >= 0) list[idx] = entry; else list.unshift(entry);
  write(list.sort((a, b) => (b.ts || 0) - (a.ts || 0)));
}

export function deleteConversation(id) {
  write(read().filter((c) => c.id !== id));
}

// Convert assistant-ui ThreadMessage[] → savable {role, content} text pairs.
export function toSavable(messages) {
  return (messages || [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role,
      content: (m.content || []).filter((p) => p.type === 'text').map((p) => p.text).join('\n\n'),
    }))
    .filter((m) => m.content);
}
