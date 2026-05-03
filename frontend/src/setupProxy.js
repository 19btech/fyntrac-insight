/**
 * CRA dev-server proxy with SSE (Server-Sent Events) support.
 *
 * The default `"proxy"` field in package.json uses http-proxy-middleware with
 * settings that buffer responses — fine for JSON, but it stalls our streaming
 * /api/ai/chat and /api/ai/insight endpoints. This setup:
 *   - disables response buffering so chunks flush immediately,
 *   - sets compression-friendly headers per request,
 *   - forwards the original Origin so the backend's CORS allow-list works.
 */
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:4000',
      changeOrigin: true,
      ws: true,
      // Important for SSE: don't let the proxy buffer or compress chunks.
      selfHandleResponse: false,
      proxyTimeout: 0,
      timeout: 0,
      onProxyReq: (proxyReq, req) => {
        // CRA's body-parser may have consumed the body — re-stream it.
        if (req.body && req.method !== 'GET' && req.method !== 'HEAD') {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader('Content-Type', 'application/json');
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      },
      onProxyRes: (proxyRes, req, res) => {
        // For SSE responses make sure we don't buffer.
        const ct = proxyRes.headers['content-type'] || '';
        if (ct.includes('text/event-stream')) {
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('X-Accel-Buffering', 'no');
          if (typeof res.flushHeaders === 'function') res.flushHeaders();
        }
      },
    })
  );
};
