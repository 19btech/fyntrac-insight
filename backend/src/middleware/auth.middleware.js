'use strict';

/**
 * ZITADEL JWT Bearer authentication middleware for Express.
 *
 * Priority:
 *   1. SKIP_AUTH=true            → dev bypass (never use in production)
 *   2. ZITADEL_ISSUER_URI set    → validate via ZITADEL JWKS (RS256)
 *   3. JWT_PUBLIC_KEY set        → validate with static RS256 public key
 *   4. Neither configured        → dev fallback user (warns once)
 *
 * Attaches { sub, userId, tenantId, email, role } to req.user.
 */

const jwt = require('jsonwebtoken');
const https = require('https');
const http = require('http');

// ── JWKS cache ────────────────────────────────────────────────────────────────
let _jwksCache = null;
let _jwksCacheExpiry = 0;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Simple promise-based HTTP/HTTPS GET that returns parsed JSON.
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch and cache JWKS keys from the ZITADEL issuer's OIDC discovery document.
 */
async function getJwks(issuerUri) {
  if (_jwksCache && Date.now() < _jwksCacheExpiry) {
    return _jwksCache;
  }

  const discoveryUrl = `${issuerUri.replace(/\/$/, '')}/.well-known/openid-configuration`;
  console.log('[auth] Refreshing JWKS from', discoveryUrl);

  const oidcConfig = await fetchJson(discoveryUrl);
  const jwks = await fetchJson(oidcConfig.jwks_uri);

  _jwksCache = jwks;
  _jwksCacheExpiry = Date.now() + JWKS_CACHE_TTL_MS;
  return jwks;
}

/**
 * Given a key ID (kid), find the matching public key in the JWKS and return it
 * in PEM format using jsonwebtoken's getPem helper (via a simple RSA conversion).
 */
function findPublicKey(jwks, kid) {
  const keys = jwks.keys || [];
  const key = keys.find((k) => k.kid === kid);
  if (!key) return null;

  // Build a proper PEM from the JWK components using Node.js crypto
  try {
    const { createPublicKey } = require('crypto');
    const publicKey = createPublicKey({ key, format: 'jwk' });
    return publicKey.export({ type: 'spki', format: 'pem' });
  } catch (e) {
    console.error('[auth] Failed to convert JWK to PEM:', e.message);
    return null;
  }
}

// ── Placeholder detection (static key path) ───────────────────────────────────
const PLACEHOLDER_KEYS = ['', '-----BEGIN PUBLIC KEY-----\\n...\\n-----END PUBLIC KEY-----'];

function isStaticKeyConfigured() {
  const key = (process.env.JWT_PUBLIC_KEY || '').trim();
  return !PLACEHOLDER_KEYS.includes(key) && key.includes('BEGIN PUBLIC KEY');
}

// ── Main middleware ───────────────────────────────────────────────────────────

/**
 * Extract JWT claims into a normalised req.user shape.
 * ZITADEL puts the tenant in `urn:zitadel:iam:org:id` or a custom claim.
 * We fall back to the `tenantId` claim for compatibility with the legacy static-key path.
 */
function buildUser(decoded, req) {
  // PRIORITY for tenantId:
  // 1. X-Tenant header (from gateway, most up-to-date)
  // 2. ZITADEL custom org claim (from JWT)
  // 3. tenantId claim (from JWT)
  // 4. Default to 'master' (dev fallback)
  let tenantId = 'master';
  if (req && req.headers['x-tenant']) {
    tenantId = req.headers['x-tenant'];
  } else {
    tenantId = decoded['urn:zitadel:iam:org:id'] || decoded['tenantId'] || 'master';
  }

  // Extract role: prioritize gateway header (X-User-Role), then JWT claim, then default
  let role = 'viewer';
  if (req && req.headers['x-user-role']) {
    role = req.headers['x-user-role'];
  } else if (decoded.role) {
    role = decoded.role;
  }

  return {
    sub: decoded.sub,
    userId: decoded.sub,
    tenantId: tenantId,
    email: decoded.email || decoded['preferred_username'] || '',
    role: role,
    attributes: decoded.attributes || {},
    raw: decoded,
  };
}

let _warned = false;

async function authMiddleware(req, res, next) {
  // 1. Dev bypass
  if (process.env.SKIP_AUTH === 'true') {
    req.user = { sub: 'dev-user', userId: 'dev-user', tenantId: 'master', role: 'admin', attributes: {} };
    return next();
  }

  const issuerUri = (process.env.ZITADEL_ISSUER_URI || '').trim();
  const projectId  = (process.env.ZITADEL_PROJECT_ID || '').trim();

  // 4. Neither ZITADEL nor static key → dev fallback
  if (!issuerUri && !isStaticKeyConfigured()) {
    if (!_warned) {
      console.warn('[auth] No ZITADEL_ISSUER_URI or JWT_PUBLIC_KEY configured — using dev fallback. DO NOT use in production.');
      _warned = true;
    }
    req.user = { sub: 'dev-user', userId: 'dev-user', tenantId: 'dev-tenant', role: 'admin', attributes: {} };
    return next();
  }

  // Extract Bearer token
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  const token = authHeader.slice(7);

  try {
    // 2. ZITADEL JWKS path
    if (issuerUri) {
      const jwks = await getJwks(issuerUri);

      // Peek at the token header to get the key ID
      const headerB64 = token.split('.')[0];
      const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
      const kid = header.kid;

      const pem = findPublicKey(jwks, kid);
      if (!pem) {
        console.error('[auth] No matching signing key for kid:', kid);
        return res.status(401).json({ error: 'Unable to find matching signing key' });
      }

      const verifyOptions = {
        algorithms: ['RS256'],
        issuer: issuerUri,
      };
      if (projectId) {
        verifyOptions.audience = projectId;
      }

      const decoded = jwt.verify(token, pem, verifyOptions);
      req.user = buildUser(decoded, req);
      return next();
    }

    // 3. Static public key path (legacy / non-ZITADEL deployments)
    const publicKey = process.env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });

    if (!decoded.tenantId) {
      return res.status(401).json({ error: 'JWT missing tenantId claim' });
    }

    req.user = buildUser(decoded, req);
    return next();

  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' || err.name === 'NotBeforeError') {
      return res.status(401).json({ error: 'Invalid or expired JWT', detail: err.message });
    }
    console.error('[auth] Unexpected error during JWT validation:', err.message);
    return res.status(503).json({ error: 'Unable to validate token' });
  }
}

module.exports = authMiddleware;
