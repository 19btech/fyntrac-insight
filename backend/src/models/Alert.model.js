const mongoose = require('mongoose');
const { registerSchema } = require('../services/tenant-db.service');

const alertSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    name: { type: String, required: true },
    condition: {
      operator: {
        type: String,
        enum: ['gt', 'lt', 'eq', 'change_pct'],
        required: true,
      },
      threshold: { type: Number, required: true },
    },
    frequency: { type: String, default: '0 * * * *' }, // cron expression
    recipients: [{ type: String }], // email addresses
    enabled: { type: Boolean, default: true },
    lastFiredAt: Date,
    createdBy: String,
  },
  { timestamps: true }
);

// Register schema for per-tenant connection model compilation
registerSchema('Alert', alertSchema);

// Global model (dev/SKIP_AUTH fallback — real traffic uses tenant-db.service getModel)
module.exports = mongoose.model('Alert', alertSchema);
module.exports.schema = alertSchema;
