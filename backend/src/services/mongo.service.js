const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

let targetClient = null;
let targetDb = null;
let connectPromise = null; // ensures concurrent callers await the same handshake

/**
 * Initialize a native MongoDB driver connection to the target data source.
 * Separate from the Mongoose metadata connection.
 *
 * Uses a shared promise so that if multiple requests arrive before the first
 * connection completes, they all await the same handshake instead of each
 * spawning a new MongoClient (which would leave targetDb null for the
 * subsequent callers and cause a "Cannot read properties of null" crash).
 */
async function connectTarget() {
  if (targetDb) return; // fast path after first successful connect
  if (!connectPromise) {
    connectPromise = (async () => {
      targetClient = new MongoClient(process.env.TARGET_MONGODB_URI, {
        maxPoolSize: 30,
      });
      await targetClient.connect();
      targetDb = targetClient.db();
      console.log('Connected to target MongoDB');
    })();
  }
  await connectPromise;
}

/**
 * Build the mandatory tenant + row-level-security $match stage.
 * Never trust the frontend; always derive from req.user.
 *
 * Tenant isolation modes (TENANT_ISOLATION env var):
 *   - "field"    (default) — every doc has a tenantId field; we $match on it
 *   - "database" — the database itself is the tenant boundary; no tenantId
 *                  field exists on documents. We skip the tenantId filter
 *                  but still apply attribute (region / department) filters.
 */
function buildSecurityFilter(user) {
  const mode = (process.env.TENANT_ISOLATION || 'field').toLowerCase();
  const filter = {};
  if (mode !== 'database') {
    filter.tenantId = user.tenantId;
  }
  if (user.attributes?.region) filter.region = user.attributes.region;
  if (user.attributes?.department) filter.department = user.attributes.department;
  return { $match: filter };
}

// Field names whose stored value is an object map of additional columns
// (one entry per attribute / balance component) that we want promoted to
// top-level scalar columns at query time. Examples:
//   `attributes: { LOAN_AMOUNT: 100000, INTEREST_RATE: 10, ... }`
//   `balance:    { activity: "100.0000", beginningBalance: "0.0000", endingBalance: "100.0000" }`
// After expansion, the original wrapper fields are removed and any string-
// encoded numeric values are converted to doubles so downstream $sum / $avg
// / $sort operate on scalars.
const EXPAND_INTO_ROOT_FIELDS = ['attributes', 'balance'];
const STRING_NUMERIC_FIELDS = [
  'amount',
  'activity',
  'activityAmount',
  'beginningBalance',
  'endingBalance',
  'balance',
  'debitAmount',
  'creditAmount',
];

// Built-in integer-key columns. Already stored as numbers in well-formed
// documents, but defensively coerced from string in case a CSV import or
// loosely-typed write left them as `"202502"`. Otherwise filters / joins
// silently miss rows.
const INTEGER_KEY_FIELDS = [
  'accountingPeriodId',
  'previousAccountingPeriodId',
  'originalPeriodId',
  'periodId',
];

// Built-in domain date fields stored as integer YYYYMMDD across the fixed
// Fyntrac collections (e.g. MetricLevelLtd.postingDate = 20250331).
// Normalized to BSON Date in buildExpansionStages so every downstream consumer
// (Browse, Datasets, Reports, KPIs, Recon, AI grounding) sees a real Date.
const YYYYMMDD_DATE_FIELDS = [
  'postingDate',
  'effectiveDate',
  'executionDate',
  'lastExecutionDate',
  'lastPlayedPostingDate',
  'intEffectiveDate',
];

// Cache of `attributeName -> dataType` (NUMBER | STRING | DATE) per tenant,
// loaded from the target DB's `Attributes` collection. Refreshed lazily
// after `ATTRIBUTE_TYPES_TTL_MS`.
const ATTRIBUTE_TYPES_TTL_MS = 60_000;
const attributeTypesCache = new Map(); // tenantKey -> { ts, map }

