const NodeCache = require('node-cache');
const crypto = require('crypto');

const DEFAULT_TTL = parseInt(process.env.CACHE_TTL_SECONDS || '300', 10);

/**
 * Build a deterministic cache key from tenant + collection + pipeline + variables.
 */
function buildCacheKey(tenantId, collectionName, pipeline, variables) {
  const raw = `${tenantId}:${collectionName}:${JSON.stringify(pipeline)}:${JSON.stringify(variables || {})}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// ── Redis adapter (used when REDIS_URL is set) ────────────────────────────────
function makeRedisAdapter(redisUrl) {
  // Dynamic require so the service still starts when ioredis is not installed.
  // eslint-disable-next-line global-require
  const Redis = require('ioredis');
  const client = new Redis(redisUrl, { lazyConnect: false, enableReadyCheck: true });
  client.on('error', (err) => console.error('[cache] Redis error:', err.message));
  return {
    async get(key) {
      try {
        const raw = await client.get(key);
        return raw ? JSON.parse(raw) : undefined;
      } catch { return undefined; }
    },
    async set(key, value, ttl) {
      const seconds = ttl !== undefined ? ttl : DEFAULT_TTL;
      try { await client.set(key, JSON.stringify(value), 'EX', seconds); } catch { /* non-fatal */ }
    },
    async del(key) { try { await client.del(key); } catch { /* swallow */ } },
    async flush() { try { await client.flushdb(); } catch { /* swallow */ } },
  };
}

// ── NodeCache adapter (default) ───────────────────────────────────────────────
function makeNodeCacheAdapter() {
  const cache = new NodeCache({ stdTTL: DEFAULT_TTL, checkperiod: 60, useClones: false });
  return {
    async get(key) { return cache.get(key); },
    async set(key, value, ttl) {
      if (ttl !== undefined) cache.set(key, value, ttl);
      else cache.set(key, value);
    },
    async del(key) { cache.del(key); },
    async flush() { cache.flushAll(); },
  };
}

// ── Select adapter ────────────────────────────────────────────────────────────
const adapter = process.env.REDIS_URL
  ? makeRedisAdapter(process.env.REDIS_URL)
  : makeNodeCacheAdapter();

module.exports = {
  buildCacheKey,
  get: (key) => adapter.get(key),
  set: (key, value, ttl) => adapter.set(key, value, ttl),
  del: (key) => adapter.del(key),
  flush: () => adapter.flush(),
};
