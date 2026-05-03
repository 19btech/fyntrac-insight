const mongoose = require('mongoose');
const { registerSchema } = require('../services/tenant-db.service');

const collectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: String,
    tenantId: { type: String, required: true, index: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collection', default: null },
    createdBy: String,
    color: { type: String, default: '#509ee3' },
    icon: { type: String, default: 'folder' },
  },
  { timestamps: true }
);

// Register schema for per-tenant connection model compilation
registerSchema('Collection', collectionSchema);

// Global model (dev/SKIP_AUTH fallback — real traffic uses tenant-db.service getModel)
module.exports = mongoose.model('Collection', collectionSchema);
module.exports.schema = collectionSchema;