async function getAttributeTypes(user) {
  const tenantKey = user?.tenantId || '__default__';
  const cached = attributeTypesCache.get(tenantKey);
  const now = Date.now();
  if (cached && now - cached.ts < ATTRIBUTE_TYPES_TTL_MS) return cached.map;
  const map = {};
  try {
    const securityStage = buildSecurityFilter(user || { tenantId: tenantKey });
    const docs = await targetDb
      .collection('Attributes')
      .aggregate([securityStage, { $project: { attributeName: 1, dataType: 1 } }])
      .toArray();
    for (const d of docs) {
      if (d?.attributeName && d?.dataType) {
        map[String(d.attributeName)] = String(d.dataType).toUpperCase();
      }
    }
  } catch (e) {
    // Attributes collection may not exist; fall back to empty map (no coercion).
  }
  attributeTypesCache.set(tenantKey, { ts: now, map });
  return map;
}

// Cache of `tableName(lower) -> { columnName: dataType }` per tenant, loaded
// from the target DB's `CustomTableDefinitions` collection. Lets us coerce
// each column of a tenant-defined custom table (e.g. ExpectedCashFlow,
// MeasurementType) to its declared `dataType` (NUMBER | STRING | DATE).
const CUSTOM_TABLE_TYPES_TTL_MS = 60_000;
const customTableTypesCache = new Map(); // tenantKey -> { ts, byTable }

async function getCustomTableTypes(user) {
  const tenantKey = user?.tenantId || '__default__';
  const cached = customTableTypesCache.get(tenantKey);
  const now = Date.now();
  if (cached && now - cached.ts < CUSTOM_TABLE_TYPES_TTL_MS) return cached.byTable;
  const byTable = {};
  try {
    const securityStage = buildSecurityFilter(user || { tenantId: tenantKey });
    const defs = await targetDb
      .collection('CustomTableDefinitions')
      .aggregate([securityStage, { $project: { tableName: 1, columns: 1 } }])
      .toArray();
    for (const def of defs) {
      const name = def?.tableName ? String(def.tableName).toLowerCase() : null;
      if (!name || !Array.isArray(def.columns)) continue;
      const map = {};
      for (const c of def.columns) {
        if (c?.columnName && c?.dataType) {
          map[String(c.columnName)] = String(c.dataType).toUpperCase();
        }
      }
      byTable[name] = map;
    }
  } catch (e) {
    // CustomTableDefinitions may not exist; fall back to no coercion.
  }
  customTableTypesCache.set(tenantKey, { ts: now, byTable });
  return byTable;
}

function getCustomTableColumnTypes(collectionName, allByTable) {
  if (!collectionName || !allByTable) return null;
  return allByTable[String(collectionName).toLowerCase()] || null;
}

/**
 * Convert a raw attribute value to its declared `dataType`. Used at $set time
 * via $switch — value is `$<attrName>`, dataType drives the conversion.
 */
function coerceAttributeExpr(fieldRef, dataType) {
  if (dataType === 'NUMBER') {
    return {
      $cond: [
        { $in: [{ $type: fieldRef }, ['string', 'decimal']] },
        { $convert: { input: fieldRef, to: 'double', onError: fieldRef, onNull: null } },
        fieldRef,
      ],
    };
  }
  if (dataType === 'DATE') {
    // Tolerate three storage forms: real Date (passthrough), integer YYYYMMDD
    // (e.g. 20250331 -> 2025-03-31), and ISO string. Anything else passes through.
    return {
      $switch: {
        branches: [
          { case: { $eq: [{ $type: fieldRef }, 'date'] }, then: fieldRef },
          {
            case: { $in: [{ $type: fieldRef }, ['int', 'long', 'double', 'decimal']] },
            then: {
              $dateFromString: {
                dateString: { $toString: fieldRef },
                format: '%Y%m%d',
                onError: fieldRef,
                onNull: null,
              },
            },
          },
          {
            case: { $eq: [{ $type: fieldRef }, 'string'] },
            then: { $convert: { input: fieldRef, to: 'date', onError: fieldRef, onNull: null } },
          },
        ],
        default: fieldRef,
      },
    };
  }
  // STRING (default) — leave as-is.
  return fieldRef;
}

