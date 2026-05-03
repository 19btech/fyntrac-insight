const mongoose = require('mongoose');

/**
 * A "Saved Model" is a named, reusable aggregation pipeline acting as a virtual collection.
 * When used in another query, the model's pipeline is prepended before the user's pipeline.
 */
const modelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: String,
    tenantId: { type: String, required: true, index: true },
    sourceCollection: { type: String, required: true },
    pipeline: { type: [mongoose.Schema.Types.Mixed], required: true, default: [] },
    // Visual step-stack used by the dataset editor (Phase B). When present
    // it is the source of truth and `pipeline` is regenerated from it on save.
    steps: { type: [mongoose.Schema.Types.Mixed], default: [] },
    // Persisted user-defined column order for the dataset preview / consumers.
    // Names not in this array are appended in their natural pipeline order so
    // schema additions don't get hidden.
    columnOrder: { type: [String], default: [] },
    verified: { type: Boolean, default: false }, // certified-by-finance badge
    pinned: { type: Boolean, default: false },
    createdBy: String,
    archived: { type: Boolean, default: false, index: true },
    archivedAt: Date,
    // Append-only history of prior states. Capped to the last 20 snapshots
    // (oldest dropped) to avoid unbounded growth.
    versions: {
      type: [{
        version: Number,
        snapshot: mongoose.Schema.Types.Mixed,
        note: String,
        createdBy: String,
        createdAt: { type: Date, default: Date.now },
      }],
      default: [],
    },
  },
  { timestamps: true }
);

modelSchema.index({ tenantId: 1, name: 1 });
// Covers the default list sort: pinned DESC, updatedAt DESC, excluding archived.
modelSchema.index({ tenantId: 1, archived: 1, pinned: -1, updatedAt: -1 });

module.exports = mongoose.model('SavedModel', modelSchema);
