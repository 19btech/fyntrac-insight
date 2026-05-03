const mongoose = require('mongoose');

/**
 * Uploaded CSV stored as raw text + a sample of parsed rows so the recon
 * engine can rerun without re-uploading. Tenant-scoped.
 *
 * For very large files we'd switch to GridFS / S3, but for finance recon
 * inputs (typically <50k rows) inline storage is fine.
 */
const reconCsvSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  filename: String,
  uploadedBy: String,
  sizeBytes: Number,
  rowCount: Number,
  columns: { type: [String], default: [] },
  inferredTypes: mongoose.Schema.Types.Mixed, // { col: 'string'|'number'|'date'|... }
  raw: String, // full CSV text
  sampleRows: { type: [mongoose.Schema.Types.Mixed], default: [] }, // first 50 parsed rows for preview
  // All parsed rows stored at upload time so the engine can rerun without re-parsing raw text.
  // Omitted for backward-compatibility with older uploads; engine falls back to re-parsing raw.
  parsedRows: { type: [mongoose.Schema.Types.Mixed] },
}, { timestamps: true });

module.exports = mongoose.model('ReconCsvFile', reconCsvSchema);