function buildExpansionStages(attributeTypes = {}, customColumnTypes = null) {
  const mergeArgs = ['$$ROOT'];
  for (const name of EXPAND_INTO_ROOT_FIELDS) {
    mergeArgs.push({
      $cond: [{ $eq: [{ $type: `$${name}` }, 'object'] }, `$${name}`, {}],
    });
  }
  // Coerce known numeric wrapper fields (top level).
  const setStage = {};
  for (const name of STRING_NUMERIC_FIELDS) {
    setStage[name] = {
      $cond: [
        { $eq: [{ $type: `$${name}` }, 'string'] },
        { $convert: { input: `$${name}`, to: 'double', onError: `$${name}`, onNull: null } },
        `$${name}`,
      ],
    };
  }
  // Normalize built-in YYYYMMDD-int date columns to real BSON Date so all
  // downstream stages can use $dateTrunc / $gte / $lte / range filters / etc.
  for (const name of YYYYMMDD_DATE_FIELDS) {
    setStage[name] = coerceAttributeExpr(`$${name}`, 'DATE');
  }
  // Defensive integer coercion for built-in numeric key columns
  // (e.g. accountingPeriodId). Strings -> int so joins/filters don't miss.
  for (const name of INTEGER_KEY_FIELDS) {
    setStage[name] = {
      $cond: [
        { $eq: [{ $type: `$${name}` }, 'string'] },
        { $convert: { input: `$${name}`, to: 'int', onError: `$${name}`, onNull: null } },
        `$${name}`,
      ],
    };
  }
  // Coerce each declared attribute to its `dataType` (NUMBER / DATE / STRING).
  for (const [attrName, dataType] of Object.entries(attributeTypes)) {
    if (!attrName || /[.$]/.test(attrName)) continue; // skip illegal field names
    setStage[attrName] = coerceAttributeExpr(`$${attrName}`, dataType);
  }
  // Coerce each custom-table column to its declared `dataType`. Custom-table
  // entries OVERRIDE any clash with attribute types since the custom table
  // definition is authoritative for that collection.
  if (customColumnTypes) {
    for (const [colName, dataType] of Object.entries(customColumnTypes)) {
      if (!colName || /[.$]/.test(colName)) continue;
      setStage[colName] = coerceAttributeExpr(`$${colName}`, dataType);
    }
  }
  return [
    { $replaceWith: { $mergeObjects: mergeArgs } },
    { $unset: EXPAND_INTO_ROOT_FIELDS },
    { $set: setStage },
  ];
}

/**
 * Validate that the pipeline is a JSON array and that the first stage
 * does NOT attempt to override tenantId.
 */
function validatePipeline(pipeline, tenantId) {
  if (!Array.isArray(pipeline)) throw new Error('Pipeline must be a JSON array');
  if (pipeline.length > 0) {
    const first = pipeline[0];
    if (first.$match && first.$match.tenantId && first.$match.tenantId !== tenantId) {
      throw new Error('Pipeline attempts to override tenantId — rejected');
    }
  }
}

/**
 * Execute an aggregation pipeline against the target MongoDB.
 * Automatically prepends tenant $match as the FIRST stage.
 */
async function executePipeline(collectionName, rawPipeline, user) {
  await connectTarget();
  validatePipeline(rawPipeline, user.tenantId);

  const securityStage = buildSecurityFilter(user);
  const attributeTypes = await getAttributeTypes(user);
  const customByTable = await getCustomTableTypes(user);
  const customColumnTypes = getCustomTableColumnTypes(collectionName, customByTable);
  const pipeline = [securityStage, ...buildExpansionStages(attributeTypes, customColumnTypes), ...rawPipeline];

  const start = Date.now();
  const col = targetDb.collection(collectionName);
  const raw = await col.aggregate(pipeline, { allowDiskUse: true, maxTimeMS: 30000 }).toArray();
  const data = raw.map(normalizeBson);
  const executionTime = Date.now() - start;

  const columns = data.length > 0
    ? Object.keys(data[0]).filter((k) => !k.startsWith('_'))
    : [];
  // Strip underscore-prefixed system fields and collection-specific hidden fields from rows.
  const colHiddenFields = COLLECTION_HIDDEN_FIELDS[String(collectionName).toLowerCase()] || null;
  const cleanData = data.map((row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      if (k.startsWith('_')) continue;
      if (colHiddenFields && colHiddenFields.has(k.toLowerCase())) continue;
      out[k] = v;
    }
    return out;
  });
  const cleanColumns = columns.filter((k) => !colHiddenFields || !colHiddenFields.has(k.toLowerCase()));
  return { data: cleanData, columns: cleanColumns, executionTime };
}

