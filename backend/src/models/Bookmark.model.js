const mongoose = require('mongoose');
const { registerSchema } = require('../services/tenant-db.service');

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

// Register schema for per-tenant connection model compilation
registerSchema('Bookmark', bookmarkSchema);

// Global model (dev/SKIP_AUTH fallback — real traffic uses tenant-db.service getModel)
module.exports = mongoose.model('Bookmark', bookmarkSchema);
module.exports.schema = bookmarkSchema;
