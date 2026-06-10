const mongoose = require('mongoose');
const { registerSchema } = require('../services/tenant-db.service');

/**
 * A named, reusable SQL Lab query. Scoped per tenant + user (each user manages
 * their own saved worksheets, like Snowflake). Stores the raw SQL text so it
 * can be reopened into a worksheet tab on any device.
 */
const savedQuerySchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    userId: { type: String, index: true },
    name: { type: String, required: true },
    sql: { type: String, required: true },
    createdBy: String,
  },
  { timestamps: true }
);

savedQuerySchema.index({ tenantId: 1, userId: 1, updatedAt: -1 });

// Register schema for per-tenant connection model compilation
registerSchema('SavedQuery', savedQuerySchema);

module.exports = mongoose.model('SavedQuery', savedQuerySchema);
