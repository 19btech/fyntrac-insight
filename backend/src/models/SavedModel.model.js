const mongoose = require('mongoose');
const { registerSchema } = require('../services/tenant-db.service');

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
    // How this dataset is defined:
    //   'steps'      — the visual step stack above (default, MongoDB pipeline)
    //   'savedQuery' — a saved Prism (SQL) query; preview/output come from SQL
    // Only one mode is active at a time; the other's config is retained so the
    // user can switch back without losing work.
    sourceMode: { type: String, enum: ['steps', 'savedQuery'], default: 'steps' },
    savedQueryId: { type: mongoose.Schema.Types.ObjectId, ref: 'SavedQuery', default: null },
    savedQuerySql: { type: String, default: '' }, // snapshot so the dataset survives query edits/deletes
    savedQueryName: { type: String, default: '' },
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

// Register schema for per-tenant connection model compilation
registerSchema('SavedModel', modelSchema);

// Global model (dev/SKIP_AUTH fallback — real traffic uses tenant-db.service getModel)
module.exports = mongoose.model('SavedModel', modelSchema);
module.exports.schema = modelSchema;