// Collections we never want surfaced in pickers, AI grounding, or dataset builder.
const EXCLUDED_COLLECTIONS = new Set([
  'settings',
  'modelfiles',
  'sequences',
  'customtabledefinitions',
  'attributes',
  'eventconfigurations',
]);
function isExcludedCollection(name) {
  if (!name) return true;
  if (name.startsWith('system.')) return true;
  if (name.startsWith('_')) return true;
  const lower = name.toLowerCase();
  if (EXCLUDED_COLLECTIONS.has(lower)) return true;
  if (lower.includes('sequences')) return true;
  return false;
}

// Field names we never want offered in pickers (filter / group-by / sort /
// KPI source field). Mirrored in
// frontend/src/components/charts/_columnRules.js so the UI hides them too.
const HIDDEN_FIELD_NAMES = new Set([
  'accountingperiod',
  'attributes',
  'batchid',
  'sourceid',
  '_class',
  'tenantid',
  // ActivityLog internal upload tracking
  'jobid',
  'uploadid',
  'uploadfilepath',
  // Model internal config / file pointers
  'modelconfig',
  'modelfileid',
]);

// Collection-specific fields to hide from pickers (lowercase collection name → Set of lowercase leaf names).
const COLLECTION_HIDDEN_FIELDS = {
  transactionactivity: new Set(['periodid']),
};

function isHiddenFieldName(fullKey, collectionName) {
  if (!fullKey) return false;
  const leaf = String(fullKey).split('.').pop().toLowerCase();
  if (HIDDEN_FIELD_NAMES.has(leaf)) return true;
  if (collectionName) {
    const colHidden = COLLECTION_HIDDEN_FIELDS[String(collectionName).toLowerCase()];
    if (colHidden && colHidden.has(leaf)) return true;
  }
  return false;
}

// Field names whose raw value is a wrapper object holding a single numeric
// measurement. After `buildExpansionStages()` they are typically already
// scalar numbers at top level, but this set is retained as a defensive hint
// for `flattenDoc` so any residual wrapper still reports as `number` and we
// don't recurse into its children.
const NUMERIC_WRAPPER_FIELDS = new Set([
  'beginningbalance',
  'endingbalance',
  'activityamount',
  'activity',
  'amount',
]);
function isNumericWrapperField(fullKey) {
  if (!fullKey) return false;
  const leaf = String(fullKey).split('.').pop().toLowerCase();
  return NUMERIC_WRAPPER_FIELDS.has(leaf);
}

/**
 * List all collection names available in the target database.
 */
async function getCollections() {
  await connectTarget();
  const cols = await targetDb.listCollections().toArray();
  return cols.map((c) => c.name).filter((n) => !isExcludedCollection(n)).sort((a, b) => a.localeCompare(b));
}

/**
 * Sample up to 100 documents from a collection and infer field types.
 */
async function inferSchema(collectionName, user) {  await connectTarget();
  const securityStage = buildSecurityFilter(user);
  const attributeTypes = await getAttributeTypes(user);
  const customByTable = await getCustomTableTypes(user);
  const customColumnTypes = getCustomTableColumnTypes(collectionName, customByTable);
  const col = targetDb.collection(collectionName);
  const docs = await col.aggregate([securityStage, ...buildExpansionStages(attributeTypes, customColumnTypes), { $sample: { size: 500 } }]).toArray();

  const fieldMap = {};
  const formatMap = {};
  for (const doc of docs) {
    flattenDoc(doc, '', fieldMap, formatMap);
  }

  return Object.entries(fieldMap)
    .map(([name, types]) => {
      const out = { name, type: resolveType(types) };
      if (formatMap[name] && out.type === 'date') out.format = formatMap[name];
      return decorateField(out);
    })
    // Hide wrapper/container objects from the selectable field list. Their
    // scalar children (e.g. `accountingPeriod.periodId`) are surfaced
    // separately by `flattenDoc`'s recursion, so users still get useful
    // fields without seeing `[object Object]` / `{"periodId":202202}`.
    .filter((f) => f.type !== 'object' && f.type !== 'array' && f.type !== 'binary')
    // Hide domain-system columns the user never needs to pick from
    // (mirrored in frontend/src/components/charts/_columnRules.js).
    .filter((f) => !isHiddenFieldName(f.name, collectionName));
}

