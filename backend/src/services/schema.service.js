const mongoService = require('./mongo.service');

/**
 * Return all collections available for a tenant.
 * @param {object} user - req.user (needed for tenant routing)
 */
async function listCollections(user) {
  return mongoService.getCollections(user);
}

/**
 * Introspect field types for a single collection scoped to the tenant.
 */
async function getCollectionFields(collectionName, user) {
  return mongoService.inferSchema(collectionName, user);
}

module.exports = { listCollections, getCollectionFields };
