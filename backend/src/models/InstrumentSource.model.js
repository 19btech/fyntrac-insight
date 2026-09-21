const mongoose = require('mongoose');
const { registerSchema } = require('../services/tenant-db.service');

/**
 * A dataset or report registered to appear in the Instrument Browser.
 *
 * The browser narrows each source to one instrument and one period, so a
 * source has to declare which of its output columns carries the instrument id
 * and which carries the period. Those names differ per dataset/report, which
 * is why they are stored here rather than inferred at query time.
 *
 * A source is filtered by EITHER a posting date OR an accounting period —
 * never both. `dateMode` records which, and `dateField` the column it lives in.
 */
const instrumentSourceSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },

    // Which registry the source lives in: 'dataset' -> SavedModel,
    // 'report' -> Question.
    sourceType: { type: String, enum: ['dataset', 'report'], required: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },

    // Display name override. Blank means "use the dataset/report's own name",
    // so renaming the source upstream flows through automatically.
    label: { type: String, default: '' },

    instrumentField: { type: String, required: true },

    // 'postingDate'      — dateField holds a calendar date
    // 'accountingPeriod' — dateField holds a period (202607) or a period date
    // 'none'             — the source has no time dimension at all (e.g. current
    //                      open attribute records, one row per product). It is
    //                      browsed by instrument only and ignores the period
    //                      control entirely.
    dateMode: {
      type: String,
      enum: ['postingDate', 'accountingPeriod', 'none'],
      required: true,
      default: 'postingDate',
    },
    // Empty when dateMode is 'none'.
    dateField: { type: String, default: '' },

    // BSON type of dateField as detected when the source was registered.
    // Used to build an index-friendly match (a range over real Dates, or an
    // equality on a numeric period) instead of a catch-all $expr, which cannot
    // use an index and is evaluated per document.
    dateFieldType: { type: String, enum: ['date', 'isoDate', 'string', 'number', 'unknown'], default: 'unknown' },
    instrumentFieldType: { type: String, enum: ['string', 'number', 'unknown'], default: 'unknown' },

    // Hidden from the browser without being deleted (keeps field mappings).
    enabled: { type: Boolean, default: true },

    // Position in the browser's source rail.
    order: { type: Number, default: 0 },

    createdBy: String,
  },
  { timestamps: true }
);

// Default list sort.
instrumentSourceSchema.index({ tenantId: 1, order: 1 });
// A dataset/report can only be registered once per tenant.
instrumentSourceSchema.index({ tenantId: 1, sourceType: 1, sourceId: 1 }, { unique: true });

// Register schema for per-tenant connection model compilation
registerSchema('InstrumentSource', instrumentSourceSchema);

// Global model (dev/SKIP_AUTH fallback — real traffic uses tenant-db.service getModel)
module.exports = mongoose.model('InstrumentSource', instrumentSourceSchema);
module.exports.schema = instrumentSourceSchema;
