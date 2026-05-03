const mongoose = require('mongoose');
const { registerSchema } = require('../services/tenant-db.service');

/**
 * Recon — saved reconciliation configuration.
 * Sides A and B can each be a Dataset (SavedModel) or an uploaded CSV file.
 *
 * Mapping bridges two potentially different shapes:
 *   - keys[]       : columns that identify the "same row" on both sides
 *                    (composite supported). Optional per-column transforms
 *                    (trim/upper/stripNonAlnum/date:fmt) clean values
 *                    before they form the join key.
 *   - measures[]   : numeric columns to compare with abs+pct tolerance.
 *   - attributes[] : extra columns compared for equality only (e.g. currency).
 *
 * options:
 *   - aggregateBeforeMatch : group both sides by key first (handles 1:N totals).
 *   - fuzzyKey             : opt-in token-set fuzzy match for unmatched rows.
 *   - dateGranularity      : day | month | quarter | year
 *   - caseSensitive        : exact-string compare (default false).
 */
const sideSchema = new mongoose.Schema({
  kind: { type: String, enum: ['dataset', 'csv'], required: true },
  refId: { type: String, required: true }, // SavedModel _id or ReconCsvFile _id
  displayName: String,
}, { _id: false });

const colMapSchema = new mongoose.Schema({
  a: { type: String, required: true },
  b: { type: String, required: true },
  transform: { type: String, default: '' }, // "trim", "upper", "stripNonAlnum", "date:YYYY-MM"
  tolerance: {
    abs: { type: Number, default: 0.01 },
    pct: { type: Number, default: 0.001 },
  },
}, { _id: false });

const reconSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  tenantId: { type: String, required: true, index: true },
  sourceA: { type: sideSchema, required: true },
  sourceB: { type: sideSchema, required: true },
  mapping: {
    keys: { type: [colMapSchema], default: [] },
    measures: { type: [colMapSchema], default: [] },
    attributes: { type: [colMapSchema], default: [] },
  },
  options: {
    aggregateBeforeMatch: { type: Boolean, default: true },
    fuzzyKey: { type: Boolean, default: false },
    dateGranularity: { type: String, enum: ['day', 'month', 'quarter', 'year'], default: 'day' },
    caseSensitive: { type: Boolean, default: false },
    // Materiality threshold — mismatches whose largest measure delta is within
    // BOTH abs and pct are demoted to an "immaterial" bucket and excluded from
    // the headline mismatched count. abs=0 AND pct=0 disables this.
    materiality: {
      abs: { type: Number, default: 0 },
      pct: { type: Number, default: 0 },
    },
    // Currency normalisation — when enabled, every measure is multiplied by
    // fxRates[ row[currencyFieldX] ] before tolerance comparison so that
    // EUR/GBP/USD lines collapse into the base currency.
    currency: {
      enabled: { type: Boolean, default: false },
      baseCurrency: { type: String, default: 'USD' },
      currencyFieldA: { type: String, default: '' },
      currencyFieldB: { type: String, default: '' },
      fxRates: { type: Map, of: Number, default: () => new Map() },
    },
  },
  // Free-text note that stays pinned to the side rail (e.g. "Always confirm
  // 30-Sep totals against the Bloomberg PDF before signing off").
  pinnedNote: { type: String, default: '' },
  schedule: {
    enabled: { type: Boolean, default: false },
    cron: String,
    recipients: { type: [String], default: [] },
    alertWhenMismatchOver: Number,
    lastSentAt: Date,
  },
  lastRun: {
    at: Date,
    runId: String,
    summary: mongoose.Schema.Types.Mixed,
  },
  createdBy: String,
  archived: { type: Boolean, default: false, index: true },
  archivedAt: Date,
}, { timestamps: true });

reconSchema.index({ tenantId: 1, name: 1 });

// Register schema for per-tenant connection model compilation
registerSchema('Recon', reconSchema);

// Global model (dev/SKIP_AUTH fallback — real traffic uses tenant-db.service getModel)
module.exports = mongoose.model('Recon', reconSchema);
module.exports.schema = reconSchema;
