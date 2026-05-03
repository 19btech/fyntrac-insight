const mongoose = require('mongoose');

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

module.exports = mongoose.model('Collection', collectionSchema);
