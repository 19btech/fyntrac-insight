const mongoose = require('mongoose');

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

module.exports = mongoose.model('AuditLog', auditLogSchema);