/**
 * Infer field types after running an arbitrary prefix pipeline (e.g. a saved
 * dataset / report's pipeline) by sampling its output. Tenant security is
 * still applied as the very first stage by `executePipeline`.
 */
async function inferSchemaFromPipeline(collectionName, prefixPipeline, user) {
  const safePrefix = Array.isArray(prefixPipeline) ? prefixPipeline : [];
  const sampled = [...safePrefix, { $limit: 500 }];
  const result = await executePipeline(collectionName, sampled, user);
  const fieldMap = {};
  const formatMap = {};
  for (const doc of result.data || []) {
    flattenDoc(doc, '', fieldMap, formatMap);
  }
  return Object.entries(fieldMap)
    .map(([name, types]) => {
      const out = { name, type: resolveType(types) };
      if (formatMap[name] && out.type === 'date') out.format = formatMap[name];
      return decorateField(out);
    })
    .filter((f) => f.type !== 'object' && f.type !== 'array' && f.type !== 'binary')
    .filter((f) => !isHiddenFieldName(f.name, collectionName));
}

const DATE_NAME_RX = /(^|[._])(date|time|datetime|timestamp|created|updated|modified|posted|posting|effective|expires|expiry|due|start|end|signedup|signed_up)([._]|$)|At$/i;

// Promote known semantic types so the UI shows e.g. `accountingPeriodId (period)`
// instead of `(number)`. Keeps `type` accurate (it's still the underlying BSON
// kind) but adds a `semanticType` the front end prefers when present.
const INTEGER_KEY_FIELD_SET = new Set(INTEGER_KEY_FIELDS);
function decorateField(out) {
  const leaf = String(out.name).split('.').pop();
  if (out.type === 'number' && INTEGER_KEY_FIELD_SET.has(leaf)) {
    out.semanticType = 'period';
  }
  return out;
}

function looksLikeDateName(fullKey) {
  if (!fullKey) return false;
  const last = fullKey.split('.').pop();
  return DATE_NAME_RX.test(fullKey) || /At$/.test(last);
}

function flattenDoc(obj, prefix, fieldMap, formatMap) {
  for (const [key, value] of Object.entries(obj)) {
    // Skip system fields: anything starting with '_' (e.g. _id, _class) and tenantId.
    if (key.startsWith('_') || key === 'tenantId') continue;
    // Skip hidden domain fields entirely so we don't recurse into them either
    // (e.g. accountingPeriod.startDate should NOT appear in field pickers).
    if (HIDDEN_FIELD_NAMES.has(String(key).toLowerCase())) continue;
    const fullKey = prefix ? `${prefix}.${key}` : key;
    // Numeric-wrapper fields (e.g. beginningBalance) are exposed as a plain
    // number column and we don't recurse into their children.
    if (isNumericWrapperField(fullKey)) {
      if (!fieldMap[fullKey]) fieldMap[fullKey] = new Set();
      fieldMap[fullKey].add('number');
      continue;
    }
    const detected = detectType(value, fullKey);
    const type = typeof detected === 'string' ? detected : detected.type;
    if (typeof detected === 'object' && detected.format && !formatMap[fullKey]) {
      formatMap[fullKey] = detected.format;
    }
    if (!fieldMap[fullKey]) fieldMap[fullKey] = new Set();
    fieldMap[fullKey].add(type);

    if (type === 'object' && value !== null) {
      flattenDoc(value, fullKey, fieldMap, formatMap);
    }
  }
}

/**
 * Returns a string type, or { type, format } when extra hint is available.
 * Recognised formats:
 *   - 'iso'         — JS Date / ISO 8601 string with day
 *   - 'yyyymm'      — strings like "2022-1" / "2022-01"
 *   - 'yyyymmdd'    — integer like 20220131
 *   - 'epoch-ms'    — large integer ~1e12+
 *   - 'epoch-s'     — integer ~1e9..1e10
 */
