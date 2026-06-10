import { useLocalRuntime } from '@assistant-ui/react';
import { streamSSE } from '../../../hooks/useAI';

/**
 * Bridge assistant-ui's local runtime onto our existing SSE `/ai/chat`
 * endpoint. The backend streams `{ text }` deltas; assistant-ui's ChatModelAdapter
 * expects an async generator that yields the *accumulated* assistant text each
 * step (`{ content: [{ type: 'text', text }] }`).
 *
 * `getContext()` returns the merged entity context (active report / dataset /
 * recon / kpi + any caller-supplied context) attached to every request, so the
 * assistant stays aware of whatever the user has open.
 */
export function useFynbaseChatRuntime(getContext, initialMessages) {
  return useLocalRuntime({
    async *run({ messages, abortSignal }) {
      // assistant-ui messages → our flat {role, content} shape.
      const apiMessages = messages
        .map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: (m.content || [])
            .filter((p) => p.type === 'text')
            .map((p) => p.text)
            .join('\n\n'),
        }))
        .filter((m) => m.content);

      const dashboardContext = (typeof getContext === 'function' ? getContext() : getContext) || {};

      // Turn the callback-based SSE into an async generator via a small queue.
      let acc = '';
      const queue = [];
      let done = false;
      let error = null;
      let wake = null;
      const ping = () => { if (wake) { wake(); wake = null; } };

      streamSSE(
        '/ai/chat',
        { messages: apiMessages, dashboardContext },
        (chunk) => { acc += chunk; queue.push(acc); ping(); },
        abortSignal,
      ).then(
        () => { done = true; ping(); },
        (e) => { error = e; done = true; ping(); },
      );

      while (true) {
        if (queue.length) {
          const text = queue.shift();
          yield { content: [{ type: 'text', text }] };
          continue;
        }
        if (done) break;
        // eslint-disable-next-line no-await-in-loop, no-loop-func
        await new Promise((resolve) => { wake = resolve; });
      }

      // Surface failures as readable assistant text (the backend has already
      // mapped them to layman-friendly messages) rather than throwing a raw
      // error, so the user always sees a clear, actionable explanation in-chat.
      if (error && !(abortSignal && abortSignal.aborted)) {
        const friendly = error.message || 'Something went wrong. Please try again.';
        acc += (acc ? '\n\n' : '') + `⚠️ ${friendly}`;
        yield { content: [{ type: 'text', text: acc }] };
      }
    },
  }, (initialMessages && initialMessages.length) ? { initialMessages } : undefined);
}

export default useFynbaseChatRuntime;
