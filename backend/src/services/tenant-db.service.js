'use strict';

/**
 * Tenant-scoped Mongoose connection manager for fyntrac-insight.
 *
 * Mirrors the DSL Studio pattern:
 *   X-Tenant: master  →  database: FYNTRAC_INSIGHT_MASTER
 *   X-Tenant: acme    →  database: FYNTRAC_INSIGHT_ACME
 *
 * Each tenant gets a dedicated Mongoose connection (cached for the lifetime
 * of the process). The middleware attaches the correct connection to
 * `req.tenantConn` so routes can call `getModel(req, 'Dashboard')` to obtain
 * a Mongoose Model bound to the right database.
 *
 * Usage in routes:
 *   const { getModel } = require('../services/tenant-db.service');
 *   const dashboards = await getModel(req, 'Dashboard').find({ tenantId: req.user.tenantId });
 */

const mongoose = require('mongoose');

// ── Config ────────────────────────────────────────────────────────────────────
const DB_PREFIX = 'FYNTRAC_INSIGHT_';
const MONGO_BASE_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fyntrac_analytics_meta';

/**
 * Strip the database name from the URI so we can substitute our own.
 * e.g. mongodb://host:27017/some_db → mongodb://host:27017
 */
function getBaseUri() {
  try {
    const url = new URL(MONGO_BASE_URI);
    url.pathname = '/';
    url.search = '';
    // Preserve query string (auth params, replica set, etc.)
    const raw = MONGO_BASE_URI;
    const qIdx = raw.indexOf('?');
    if (qIdx !== -1) url.search = raw.slice(qIdx);
    return url.toString();
  } catch {
    // Fallback: strip everything after the last slash before '?'
    return MONGO_BASE_URI.replace(/\/[^/?]+(\?|$)/, '/$1');
  }
}

// ── Per-tenant connection cache ───────────────────────────────────────────────
/** @type {Map<string, mongoose.Connection>} */
const _connCache = new Map();

/**
 * Return (or lazily create) a Mongoose connection for the given tenant.
 * The database name is `FYNTRAC_INSIGHT_<TENANT_UPPER>`.
 */
async function getTenantConnection(tenant) {
  const key = (tenant || 'MASTER').toUpperCase();
  if (_connCache.has(key)) return _connCache.get(key);

  const dbName = `${DB_PREFIX}${key}`;
  const baseUri = getBaseUri();
  // Remove trailing slash before appending db name
  const uri = `${baseUri.replace(/\/$/, '')}/${dbName}`;

  console.log(`[tenant-db] Creating Mongoose connection for tenant '${key}' → ${dbName}`);

  const conn = mongoose.createConnection(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
  });

  // Wait for the connection to be established before caching
  await conn.asPromise();

  _connCache.set(key, conn);
  return conn;
}

// ── Model registry ────────────────────────────────────────────────────────────
// Maps model name → schema factory function.
// Schemas are registered by calling `registerSchema(name, schema)`.
/** @type {Map<string, mongoose.Schema>} */
const _schemas = new Map();

/**
 * Register a Mongoose schema under a given model name.
 * Call this once per model (e.g. in model files) instead of `mongoose.model()`.
 */
function registerSchema(name, schema) {
  _schemas.set(name, schema);
}

/**
 * Obtain a Mongoose Model bound to the requesting tenant's connection.
 * Falls back to the default `mongoose` connection if tenant conn not yet set.
 *
 * @param {express.Request} req
 * @param {string} modelName  e.g. 'Dashboard'
 * @returns {mongoose.Model}
 */
function getModel(req, modelName) {
  const conn = req.tenantConn;
  if (!conn) {
    // Dev fallback: use default mongoose connection
    return mongoose.model(modelName);
  }
  // Re-use already-compiled model on this connection, or compile fresh.
  if (conn.models[modelName]) return conn.models[modelName];
  const schema = _schemas.get(modelName);
  if (!schema) {
    throw new Error(`[tenant-db] Schema '${modelName}' not registered. Call registerSchema() in the model file.`);
  }
  return conn.model(modelName, schema);
}

// ── Middleware ────────────────────────────────────────────────────────────────
/**
 * Express middleware that resolves the tenant-scoped Mongoose connection and
 * attaches it to `req.tenantConn`. Must run AFTER authMiddleware.
 *
 * Tenant is resolved in priority order:
 *   1. X-Tenant request header  (set by the API gateway)
 *   2. req.user.tenantId        (extracted from the JWT by authMiddleware)
 *   3. 'master'                 (default fallback)
 */
async function tenantDbMiddleware(req, res, next) {
  const tenant =
    req.headers['x-tenant'] ||
    (req.user && req.user.tenantId) ||
    'master';

  try {
    req.tenantConn = await getTenantConnection(tenant);
    req.tenantId = (tenant || 'master').toUpperCase();
    // Convenience helper: req.model('Dashboard') → tenant-scoped Mongoose model
    req.model = (modelName) => getModel(req, modelName);
    next();
  } catch (err) {
    console.error('[tenant-db] Failed to get tenant connection:', err.message);
    res.status(503).json({ error: 'Database connection unavailable for this tenant' });
  }
}

module.exports = { getTenantConnection, registerSchema, getModel, tenantDbMiddleware, DB_PREFIX };