function detectType(value, fieldName = '') {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) return { type: 'date', format: 'iso' };
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') {
    const ctor = value.constructor?.name;
    if (ctor === 'ObjectId' || ctor === 'ObjectID') return 'objectId';
    if (ctor === 'Decimal128' || ctor === 'Long' || ctor === 'Int32' || ctor === 'Double') {
      // Could still be a yyyymmdd Long — fall through to numeric heuristics
      const n = Number(value.toString ? value.toString() : value);
      if (Number.isFinite(n)) return numericDateOrNumber(n, fieldName);
      return 'number';
    }
    if (ctor === 'Binary') return 'binary';
    if (value.$numberDecimal !== undefined || value.$numberLong !== undefined ||
        value.$numberInt !== undefined || value.$numberDouble !== undefined) return 'number';
    if (value.$date !== undefined) return { type: 'date', format: 'iso' };
    if (value.$oid !== undefined) return 'objectId';
    return 'object';
  }
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return numericDateOrNumber(value, fieldName);
  if (typeof value === 'string') {
    // Full ISO date-time
    if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}|$)/.test(value)) return { type: 'date', format: 'iso' };
    // Year-month like "2022-1" or "2022-01"
    if (/^\d{4}-\d{1,2}$/.test(value)) return { type: 'date', format: 'yyyymm' };
    // Slash-style date 01/31/2022 or 31/01/2022
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value) && looksLikeDateName(fieldName)) {
      return { type: 'date', format: 'mdy' };
    }
    return 'string';
  }
  return 'string';
}

function numericDateOrNumber(n, fieldName) {
  if (!Number.isFinite(n)) return 'number';
  const looksDate = looksLikeDateName(fieldName);
  // YYYYMMDD integer (e.g. 20220131) — 8 digits, year 1900–2100
  if (Number.isInteger(n) && n >= 19000101 && n <= 21001231) {
    const y = Math.floor(n / 10000);
    const m = Math.floor((n % 10000) / 100);
    const d = n % 100;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && (looksDate || (m <= 12 && d <= 31))) {
      return { type: 'date', format: 'yyyymmdd' };
    }
  }
  // Epoch milliseconds ~ 1995-01-01 .. 2100-01-01
  if (looksDate && Number.isInteger(n) && n >= 7.88e11 && n <= 4.1e12) {
    return { type: 'date', format: 'epoch-ms' };
  }
  // Epoch seconds ~ 1995-01-01 .. 2100-01-01
  if (looksDate && Number.isInteger(n) && n >= 7.88e8 && n <= 4.1e9) {
    return { type: 'date', format: 'epoch-s' };
  }
  return 'number';
}

/**
 * Recursively convert BSON wrapper types (Decimal128, Long, Int32, Double,
 * ObjectId, Date, Binary) into plain JS values so that JSON.stringify produces
 * primitives instead of EJSON like {"$numberDecimal":"123.45"}.
 */
function normalizeBson(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(normalizeBson);
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return value;

  const ctor = value.constructor?.name;
  if (ctor === 'ObjectId' || ctor === 'ObjectID') return value.toString();
  if (ctor === 'Decimal128') {
    const n = Number(value.toString());
    return Number.isFinite(n) ? n : value.toString();
  }
  if (ctor === 'Long') {
    const n = Number(value.toString());
    return Number.isFinite(n) ? n : value.toString();
  }
  if (ctor === 'Int32' || ctor === 'Double') return value.valueOf();
  if (ctor === 'Binary') return value.buffer ? value.buffer.toString('base64') : String(value);

  // Plain object — recurse
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = normalizeBson(v);
  return out;
}

function resolveType(typesSet) {
  const types = [...typesSet].filter((t) => t !== 'null');
  if (types.length === 0) return 'null';
  if (types.length === 1) return types[0];
  if (types.includes('number')) return 'number';
  if (types.includes('date')) return 'date';
  return 'string';
}

module.exports = { executePipeline, getCollections, inferSchema, inferSchemaFromPipeline, connectTarget };
