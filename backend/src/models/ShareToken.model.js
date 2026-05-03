const mongoose = require('mongoose');
const { registerSchema } = require('../services/tenant-db.service');

const shareTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true },
    tenantId: { type: String, required: true },
    dashboardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dashboard', required: true },
    expiresAt: Date,
    createdBy: String,
  },
  { timestamps: true }
);

// Register schema for per-tenant connection model compilation
registerSchema('ShareToken', shareTokenSchema);

// Global model (dev/SKIP_AUTH fallback — real traffic uses tenant-db.service getModel)
module.exports = mongoose.model('ShareToken', shareTokenSchema);
module.exports.schema = shareTokenSchema;
