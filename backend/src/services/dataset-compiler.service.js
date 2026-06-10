/**
 * Compile a "step stack" (the visual dataset builder's structured config)
 * into a MongoDB aggregation pipeline. Used by both the dataset editor's
 * preview endpoint and at save-time so what the user sees is what gets stored.
 *
 * Step kinds:
 *   - filter        { kind, filters: [{ field, operator, value }] }
 *   - combine       { kind, joins: [{from, as, conditions, fields, relationship, unmatched}] }
 *                   (legacy: top-level from/as/localField/foreignField is still accepted)
 *   - addColumn     { kind, name, formula }     // formula compiled to $expr
 *   - summarize     { kind, groupBys: [], metrics: [{ agg, field, alias }] }
 *   - sort          { kind, sorts: [{field, dir}] }  // legacy: { field, dir } accepted
 *   - keepTopN      { kind, limit }
 *   - chooseColumns { kind, columns: [], mode: 'keep'|'drop' }
 *   - rename        { kind, renames: [{ from, to }] }   // legacy: { from, to }
 *
 * Every step also carries an optional `disabled: true` flag so users can
 * temporarily turn a step off without deleting it.
 */

const OP_NEEDS_NUMBER = new Set(['$gt', '$gte', '$lt', '$lte']);

// Matches ISO 8601 date strings produced by normalizeBson for date fields
// that buildExpansionStages has already coerced to BSON Dates. Converting
// them back to JS Date makes the MongoDB driver send a BSON Date in $match,
// which correctly compares against the BSON Date stored in the document.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+\-]+)?$/;

function coerce(value, op) {
  if (value === '' || value == null) return value;
  if (OP_NEEDS_NUMBER.has(op)) {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  const n = Number(value);
  if (Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(String(value))) return n;
  // Coerce ISO date strings to Date objects so $match compares against BSON
  // Dates (which is what buildExpansionStages produces for date-typed fields).
  if (typeof value === 'string' && ISO_DATE_RE.test(value)) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  return value;
}

function buildMatch(filters) {
  const $match = {};
  for (const f of filters || []) {
    if (!f.field || !f.operator) continue;
    if (f.operator === '$exists') {
      $match[f.field] = { $exists: true, $ne: null };
    } else if (f.operator === '$in') {
      $match[f.field] = {
        $in: String(f.value ?? '')
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      };
    } else if (f.operator === '$regex') {
      $match[f.field] = { $regex: String(f.value ?? ''), $options: 'i' };
    } else {
      $match[f.field] = { [f.operator]: coerce(f.value, f.operator) };
    }
  }
  return $match;
}

function buildSummarize(groupBys, metrics) {
  const stages = [];
  const safe = (p) => String(p).replace(/\./g, '_');
  const groups = (groupBys || []).filter(Boolean);
  let groupId;
  if (groups.length === 0) groupId = null;
  else if (groups.length === 1) groupId = `$${groups[0]}`;
  else groupId = Object.fromEntries(groups.map((g) => [safe(g), `$${g}`]));

  const $group = { _id: groupId };
  for (const m of metrics || []) {
    const alias =
      m.alias ||
      (m.agg === '$count'
        ? 'count'
        : `${m.agg.replace('$', '')}_${safe(m.field || 'val')}`);
    if (m.agg === '$count') {
      $group[alias] = { $sum: 1 };
    } else if (m.field) {
      $group[alias] = { [m.agg]: `$${m.field}` };
    }
  }
  stages.push({ $group });

  const $project = { _id: 0 };
  if (groups.length === 1) $project[groups[0]] = '$_id';
  else if (groups.length > 1)
    for (const g of groups) $project[g] = `$_id.${safe(g)}`;
  for (const k of Object.keys($group)) if (k !== '_id') $project[k] = 1;
  stages.push({ $project });
  return stages;
}

/**
 * Tiny safe expression compiler for the formula builder.
 * Accepts: numeric literals, string literals, $field references, parens,
 *          + - * / , function calls from a small allow-list.
 *
 * Examples:
 *   amount - refund                     -> { $subtract: ["$amount", "$refund"] }
 *   if(status == "paid", amount, 0)     -> { $cond: [{ $eq: ["$status","paid"] }, "$amount", 0] }
 *   round(amount * 1.07, 2)             -> { $round: [{ $multiply: ["$amount", 1.07] }, 2] }
 *
 * If parsing fails we throw with a helpful message that the UI surfaces.
 */
const FUNCS = {
  if: '$cond',
  round: '$round',
  abs: '$abs',
  ceil: '$ceil',
  floor: '$floor',
  min: '$min',
  max: '$max',
  concat: '$concat',
  upper: '$toUpper',
  lower: '$toLower',
  year: '$year',
  month: '$month',
  day: '$dayOfMonth',
  coalesce: '$ifNull',
  sum: '$add',
};

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')' || c === ',') { tokens.push({ t: c }); i++; continue; }
    if ('+-*/'.includes(c)) { tokens.push({ t: 'op', v: c }); i++; continue; }
    if (c === '=' && src[i + 1] === '=') { tokens.push({ t: 'op', v: '==' }); i += 2; continue; }
    if (c === '!' && src[i + 1] === '=') { tokens.push({ t: 'op', v: '!=' }); i += 2; continue; }
    if (c === '>' && src[i + 1] === '=') { tokens.push({ t: 'op', v: '>=' }); i += 2; continue; }
    if (c === '<' && src[i + 1] === '=') { tokens.push({ t: 'op', v: '<=' }); i += 2; continue; }
    if (c === '>' || c === '<') { tokens.push({ t: 'op', v: c }); i++; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1; let s = '';
      while (j < src.length && src[j] !== c) { s += src[j]; j++; }
      if (j === src.length) throw new Error('Unterminated string in formula');
      tokens.push({ t: 'str', v: s }); i = j + 1; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++;
      tokens.push({ t: 'num', v: parseFloat(src.slice(i, j)) }); i = j; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i; while (j < src.length && /[A-Za-z0-9_.$]/.test(src[j])) j++;
      tokens.push({ t: 'id', v: src.slice(i, j) }); i = j; continue;
    }
    throw new Error(`Unexpected character "${c}" in formula`);
  }
  return tokens;
}

