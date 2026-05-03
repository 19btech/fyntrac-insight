const mongoose = require('mongoose');
const { registerSchema } = require('../services/tenant-db.service');

const auditLogSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    userId: String,
    action: { type: String, required: true }, // e.g. 'query.run', 'dashboard.view', 'question.save'
    resourceId: String,
    resourceType: String, // 'dashboard' | 'question' | 'collection'
    executionTimeMs: Number,
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

auditLogSchema.index({ tenantId: 1, createdAt: -1 });

// Register schema for per-tenant connection model compilation
registerSchema('AuditLog', auditLogSchema);

// Global model (dev/SKIP_AUTH fallback — real traffic uses tenant-db.service getModel)
module.exports = mongoose.model('AuditLog', auditLogSchema);
module.exports.schema = auditLogSchema;
