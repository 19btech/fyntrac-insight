const mongoose = require('mongoose');

/**
 * Comments / @mentions on dashboards or questions (Metabase v60).
 * mentions: array of userIds the comment @-mentions; alert.service can email them.
 */
const commentSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    itemType: { type: String, enum: ['dashboard', 'question'], required: true },
    itemId: { type: String, required: true, index: true },
    body: { type: String, required: true },
    authorId: String,
    authorName: String,
    mentions: { type: [String], default: [] },
    resolved: { type: Boolean, default: false },
  },
  { timestamps: true }
);

commentSchema.index({ tenantId: 1, itemType: 1, itemId: 1 });

module.exports = mongoose.model('Comment', commentSchema);
