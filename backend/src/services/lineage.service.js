/**
 * Propagation of a Prism (SQL Lab) query edit to everything built on it.
 *
 * The dependency graph is:
 *
 *   SavedQuery
 *     └─ SavedModel (dataset)        savedQueryId + savedQuerySql snapshot
 *          ├─ Question (report)      queryConfig.source.datasetId | sourceModelId
 *          │    └─ Dashboard card    questionId
 *          ├─ Metric (KPI)           source.kind='dataset', source.id
 *          ├─ Recon                  sourceA/sourceB.refId
 *          └─ InstrumentSource       sourceType='dataset', sourceId
 *
 * Only the dataset holds a COPY of the query — `savedQuerySql`, snapshotted so
 * a dataset keeps working if the query is later edited or deleted. Everything
 * below the dataset resolves it by id at run time, so refreshing that one copy
 * is what makes the whole subtree current; the rest need no writing, and a
 * recon two levels down picks the change up on its next run.
 *
 * All functions accept a `getModel` parameter (e.g. `req.model`) so they work
 * with the per-tenant connection managed by tenant-db.service.js.
 */

/** Datasets that snapshot a given saved query. */
async function datasetsForQuery(savedQueryId, tenantId, getModel) {
  return getModel('SavedModel').find({
    tenantId,
    savedQueryId,
    archived: { $ne: true },
  });
}

/**
 * Everything that resolves the given datasets at run time. Read-only: this
 * reports the blast radius, it does not modify the dependents.
 */
async function dependentsOfDatasets(datasetIds, tenantId, getModel, datasetNames = {}) {
  const ids = datasetIds.map(String);
  if (ids.length === 0) {
    return { reports: [], kpis: [], recons: [], dashboards: [], instrumentSources: [] };
  }

  const [reports, kpis, recons, instrumentSources] = await Promise.all([
    // A report records its dataset in queryConfig.source.datasetId; older ones
    // use the sourceModelId column.
    getModel('Question').find({
      tenantId,
      archived: { $ne: true },
      $or: [
        { 'queryConfig.source.datasetId': { $in: ids } },
        { sourceModelId: { $in: datasetIds } },
      ],
    }).select('name').lean(),

    // source.id is an ObjectId path, so match on the ObjectIds.
    getModel('Metric').find({
      tenantId,
      archived: { $ne: true },
      'source.kind': 'dataset',
      'source.id': { $in: datasetIds },
    }).select('name').lean(),

    // refId is a plain String holding either a SavedModel or a ReconCsvFile id,
    // so the side's kind has to be checked too — a CSV side must not match a
    // dataset id.
    getModel('Recon').find({
      tenantId,
      archived: { $ne: true },
      $or: [
        { 'sourceA.kind': 'dataset', 'sourceA.refId': { $in: ids } },
        { 'sourceB.kind': 'dataset', 'sourceB.refId': { $in: ids } },
      ],
    }).select('name').lean(),

    getModel('InstrumentSource').find({
      tenantId,
      sourceType: 'dataset',
      sourceId: { $in: datasetIds },
    }).select('label sourceId').lean(),
  ]);

  // Dashboards are one hop further out: they hold cards, and a card points at
  // a report or a KPI rather than at the dataset.
  const reportIds = reports.map((r) => r._id);
  const kpiIds = kpis.map((k) => k._id);
  const dashboards = reportIds.length || kpiIds.length
    ? await getModel('Dashboard').find({
      tenantId,
      archived: { $ne: true },
      $or: [
        { 'cards.questionId': { $in: reportIds } },
        { 'cards.metricId': { $in: kpiIds } },
        { 'tabs.cards.questionId': { $in: reportIds } },
        { 'tabs.cards.metricId': { $in: kpiIds } },
      ],
    }).select('name').lean()
    : [];

  return {
    reports,
    kpis,
    recons,
    dashboards,
    // A blank label means "follow the dataset's own name", so resolve it here
    // rather than reporting an empty string.
    instrumentSources: instrumentSources.map((s) => ({
      ...s,
      label: s.label || datasetNames[String(s.sourceId)] || '(unnamed)',
    })),
  };
}

const name = (d) => d.name || d.label || '(unnamed)';

/**
 * Report what an edit to `savedQueryId` would touch, without changing anything.
 * Used to warn before saving.
 */
async function impactOfSavedQuery(savedQueryId, tenantId, getModel) {
  const datasets = await datasetsForQuery(savedQueryId, tenantId, getModel);
  const names = Object.fromEntries(datasets.map((d) => [String(d._id), d.name]));
  const deps = await dependentsOfDatasets(datasets.map((d) => d._id), tenantId, getModel, names);
  return {
    datasets: datasets.map((d) => ({ _id: String(d._id), name: d.name })),
    reports: deps.reports.map((r) => ({ _id: String(r._id), name: r.name })),
    kpis: deps.kpis.map((k) => ({ _id: String(k._id), name: k.name })),
    recons: deps.recons.map((r) => ({ _id: String(r._id), name: r.name })),
    dashboards: deps.dashboards.map((d) => ({ _id: String(d._id), name: d.name })),
    instrumentSources: deps.instrumentSources.map((s) => ({ _id: String(s._id), name: s.label })),
  };
}

/**
 * Push a saved query's new SQL into every dataset built on it, and report the
 * subtree that consequently changed.
 *
 * Each dataset keeps a version snapshot of the SQL it was on, so an edit that
 * breaks a downstream report can be traced (and the old text recovered) rather
 * than silently overwriting the only copy.
 */
async function propagateSavedQuery(savedQuery, user, getModel) {
  const tenantId = user.tenantId;
  const datasets = await datasetsForQuery(savedQuery._id, tenantId, getModel);

  const updated = [];
  for (const dataset of datasets) {
    const sqlChanged = dataset.savedQuerySql !== savedQuery.sql;
    const nameChanged = dataset.savedQueryName !== savedQuery.name;
    if (!sqlChanged && !nameChanged) continue;

    if (sqlChanged) {
      const versions = Array.isArray(dataset.versions) ? dataset.versions : [];
      versions.push({
        version: versions.length + 1,
        snapshot: {
          sourceMode: dataset.sourceMode,
          savedQuerySql: dataset.savedQuerySql,
          savedQueryName: dataset.savedQueryName,
        },
        note: `Prism query "${savedQuery.name}" was updated`,
        createdBy: user.userId,
        createdAt: new Date(),
      });
      // Matches the cap documented on the model.
      dataset.versions = versions.slice(-20);
      dataset.savedQuerySql = savedQuery.sql;
    }
    if (nameChanged) dataset.savedQueryName = savedQuery.name;

    await dataset.save();
    updated.push({ _id: String(dataset._id), name: dataset.name, sqlChanged });
  }

  const names = Object.fromEntries(datasets.map((d) => [String(d._id), d.name]));
  const deps = await dependentsOfDatasets(datasets.map((d) => d._id), tenantId, getModel, names);

  return {
    datasets: updated,
    // Not rewritten — these resolve the dataset when they run, so they are
    // already current. Listed so the change's reach is visible.
    reports: deps.reports.map(name),
    kpis: deps.kpis.map(name),
    recons: deps.recons.map(name),
    dashboards: deps.dashboards.map(name),
    instrumentSources: deps.instrumentSources.map(name),
  };
}

module.exports = {
  propagateSavedQuery,
  impactOfSavedQuery,
  datasetsForQuery,
  dependentsOfDatasets,
};
