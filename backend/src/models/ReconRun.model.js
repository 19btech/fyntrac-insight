const mongoose = require('mongoose');

/**
 * One execution of a Recon. Stores summary + paginated row results inline
 * (recon results are typically small enough; if they grow we can move
 * `rows` into a dedicated collection later).
 *
 * `mappingSnapshot` is the *exact* mapping JSON used at run-time so old runs
 * stay reproducible even if the parent Recon's mapping is later edited.
 */
const reconRunSchema = new mongoose.Schema({
  reconId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recon', required: true },
  tenantId: { type: String, required: true },
  runAt: { type: Date, default: Date.now },
  runBy: String,
  durationMs: Number,
  error: String,
  mappingSnapshot: mongoose.Schema.Types.Mixed,
  optionsSnapshot: mongoose.Schema.Types.Mixed,
  summary: {
    rowCounts: {
      a: Number, b: Number,
      matched: Number, mismatched: Number,
      onlyA: Number, onlyB: Number,
      // New buckets — backwards-compatible: existing runs return undefined
      // and the UI treats them as zero.
      immaterial: { type: Number, default: 0 },
      persistent: { type: Number, default: 0 },
    },
    totals: mongoose.Schema.Types.Mixed, // per-measure: { sumA, sumB, diff }
    matchRate: Number, // matched / (matched + mismatched + onlyA + onlyB)
    coverageA: Number, // matched / a
    coverageB: Number, // matched / b
    // Number of mismatched keys present in *this* run that were NOT present
    // in the immediately-previous run. Drives the "NEW" badge.
    newBreaksVsPrior: { type: Number, default: 0 },
    previousRunId: String,
  },
  // Each row: { status, key, a:{...measures}, b:{...measures}, deltas:{...},
  //            attrIssues:[…], age?, category?, note?, noteBy?, noteAt? }
  // Capped at MAX_STORED_ROWS (50 000) to stay under MongoDB's 16 MB BSON limit.
  rows: { type: [mongoose.Schema.Types.Mixed], default: [] },
  totalRows: Number,          // actual full result count before any cap
  rowsTruncated: { type: Boolean, default: false }, // true when rows were capped
  // Sign-off / certification — set when a reviewer locks the run.
  signOff: {
    certified: { type: Boolean, default: false },
    by: String,
    at: Date,
    note: String,
  },
}, { timestamps: true });

// Compound index for efficient per-recon history queries
reconRunSchema.index({ reconId: 1, tenantId: 1, runAt: -1 });

module.exports = mongoose.model('ReconRun', reconRunSchema);
