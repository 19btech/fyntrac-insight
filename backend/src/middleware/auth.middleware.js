const jwt = require('jsonwebtoken');

const PLACEHOLDER_KEYS = ['', '-----BEGIN PUBLIC KEY-----\\n...\\n-----END PUBLIC KEY-----'];

function isDevFallback() {
  const key = (process.env.JWT_PUBLIC_KEY || '').trim();
  return PLACEHOLDER_KEYS.includes(key) || !key.includes('BEGIN PUBLIC KEY');
}

/**
 * Validates the RS256 JWT issued by the Fyntrac main app.
 * Attaches { sub, tenantId, userId, role, attributes } to req.user.
 *
 * Dev fallback: when JWT_PUBLIC_KEY is empty or a placeholder, every
 * request is accepted as a default tenant user. Do NOT use in production.
 */
function authMiddleware(req, res, next) {
  if (isDevFallback()) {
    if (!authMiddleware._warned) {
      console.warn('[auth] JWT_PUBLIC_KEY not configured — using dev fallback user. DO NOT use in production.');
      authMiddleware._warned = true;
    }
    req.user = {
      sub: 'dev-user',
      userId: 'dev-user',
      tenantId: 'dev-tenant',
      role: 'admin',
      attributes: {},
    };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.slice(7);

  try {
    const publicKey = process.env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });

    if (!decoded.tenantId) {
      return res.status(401).json({ error: 'JWT missing tenantId claim' });
    }

    req.user = {
      sub: decoded.sub,
      userId: decoded.sub,
      tenantId: decoded.tenantId,
      role: decoded.role || 'viewer',
      attributes: decoded.attributes || {},
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired JWT', detail: err.message });
  }
}

module.exports = authMiddleware;
