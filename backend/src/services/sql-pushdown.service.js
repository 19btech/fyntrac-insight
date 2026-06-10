const { Parser } = require('node-sql-parser');

const parser = new Parser();
// DuckDB's dialect is closest to PostgreSQL (window functions, CASE, CTEs,
// `::` casts). We parse with the postgresql grammar for validation + planning.
const PARSE_OPT = { database: 'postgresql' };

const DATE_LITERAL_RX = /^\d{4}-\d{2}-\d{2}([T ]|$)/;

/**
 * Parse + validate a user-supplied SQL string.
 *
 * Guarantees, in order:
 *   1. It parses (else we can't know which collections to load -> reject).
 *   2. EVERY statement is a read-only SELECT — any insert/update/delete/ddl
 *      operation is rejected with a clear message.
 *
 * Multiple `;`-separated SELECTs are allowed (worksheet "run script" style);
 * the LAST statement is the one executed and returned, matching common SQL
 * editors. Returns { ast, tables, sql } where:
 *   - ast    : the AST of the statement that will run (the last one)
 *   - tables : de-duplicated raw table identifiers referenced by that statement
 *   - sql    : the effective single-statement SQL text to execute
 */
function parseAndValidate(sql) {
  const trimmed = String(sql || '').trim();
  if (!trimmed) throw new Error('Query is empty.');

  let ast;
  try {
    ast = parser.astify(trimmed, PARSE_OPT);
  } catch (e) {
    throw new Error(`Could not parse SQL: ${e.message}`);
  }

  const statements = Array.isArray(ast) ? ast : [ast];

  // Every statement must be a read-only SELECT.
  for (const stmt of statements) {
    if (stmt.type !== 'select') {
      throw new Error(
        `Only read-only SELECT queries are allowed (received a "${stmt.type.toUpperCase()}" statement).`
      );
    }
  }

  // Belt-and-braces: tableList entries look like `select::null::TransactionActivity`.
  // The first segment is the operation performed on that table — anything other
  // than `select` means the query writes somewhere.
  let tableList = [];
  try {
    tableList = parser.tableList(trimmed, PARSE_OPT);
  } catch {
    tableList = [];
  }
  for (const entry of tableList) {
    const [op] = entry.split('::');
    if (op && op !== 'select') {
      throw new Error(
        `Only read-only SELECT queries are allowed (found a "${op.toUpperCase()}" operation).`
      );
    }
  }

  // The statement we actually execute is the last one. For a single statement
  // we keep the original text verbatim (no re-serialization); for a script we
  // sqlify just the final statement so collection loading + wrapping operate on
  // exactly what runs.
  const last = statements[statements.length - 1];
  const effectiveSql = statements.length === 1 ? trimmed : parser.sqlify(last, PARSE_OPT);
  const tables = tablesOf(effectiveSql);

  return { ast: last, tables, sql: effectiveSql };
}

/** De-duplicated list of base-table names referenced in a single SQL statement. */
function tablesOf(sql) {
  let list = [];
  try {
    list = parser.tableList(sql, PARSE_OPT);
  } catch {
    list = [];
  }
  const tables = [];
  for (const entry of list) {
    const [, , table] = entry.split('::');
    if (table && table !== 'null' && !tables.includes(table)) tables.push(table);
  }
  return tables;
}

/**
 * Translate a WHERE expression node into a Mongo filter, but ONLY for the
 * subset of predicates we can prove yield a SUPERSET of the SQL result
 * (DuckDB re-applies the full, original WHERE afterwards, so a superset is
 * always correct — it just means we pre-filtered less aggressively).
 *
 * Soundness rules:
 *   - AND  -> push the translatable conjuncts, silently drop the rest
 *             (dropping a conjunct widens the match = still a superset).
 *   - OR   -> push only if BOTH sides translate (dropping an OR branch would
 *             NARROW the match = unsound), else drop the whole OR.
 *   - Comparisons push only against numeric literals (range + equality) and
 *     non-date string literals (equality / IN only). Date-looking string
 *     literals are skipped because the field has been coerced to a BSON Date
 *     upstream and `Date >= "2025-01-01"` would wrongly drop rows.
 *
 * Returns a Mongo filter object, or null when nothing is safely translatable.
 */
