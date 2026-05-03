const mongoose = require('mongoose');
const { registerSchema } = require('../services/tenant-db.service');

/**
 * KPI / Metric.
 *
 * Two flavors:
 *  - Legacy: pre-built `pipeline` (raw MongoDB aggregation) returning a `value` field.
 *  - Structured `definition` (preferred): the backend compiles to a pipeline.
 *      definition: {
 *        source:      { kind: 'collection'|'dataset'|'question', id?, name? },
 *        filters:     [{ field, operator, value } | savedFilterDef],   // top-level filters applied to whole KPI
 *        numerator:   { agg, field, filters: [{...}] },
 *        denominator: { agg, field, filters: [...] },   // optional → ratio
 *        timeField,
 *        comparison:  'none'|'lastPeriod'|'lastYear'|'budget',
 *      }
 *  - format:  { kind: 'number'|'currency'|'percent', decimals, compact, negatives, prefix, suffix }
 *  - targets: { value, direction: 'higherBetter'|'lowerBetter', bands: [{ to, color }] }
 */
const metricSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: String,
    tenantId: { type: String, required: true, index: true },
    // Underlying MongoDB collection name. For dataset/question sources this
    // is the *underlying* collection that the source pipeline runs against.
    collection: { type: String, required: true },
    // New (v62): describes where the KPI pulls rows from. When kind is
    // 'dataset' or 'question' the linked pipeline is prepended before the
    // KPI aggregation runs. Falls back to the bare `collection` for legacy
    // KPIs created before this field existed.
    source: {
      kind: { type: String, enum: ['collection', 'dataset', 'question'], default: 'collection' },
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
      name: { type: String, default: '' },
    },
    pipeline: { type: [mongoose.Schema.Types.Mixed], default: [] },
    definition: { type: mongoose.Schema.Types.Mixed, default: null },
    format: { type: mongoose.Schema.Types.Mixed, default: null },
    targets: { type: mongoose.Schema.Types.Mixed, default: null },

    // Legacy display fields (still honoured if `format` is null)
    displayFormat: { type: String, default: 'number' },
    prefix: String,
    suffix: String,
    goalValue: Number,
    trend: {
      enabled: { type: Boolean, default: false },
      comparisonPipeline: [mongoose.Schema.Types.Mixed],
    },

    verified: { type: Boolean, default: false },
    createdBy: String,
    archived: { type: Boolean, default: false, index: true },
    archivedAt: Date,
  },
  { timestamps: true, suppressReservedKeysWarning: true }
);

// Compound index for the common list + eval query patterns.
metricSchema.index({ tenantId: 1, archived: 1, updatedAt: -1 });

// Register schema for per-tenant connection model compilation
registerSchema('Metric', metricSchema);

// Global model (dev/SKIP_AUTH fallback — real traffic uses tenant-db.service getModel)
module.exports = mongoose.model('Metric', metricSchema);
module.exports.schema = metricSchema;

// ─── Recommended source-collection indexes (run once in MongoDB shell) ──────
//
// KPI period detection uses $sort + $limit which requires a descending index
// on the periodField in your source collections. Without an index these queries
// perform a full collection scan — catastrophic at millions of rows.
//
// Add indexes for every field your KPIs use as "Period field":
//   db.Transactions.createIndex({ accountingPeriodId: -1 })
//   db.Transactions.createIndex({ postingDate: -1 })
//   db.TransactionActivity.createIndex({ accountingPeriodId: -1 })
//   db.GeneralLedgerEnteryStage.createIndex({ accountingPeriodId: -1 })
//
// Also add a compound (tenantId, periodField) index for multi-tenant collections
// where tenantId is stored in the document (not handled by mongoService tenant
// isolation automatically):
//   db.Transactions.createIndex({ tenantId: 1, accountingPeriodId: -1 })
