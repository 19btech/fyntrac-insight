const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const duckdbService = require('./duckdb.service');

const EXPORT_DIR = path.join(__dirname, '..', '..', 'exports');

// Keep only the most recent N exports per user; older ones (records + files)
// are pruned automatically.
const MAX_EXPORTS = 25;

function getSqlExportModel(user) {
  if (user && typeof user.getModel === 'function') {
    return user.getModel('SqlExport');
  }
  const mongoose = require('mongoose');
  return mongoose.model('SqlExport');
}

function ensureExportDir() {
  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

function buildFileName() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `sql-export-${ts}.csv`;
}

/**
 * Create an export job and kick off the background CSV generation. Returns the
 * job document immediately (status: pending) so the UI can show it as
 * "Generating…" while DuckDB writes the file.
 */
async function createExport({ sql, user, estimatedRows }) {
  ensureExportDir();
  const storedName = `${randomUUID()}.csv`;
  const SqlExportModel = getSqlExportModel(user);
  const job = await SqlExportModel.create({
    tenantId: user.tenantId,
    userId: user.userId,
    sql,
    fileName: buildFileName(),
    storedName,
    status: 'pending',
    estimatedRows: estimatedRows ?? null,
  });

  // Fire-and-forget — do not block the request on the (possibly long) export.
  runExportJob(job._id, sql, user).catch((err) => {
    // runExportJob already records failures; this guards against unexpected throws.
    console.error('[sql-export] unhandled job error', err);
  });

  // Trim to the most recent MAX_EXPORTS (best-effort, non-blocking).
  pruneExports(user).catch(() => {});

  return job;
}

/** Delete every export beyond the most recent MAX_EXPORTS (records + files). */
async function pruneExports(user) {
  const SqlExportModel = getSqlExportModel(user);
  const stale = await SqlExportModel.find({ tenantId: user.tenantId, userId: user.userId })
    .sort({ createdAt: -1 })
    .skip(MAX_EXPORTS)
    .select('_id storedName')
    .lean();
  if (!stale.length) return;
  await Promise.all(
    stale.map((j) => fs.promises.unlink(path.join(EXPORT_DIR, j.storedName)).catch(() => {}))
  );
  await SqlExportModel.deleteMany({ _id: { $in: stale.map((j) => j._id) } });
}

async function runExportJob(jobId, sql, user) {
  const SqlExportModel = getSqlExportModel(user);
  const jobDoc = await SqlExportModel.findById(jobId);
  if (!jobDoc) return;
  const filePath = path.join(EXPORT_DIR, jobDoc.storedName);
  try {
    await SqlExportModel.findByIdAndUpdate(jobId, { status: 'running' });
    const { rowCount } = await duckdbService.exportToCsv({ sql, user, filePath });
    let fileSize = null;
    try {
      fileSize = (await fs.promises.stat(filePath)).size;
    } catch {
      /* stat best-effort */
    }
    await SqlExportModel.findByIdAndUpdate(jobId, {
      status: 'ready',
      rowCount,
      fileSize,
      completedAt: new Date(),
    });
  } catch (err) {
    await fs.promises.unlink(filePath).catch(() => {});
    await SqlExportModel.findByIdAndUpdate(jobId, {
      status: 'failed',
      error: err.message || 'Export failed',
      completedAt: new Date(),
    });
  }
}

/** List a user's most recent exports (newest first), pruning older ones first. */
async function listExports(user) {
  await pruneExports(user).catch(() => {});
  const SqlExportModel = getSqlExportModel(user);
  return SqlExportModel.find({ tenantId: user.tenantId, userId: user.userId })
    .sort({ createdAt: -1 })
    .limit(MAX_EXPORTS)
    .lean();
}

/** Resolve a job + its on-disk path for download, scoped to the requester. */
async function getDownload(jobId, user) {
  const SqlExportModel = getSqlExportModel(user);
  const job = await SqlExportModel.findOne({ _id: jobId, tenantId: user.tenantId, userId: user.userId });
  if (!job) return null;
  if (job.status !== 'ready') return { job, filePath: null };
  return { job, filePath: path.join(EXPORT_DIR, job.storedName) };
}

async function deleteExport(jobId, user) {
  const SqlExportModel = getSqlExportModel(user);
  const job = await SqlExportModel.findOneAndDelete({
    _id: jobId,
    tenantId: user.tenantId,
    userId: user.userId,
  });
  if (job) await fs.promises.unlink(path.join(EXPORT_DIR, job.storedName)).catch(() => {});
  return !!job;
}

module.exports = { createExport, listExports, getDownload, deleteExport, EXPORT_DIR };