function translateWhere(node) {
  if (!node) return null;

  if (node.type === 'binary_expr') {
    const op = node.operator;

    if (op === 'AND') {
      const parts = [translateWhere(node.left), translateWhere(node.right)].filter(Boolean);
      if (parts.length === 0) return null;
      if (parts.length === 1) return parts[0];
      return { $and: parts };
    }
    if (op === 'OR') {
      const l = translateWhere(node.left);
      const r = translateWhere(node.right);
      if (l && r) return { $or: [l, r] };
      return null; // dropping a branch would narrow the result -> unsound
    }

    const col = columnName(node.left);
    if (!col) return null;

    if (op === 'IN' && node.right?.type === 'expr_list') {
      const vals = node.right.value.map(scalarLiteral);
      if (vals.some((v) => v === undefined || isDateLiteral(v))) return null;
      return { [col]: { $in: vals } };
    }
    if (op === 'BETWEEN' && node.right?.type === 'expr_list') {
      const [a, b] = node.right.value.map(scalarLiteral);
      if (!isNumber(a) || !isNumber(b)) return null; // ranges: numeric only
      return { [col]: { $gte: a, $lte: b } };
    }

    const val = scalarLiteral(node.right);
    if (val === undefined) return null;

    switch (op) {
      case '=':
        if (isDateLiteral(val)) return null;
        return { [col]: val };
      case '!=':
      case '<>':
        if (isDateLiteral(val)) return null;
        return { [col]: { $ne: val } };
      case '>':
      case '>=':
      case '<':
      case '<=':
        if (!isNumber(val)) return null; // ranges: numeric only (sound)
        return { [col]: { [{ '>': '$gt', '>=': '$gte', '<': '$lt', '<=': '$lte' }[op]]: val } };
      default:
        return null;
    }
  }

  return null;
}

function columnName(node) {
  if (node?.type !== 'column_ref') return null;
  return colRefName(node.column);
}

// The column identifier shows up in a few shapes across parser versions:
//   'year'                                  (plain string)
//   { value: 'year' }
//   { expr: { type: 'default', value: 'year' } }
// and '*' for a star select. Normalize them all here.
function colRefName(col) {
  if (col == null) return null;
  if (typeof col === 'string') return col;
  if (typeof col === 'object') {
    if (typeof col.value === 'string') return col.value;
    if (col.expr && typeof col.expr.value === 'string') return col.expr.value;
  }
  return null;
}

function scalarLiteral(node) {
  if (!node) return undefined;
  switch (node.type) {
    case 'number':
      return node.value;
    case 'single_quote_string':
    case 'string':
    case 'double_quote_string':
      return node.value;
    case 'bool':
      return node.value;
    default:
      return undefined; // column refs, functions, params -> not a literal
  }
}

function isNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
function isDateLiteral(v) {
  return typeof v === 'string' && DATE_LITERAL_RX.test(v);
}

/**
 * Collect the set of column names referenced anywhere in the AST so we can
 * push a `$project` and only stream the columns the query actually needs.
 * Returns null when a `SELECT *` (or `t.*`) is present — then we must fetch
 * every field.
 */
function collectReferencedColumns(ast) {
  const cols = new Set();
  let selectStar = false;

  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node.type === 'star') {
      selectStar = true;
      return;
    }
    if (node.type === 'column_ref') {
      const c = colRefName(node.column);
      if (c === '*' || c == null) selectStar = true; // `*`, `t.*`, or unparsable -> fetch all
      else cols.add(c);
      return;
    }
    for (const v of Object.values(node)) walk(v);
  };
  walk(ast);

  return selectStar ? null : cols;
}

/**
 * Build the per-collection load plan for a validated SELECT.
 *
 * For a SINGLE-collection query we push down the safe WHERE predicates and a
 * column projection. For multi-collection (JOIN) queries we skip WHERE
 * pushdown (alias resolution would risk unsound filters) but still project
 * the referenced columns. DuckDB always runs the full original SQL on the
 * loaded data, so results are identical either way — pushdown only affects
 * how much we stream out of Mongo.
 *
 * @returns Array<{ table, match, project }>
 */
function buildLoadPlan(ast, tables) {
  const singleTable = tables.length === 1 && isPlainSingleFrom(ast);
  const refCols = collectReferencedColumns(ast);

  return tables.map((table) => {
    const stages = { table, match: null, project: null };

    if (singleTable && ast.where) {
      const filter = translateWhere(ast.where);
      if (filter && Object.keys(filter).length) stages.match = { $match: filter };
    }

    if (refCols && refCols.size > 0) {
      const project = {};
      for (const c of refCols) {
        if (!/[.$]/.test(c)) project[c] = 1;
      }
      if (Object.keys(project).length) stages.project = { $project: project };
    }

    return stages;
  });
}

function isPlainSingleFrom(ast) {
  const from = ast.from;
  if (!Array.isArray(from) || from.length !== 1) return false;
  const f = from[0];
  // A plain base-table FROM (no JOIN, no subquery/derived table).
  return typeof f.table === 'string' && !f.expr && !f.join;
}

module.exports = { parseAndValidate, buildLoadPlan, translateWhere };
