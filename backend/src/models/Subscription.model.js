const mongoose = require('mongoose');

/**
 * Dashboard subscription — Metabase "Pulse"-style scheduled email of a dashboard
 * (rendered as PDF/HTML link). Cron string drives the alert scheduler.
 */
const subscriptionSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    dashboardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dashboard', required: true },
    cron: { type: String, required: true }, // e.g. "0 9 * * 1" Monday 9am
    recipients: { type: [String], required: true }, // email addresses
    subject: String,
    enabled: { type: Boolean, default: true },
    createdBy: String,
    lastSentAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Subscription', subscriptionSchema);
