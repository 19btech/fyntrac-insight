'use strict';

/**
 * Tenant → database-name resolution.
 *
 * MongoDB database names are CASE-SENSITIVE: `Hearst_SandBox` and
 * `HEARST_SANDBOX` are two different databases, and `client.connect()` never
 * fails on a missing one (Mongo creates databases lazily), so getting the case
 * wrong looks like a healthy connection to an empty database.
 *
 * The tenant name is therefore used VERBATIM as the database name — whatever
 * casing the gateway sends in `X-Tenant` is what we open.
 *
 * The registry below exists for callers that only carry the normalised
 * (upper-case) logical `tenantId` rather than the original header value —
 * public share links and signed embed tokens. Every authenticated request
 * registers its verbatim tenant name, so those callers can map
 * `HEARST_SANDBOX` back to `Hearst_SandBox`. Until a tenant has been seen at
 * least once in the process, they fall back to the name as given.
 */

/** @type {Map<string, string>} UPPER-CASED name → verbatim name */
const _verbatimNames = new Map();

/** Record the verbatim tenant name as received from the gateway. */
function rememberTenantName(tenant) {
  const raw = String(tenant || '').trim();
  if (!raw) return raw;
  const key = raw.toUpperCase();
  // Never let an all-caps value (e.g. a normalised JWT claim) overwrite a
  // mixed-case name the gateway already gave us for the same tenant.
  const known = _verbatimNames.get(key);
  if (known && raw === key && known !== key) return known;
  _verbatimNames.set(key, raw);
  return raw;
}

/**
 * Resolve a tenant identifier to the database name to open.
 * Returns the verbatim name when this tenant has been seen before, otherwise
 * the name exactly as given.
 */
function resolveTenantName(tenant) {
  const raw = String(tenant || '').trim() || 'master';
  return _verbatimNames.get(raw.toUpperCase()) || raw;
}

/** Normalised, case-stable logical id used for `tenantId` fields and cache keys. */
function normalizeTenantId(tenant) {
  return (String(tenant || '').trim() || 'master').toUpperCase();
}

module.exports = { rememberTenantName, resolveTenantName, normalizeTenantId };
