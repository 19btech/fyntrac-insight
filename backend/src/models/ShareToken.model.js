const mongoose = require('mongoose');

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

module.exports = mongoose.model('ShareToken', shareTokenSchema);