function parseFormula(src) {
  const tokens = tokenize(src);
  let p = 0;
  const peek = () => tokens[p];
  const eat = (cond) => { if (!cond) throw new Error('Formula syntax error'); return tokens[p++]; };

  // precedence: comparison < addition < multiplication
  function parseComparison() {
    let left = parseAddSub();
    while (peek() && peek().t === 'op' && ['==', '!=', '>', '>=', '<', '<='].includes(peek().v)) {
      const op = tokens[p++].v;
      const right = parseAddSub();
      const map = { '==': '$eq', '!=': '$ne', '>': '$gt', '>=': '$gte', '<': '$lt', '<=': '$lte' };
      left = { [map[op]]: [left, right] };
    }
    return left;
  }
  function parseAddSub() {
    let left = parseMulDiv();
    while (peek() && peek().t === 'op' && '+-'.includes(peek().v)) {
      const op = tokens[p++].v;
      const right = parseMulDiv();
      left = op === '+' ? { $add: [left, right] } : { $subtract: [left, right] };
    }
    return left;
  }
  function parseMulDiv() {
    let left = parsePrimary();
    while (peek() && peek().t === 'op' && '*/'.includes(peek().v)) {
      const op = tokens[p++].v;
      const right = parsePrimary();
      left = op === '*' ? { $multiply: [left, right] } : { $divide: [left, right] };
    }
    return left;
  }
  function parsePrimary() {
    const tk = peek();
    if (!tk) throw new Error('Unexpected end of formula');
    if (tk.t === 'num') { p++; return tk.v; }
    if (tk.t === 'str') { p++; return tk.v; }
    if (tk.t === '(') { p++; const e = parseComparison(); eat(peek() && peek().t === ')'); return e; }
    if (tk.t === 'op' && tk.v === '-') { p++; const e = parsePrimary(); return { $multiply: [-1, e] }; }
    if (tk.t === 'id') {
      p++;
      // function call?
      if (peek() && peek().t === '(') {
        p++;
        const args = [];
        if (!peek() || peek().t !== ')') {
          args.push(parseComparison());
          while (peek() && peek().t === ',') { p++; args.push(parseComparison()); }
        }
        eat(peek() && peek().t === ')');
        const fn = FUNCS[tk.v.toLowerCase()];
        if (!fn) throw new Error(`Unknown function "${tk.v}"`);
        return { [fn]: args };
      }
      // identifier → field reference
      const name = tk.v.startsWith('$') ? tk.v : `$${tk.v}`;
      return name;
    }
    throw new Error('Formula syntax error');
  }

  const ast = parseComparison();
  if (p !== tokens.length) throw new Error('Trailing tokens in formula');
  return ast;
}

