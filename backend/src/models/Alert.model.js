const mongoose = require('mongoose');

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

module.exports = mongoose.model('Alert', alertSchema);
