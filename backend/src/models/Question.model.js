const mongoose = require('mongoose');
const { registerSchema } = require('../services/tenant-db.service');

const questionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: String,
    tenantId: { type: String, required: true, index: true },
    type: { type: String, enum: ['builder', 'native'], default: 'native' },
    // For native type: the raw pipeline array
    queryConfig: mongoose.Schema.Types.Mixed,
    // Chart display configuration. Stored as Mixed so all keys (chartType,
    // xField, yFields, columnOrder, columnFormats, pivotConfig, goalLine, etc.)
    // are persisted without needing to enumerate every field in the schema.
    chartConfig: { type: mongoose.Schema.Types.Mixed, default: () => ({ chartType: 'table' }) },
    collectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collection' },
    sourceModelId: { type: mongoose.Schema.Types.ObjectId, ref: 'SavedModel' }, // v60: build on top of a saved model
    cacheTTL: { type: Number, default: 0 }, // v60: per-question cache override (seconds, 0=use default)
    verified: { type: Boolean, default: false }, // v60: verified content badge
    createdBy: String,
    pinned: { type: Boolean, default: false },
    archived: { type: Boolean, default: false, index: true },
    archivedAt: Date,
    publicShareToken: { type: String, index: true, sparse: true }, // v60: public question link
    versions: { type: [mongoose.Schema.Types.Mixed], default: [] }, // last 15 snapshots
  },
  { timestamps: true }
);

// Indexes for lineage lookups (GET /models/:id/lineage) and list sorts.
questionSchema.index({ tenantId: 1, 'queryConfig.modelId': 1 });
questionSchema.index({ tenantId: 1, 'queryConfig.collection': 1 });

// Register schema for per-tenant connection model compilation
registerSchema('Question', questionSchema);

// Global model (dev/SKIP_AUTH fallback — real traffic uses tenant-db.service getModel)
module.exports = mongoose.model('Question', questionSchema);
module.exports.schema = questionSchema;
