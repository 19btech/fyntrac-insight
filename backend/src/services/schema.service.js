const mongoService = require('./mongo.service');

/**
 * Return all collections available for a tenant.
 */
async function listCollections() {
  return mongoService.getCollections();
}

/**
 * Introspect field types for a single collection scoped to the tenant.
 */
async function getCollectionFields(collectionName, user) {
  return mongoService.inferSchema(collectionName, user);
}

module.exports = { listCollections, getCollectionFields };