// Compile a single join descriptor into the $lookup (+ $unwind / $addFields /
// $project) stages it expands to. Shared by the multi-join path and the
// legacy single-join shape.
function compileJoin(j) {
  if (!j) return [];
  // Conditions array preferred; fall back to legacy localField/foreignField.
  const conditions = Array.isArray(j.conditions) && j.conditions.length
    ? j.conditions
    : (j.localField && j.foreignField
      ? [{ localField: j.localField, foreignField: j.foreignField }]
      : []);
  const validConds = conditions.filter((c) => c && c.localField && c.foreignField);
  if (!j.from || !validConds.length || !j.as) return [];

  const fields = Array.isArray(j.fields) ? j.fields.filter(Boolean) : [];
  const useSubpipeline = validConds.length > 1 || fields.length > 0;
  const stages = [];

  if (useSubpipeline) {
    const letVars = {};
    const matchExprs = [];
    validConds.forEach((c, i) => {
      const v = `lf_${i}`;
      letVars[v] = `$${c.localField}`;
      matchExprs.push({ $eq: [`$${c.foreignField}`, `$$${v}`] });
    });
    const pipeline = [
      { $match: { $expr: matchExprs.length === 1 ? matchExprs[0] : { $and: matchExprs } } },
    ];
    if (fields.length) {
      // Include the 'attributes' wrapper alongside the explicit fields so that
      // attribute-typed fields stored inside an 'attributes' sub-document
      // (e.g. InstrumentAttribute.attributes.LOANAMOUNT) are accessible.
      // The outer $addFields uses $ifNull to resolve through the wrapper.
      const proj = { _id: 1, attributes: 1 };
      for (const f of fields) proj[f] = 1;
      pipeline.push({ $project: proj });
    }
    stages.push({ $lookup: { from: j.from, let: letVars, pipeline, as: j.as } });
  } else {
    const c = validConds[0];
    stages.push({
      $lookup: { from: j.from, localField: c.localField, foreignField: c.foreignField, as: j.as },
    });
  }

  if (j.relationship === 'one') {
    stages.push({
      $unwind: { path: `$${j.as}`, preserveNullAndEmptyArrays: j.unmatched !== 'drop' },
    });
  } else if (j.unmatched === 'drop') {
    stages.push({ $match: { [`${j.as}.0`]: { $exists: true } } });
  }

  // Hoist selected fields to top-level scalars so the table shows actual values
  // instead of a JSON blob.
  if (fields.length && j.relationship === 'one') {
    // One-to-one: reference the unwound document's fields directly.
    // Use $ifNull to handle fields stored inside an 'attributes' wrapper sub-
    // document (e.g. InstrumentAttribute stores custom attrs under .attributes).
    const addFields = {};
    for (const f of fields) {
      const safe = String(f).replace(/[^A-Za-z0-9_]/g, '_');
      addFields[`${j.as}_${safe}`] = { $ifNull: [`$${j.as}.${f}`, `$${j.as}.attributes.${f}`] };
    }
    stages.push({ $addFields: addFields });
    stages.push({ $project: { [j.as]: 0 } });
  } else if (fields.length) {
    // Many-to-many with selected fields: extract each field as a flat scalar
    // array via $map so the table renders "val1, val2" instead of a JSON blob.
    // $ifNull on each elem handles the 'attributes' wrapper pattern.
    const addFields = {};
    for (const f of fields) {
      const safe = String(f).replace(/[^A-Za-z0-9_]/g, '_');
      addFields[`${j.as}_${safe}`] = {
        $map: {
          input: { $ifNull: [`$${j.as}`, []] }, as: 'elem',
          in: { $ifNull: [`$$elem.${f}`, `$$elem.attributes.${f}`] },
        },
      };
    }
    stages.push({ $addFields: addFields });
    stages.push({ $project: { [j.as]: 0 } });
  }
  return stages;
}

