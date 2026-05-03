const mongoose = require('mongoose');

/**
 * Per-user bookmarks/favorites for any entity type (Metabase v60 bookmarks).
 */
const bookmarkSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    itemType: { type: String, enum: ['dashboard', 'question', 'model', 'metric', 'collection'], required: true },
    itemId: { type: String, required: true },
    name: String, // denormalized for fast list rendering
  },
  { timestamps: true }
);

bookmarkSchema.index({ tenantId: 1, userId: 1, itemType: 1, itemId: 1 }, { unique: true });

module.exports = mongoose.model('Bookmark', bookmarkSchema);
