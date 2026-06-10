const mongoose = require('mongoose');
const { registerSchema } = require('../services/tenant-db.service');

/**
 * An async CSV export job produced from the SQL Lab. The query runs in the
 * background; DuckDB streams the full result to a file under `exports/`. The
 * Downloads panel polls the list and offers the file once `status === 'ready'`.
 */
const sqlExportSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    userId: { type: String, index: true },
    sql: { type: String, required: true },
    fileName: { type: String, required: true }, // user-facing download name
    storedName: { type: String, required: true }, // actual file on disk
    status: {
      type: String,
      enum: ['pending', 'running', 'ready', 'failed'],
      default: 'pending',
      index: true,
    },
    estimatedRows: { type: Number, default: null },
    rowCount: { type: Number, default: null },
    fileSize: { type: Number, default: null }, // bytes
    error: { type: String, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

sqlExportSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });

// Register schema for per-tenant connection model compilation
registerSchema('SqlExport', sqlExportSchema);

module.exports = mongoose.model('SqlExport', sqlExportSchema);