function compileStep(step) {
  if (!step || step.disabled) return [];
  switch (step.kind) {
    case 'filter': {
      const $match = buildMatch(step.filters);
      return Object.keys($match).length ? [{ $match }] : [];
    }
    case 'combine': {
      // A combine step now supports multiple joins in one go via `step.joins`.
      // Backwards compatible: if no `joins`, fall back to the legacy top-level
      // shape (`from` / `as` / `conditions` / `localField` / `foreignField` /
      // `fields` / `relationship` / `unmatched`) which describes a single join.
      const joins = Array.isArray(step.joins) && step.joins.length
        ? step.joins
        : [{
          from: step.from, as: step.as,
          conditions: step.conditions,
          localField: step.localField, foreignField: step.foreignField,
          fields: step.fields,
          relationship: step.relationship, unmatched: step.unmatched,
        }];
      const stages = [];
      for (const j of joins) stages.push(...compileJoin(j));
      return stages;
    }
    case 'addColumn': {
      // Accepts the new multi-column shape { columns: [{name, formula}] } and
      // falls back to legacy { name, formula } on the step root.
      const defs = Array.isArray(step.columns) && step.columns.length
        ? step.columns
        : (step.name ? [{ name: step.name, formula: step.formula }] : []);
      const stages = [];
      for (const def of defs) {
        if (!def.name || !def.formula) continue;
        let expr;
        try { expr = parseFormula(def.formula); }
        catch (e) { throw new Error(`Formula error in "${def.name}": ${e.message}`); }
        // One stage per column so later columns can reference earlier ones.
        stages.push({ $addFields: { [def.name]: expr } });
      }
      return stages;
    }
    case 'summarize':
      return buildSummarize(step.groupBys, step.metrics);
    case 'sort': {
      // Accept the new multi-field shape { sorts: [{field, dir}] } and fall
      // back to the legacy single-field { field, dir } so old datasets keep working.
      const list = Array.isArray(step.sorts) && step.sorts.length
        ? step.sorts
        : (step.field ? [{ field: step.field, dir: step.dir }] : []);
      const cleaned = list.filter((r) => r && r.field);
      if (!cleaned.length) return [];
      const $sort = {};
      for (const r of cleaned) $sort[r.field] = r.dir === 'asc' ? 1 : -1;
      return [{ $sort }];
    }
    case 'keepTopN':
      if (!step.limit || step.limit <= 0) return [];
      return [{ $limit: Number(step.limit) }];
    case 'chooseColumns': {
      if (!step.columns || !step.columns.length) return [];
      const proj = {};
      const include = step.mode !== 'drop';
      for (const c of step.columns) proj[c] = include ? 1 : 0;
      return [{ $project: proj }];
    }
    case 'rename': {
      // Rename columns: copy each `from` to its new `to` name, then drop the
      // old names. Accepts the multi-rename shape { renames: [{from,to}] } and
      // falls back to a single legacy { from, to } on the step root.
      const list = Array.isArray(step.renames) && step.renames.length
        ? step.renames
        : (step.from ? [{ from: step.from, to: step.to }] : []);
      const cleaned = list.filter((r) => r && r.from && r.to && r.from !== r.to);
      if (!cleaned.length) return [];
      const addFields = {};
      for (const r of cleaned) addFields[r.to] = `$${r.from}`;
      // Don't drop a source field that is itself the target of another rename.
      const targets = new Set(cleaned.map((r) => r.to));
      const proj = {};
      for (const r of cleaned) if (!targets.has(r.from)) proj[r.from] = 0;
      const stages = [{ $addFields: addFields }];
      if (Object.keys(proj).length) stages.push({ $project: proj });
      return stages;
    }
    default:
      return [];
  }
}

function compileSteps(steps) {
  const out = [];
  for (const s of steps || []) out.push(...compileStep(s));
  return out;
}

module.exports = { compileSteps, compileStep, parseFormula };
