/**
 * Frontend mirror of backend/src/services/dataset-compiler.service.js
 * — used only for the live "View pipeline" toggle and disable-step badges.
 * The backend remains the source of truth at save time.
 */

const FUNCS = {
  if: '$cond', round: '$round', abs: '$abs', ceil: '$ceil', floor: '$floor',
  min: '$min', max: '$max', concat: '$concat', upper: '$toUpper', lower: '$toLower',
  year: '$year', month: '$month', day: '$dayOfMonth', coalesce: '$ifNull', sum: '$add',
};

function tokenize(src) {
  const tokens = []; let i = 0;
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
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== c) { s += src[j]; j++; }
      if (j === src.length) throw new Error('Unterminated string');
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
    throw new Error(`Unexpected "${c}"`);
  }
  return tokens;
}

export function parseFormula(src) {
  const tokens = tokenize(src);
  let p = 0;
  const peek = () => tokens[p];
  const eat = (cond) => { if (!cond) throw new Error('Syntax error'); return tokens[p++]; };
  function parseCmp() {
    let l = parseAS();
    while (peek() && peek().t === 'op' && ['==', '!=', '>', '>=', '<', '<='].includes(peek().v)) {
      const op = tokens[p++].v; const r = parseAS();
      const map = { '==': '$eq', '!=': '$ne', '>': '$gt', '>=': '$gte', '<': '$lt', '<=': '$lte' };
      l = { [map[op]]: [l, r] };
    }
    return l;
  }
  function parseAS() {
    let l = parseMD();
    while (peek() && peek().t === 'op' && '+-'.includes(peek().v)) {
      const op = tokens[p++].v; const r = parseMD();
      l = op === '+' ? { $add: [l, r] } : { $subtract: [l, r] };
    }
    return l;
  }
  function parseMD() {
    let l = parsePr();
    while (peek() && peek().t === 'op' && '*/'.includes(peek().v)) {
      const op = tokens[p++].v; const r = parsePr();
      l = op === '*' ? { $multiply: [l, r] } : { $divide: [l, r] };
    }
    return l;
  }
  function parsePr() {
    const tk = peek(); if (!tk) throw new Error('Unexpected end');
    if (tk.t === 'num') { p++; return tk.v; }
    if (tk.t === 'str') { p++; return tk.v; }
    if (tk.t === '(') { p++; const e = parseCmp(); eat(peek() && peek().t === ')'); return e; }
    if (tk.t === 'op' && tk.v === '-') { p++; const e = parsePr(); return { $multiply: [-1, e] }; }
    if (tk.t === 'id') {
      p++;
      if (peek() && peek().t === '(') {
        p++;
        const args = [];
        if (!peek() || peek().t !== ')') {
          args.push(parseCmp());
          while (peek() && peek().t === ',') { p++; args.push(parseCmp()); }
        }
        eat(peek() && peek().t === ')');
        const fn = FUNCS[tk.v.toLowerCase()];
        if (!fn) throw new Error(`Unknown function "${tk.v}"`);
        return { [fn]: args };
      }
      return tk.v.startsWith('$') ? tk.v : `$${tk.v}`;
    }
    throw new Error('Syntax error');
  }
  const ast = parseCmp();
  if (p !== tokens.length) throw new Error('Trailing tokens');
  return ast;
}

function buildMatch(filters) {
  const m = {};
  for (const f of filters || []) {
    if (!f.field || !f.operator) continue;
    if (f.operator === '$exists') m[f.field] = { $exists: true, $ne: null };
    else if (f.operator === '$in') m[f.field] = { $in: String(f.value ?? '').split(',').map((v) => v.trim()).filter(Boolean) };
    else if (f.operator === '$regex') m[f.field] = { $regex: String(f.value ?? ''), $options: 'i' };
    else {
      const num = ['$gt', '$gte', '$lt', '$lte'].includes(f.operator) ? Number(f.value) : NaN;
      m[f.field] = { [f.operator]: Number.isFinite(num) ? num : f.value };
    }
  }
  return m;
}

// Compile a single join descriptor. Mirrors backend's compileJoin so the live
// preview matches the saved pipeline exactly.
function compileJoin(j) {
  if (!j) return [];
  const conditions = Array.isArray(j.conditions) && j.conditions.length
    ? j.conditions
    : (j.localField && j.foreignField
      ? [{ localField: j.localField, foreignField: j.foreignField }]
      : []);
  const valid = conditions.filter((c) => c && c.localField && c.foreignField);
  if (!j.from || !valid.length || !j.as) return [];
  const fields = Array.isArray(j.fields) ? j.fields.filter(Boolean) : [];
  const useSub = valid.length > 1 || fields.length > 0;

  const out = [];
  if (useSub) {
    const letVars = {}; const exprs = [];
    valid.forEach((c, i) => {
      const v = `lf_${i}`;
      letVars[v] = `$${c.localField}`;
      exprs.push({ $eq: [`$${c.foreignField}`, `$$${v}`] });
    });
    const pipeline = [{ $match: { $expr: exprs.length === 1 ? exprs[0] : { $and: exprs } } }];
    if (fields.length) {
      // Include the 'attributes' wrapper alongside the explicit fields so that
      // attribute-typed fields stored inside an 'attributes' sub-document
      // (e.g. InstrumentAttribute.attributes.LOANAMOUNT) are accessible.
      // The outer $addFields uses $ifNull to resolve through the wrapper.
      const proj = { _id: 1, attributes: 1 };
      for (const f of fields) proj[f] = 1;
      pipeline.push({ $project: proj });
    }
    out.push({ $lookup: { from: j.from, let: letVars, pipeline, as: j.as } });
  } else {
    const c = valid[0];
    out.push({ $lookup: { from: j.from, localField: c.localField, foreignField: c.foreignField, as: j.as } });
  }
  if (j.relationship === 'one') {
    out.push({ $unwind: { path: `$${j.as}`, preserveNullAndEmptyArrays: j.unmatched !== 'drop' } });
  } else if (j.unmatched === 'drop') {
    out.push({ $match: { [`${j.as}.0`]: { $exists: true } } });
  }
  if (fields.length && j.relationship === 'one') {
    // One-to-one: hoist each field as a top-level scalar.
    // Use $ifNull to handle fields stored inside an 'attributes' wrapper sub-
    // document (e.g. InstrumentAttribute stores custom attrs under .attributes).
    const addFields = {};
    for (const f of fields) {
      const safe = String(f).replace(/[^A-Za-z0-9_]/g, '_');
      addFields[`${j.as}_${safe}`] = { $ifNull: [`$${j.as}.${f}`, `$${j.as}.attributes.${f}`] };
    }
    out.push({ $addFields: addFields });
    out.push({ $project: { [j.as]: 0 } });
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
    out.push({ $addFields: addFields });
    out.push({ $project: { [j.as]: 0 } });
  }
  return out;
}

function compileStep(s) {
  if (!s || s.disabled) return [];
  switch (s.kind) {
    case 'filter': {
      const m = buildMatch(s.filters);
      return Object.keys(m).length ? [{ $match: m }] : [];
    }
    case 'combine': {
      // A combine step now supports multiple joins via `s.joins`. Legacy
      // single-join (top-level fields on the step) is still accepted.
      const joins = Array.isArray(s.joins) && s.joins.length
        ? s.joins
        : [{
          from: s.from, as: s.as,
          conditions: s.conditions,
          localField: s.localField, foreignField: s.foreignField,
          fields: s.fields,
          relationship: s.relationship, unmatched: s.unmatched,
        }];
      const out = [];
      for (const j of joins) out.push(...compileJoin(j));
      return out;
    }
    case 'addColumn': {
      // Accepts the new multi-column shape { columns: [{name, formula}] } and
      // falls back to legacy { name, formula } on the step root.
      const defs = Array.isArray(s.columns) && s.columns.length
        ? s.columns
        : (s.name && s.formula ? [{ name: s.name, formula: s.formula }] : []);
      const out = [];
      for (const def of defs) {
        if (!def.name || !def.formula) continue;
        try {
          // One $addFields per column so column N can reference column N-1.
          out.push({ $addFields: { [def.name]: parseFormula(def.formula) } });
        } catch { /* swallow on client; backend validates at save */ }
      }
      return out;
    }
    case 'summarize': {
      const safe = (p) => String(p).replace(/\./g, '_');
      const groups = (s.groupBys || []).filter(Boolean);
      let id; if (groups.length === 0) id = null;
      else if (groups.length === 1) id = `$${groups[0]}`;
      else id = Object.fromEntries(groups.map((g) => [safe(g), `$${g}`]));
      const $group = { _id: id };
      for (const m of s.metrics || []) {
        const alias = m.alias || (m.agg === '$count' ? 'count' : `${m.agg.replace('$', '')}_${safe(m.field || 'val')}`);
        if (m.agg === '$count') $group[alias] = { $sum: 1 };
        else if (m.field) $group[alias] = { [m.agg]: `$${m.field}` };
      }
      const $project = { _id: 0 };
      if (groups.length === 1) $project[groups[0]] = '$_id';
      else if (groups.length > 1) for (const g of groups) $project[g] = `$_id.${safe(g)}`;
      for (const k of Object.keys($group)) if (k !== '_id') $project[k] = 1;
      return [{ $group }, { $project }];
    }
    case 'sort': {
      // Multi-field sort. Accepts the new shape `sorts: [{field, dir}]`
      // and falls back to the legacy single-field `field` / `dir` so saved
      // datasets keep working without a migration.
      const list = Array.isArray(s.sorts) && s.sorts.length
        ? s.sorts
        : (s.field ? [{ field: s.field, dir: s.dir }] : []);
      const cleaned = list.filter((r) => r && r.field);
      if (!cleaned.length) return [];
      const $sort = {};
      for (const r of cleaned) $sort[r.field] = r.dir === 'asc' ? 1 : -1;
      return [{ $sort }];
    }
    case 'keepTopN':
      if (!s.limit || s.limit <= 0) return [];
      return [{ $limit: Number(s.limit) }];
    case 'chooseColumns': {
      if (!s.columns?.length) return [];
      const proj = {}; const inc = s.mode !== 'drop';
      for (const c of s.columns) proj[c] = inc ? 1 : 0;
      return [{ $project: proj }];
    }
    case 'rename': {
      const list = Array.isArray(s.renames) && s.renames.length
        ? s.renames
        : (s.from ? [{ from: s.from, to: s.to }] : []);
      const cleaned = list.filter((r) => r && r.from && r.to && r.from !== r.to);
      if (!cleaned.length) return [];
      const addFields = {};
      for (const r of cleaned) addFields[r.to] = `$${r.from}`;
      const targets = new Set(cleaned.map((r) => r.to));
      const proj = {};
      for (const r of cleaned) if (!targets.has(r.from)) proj[r.from] = 0;
      const out = [{ $addFields: addFields }];
      if (Object.keys(proj).length) out.push({ $project: proj });
      return out;
    }
    default: return [];
  }
}

export function compileSteps(steps) {
  const out = []; for (const s of steps || []) try { out.push(...compileStep(s)); } catch (e) { /* swallow on client */ }
  return out;
}

export function describeStep(s) {
  switch (s?.kind) {
    case 'filter': return `Keeps rows matching ${s.filters?.length || 0} condition(s)`;
    case 'combine': {
      const joins = Array.isArray(s.joins) && s.joins.length
        ? s.joins
        : [{
          from: s.from, as: s.as, conditions: s.conditions,
          localField: s.localField, foreignField: s.foreignField,
          fields: s.fields, relationship: s.relationship, unmatched: s.unmatched,
        }];
      const named = joins.filter((j) => j && j.from);
      if (named.length === 0) return 'Combines with …';
      if (named.length > 1) return `Combines with ${named.length} tables: ${named.map((j) => j.from).join(', ')}`;
      const j = named[0];
      const conds = Array.isArray(j.conditions) && j.conditions.length
        ? j.conditions
        : (j.localField || j.foreignField ? [{ localField: j.localField, foreignField: j.foreignField }] : []);
      const valid = conds.filter((c) => c && c.localField && c.foreignField);
      const fieldCount = Array.isArray(j.fields) ? j.fields.filter(Boolean).length : 0;
      const fieldsPart = fieldCount ? ` (${fieldCount} field${fieldCount === 1 ? '' : 's'})` : '';
      if (!valid.length) return `Combines with ${j.from}${fieldsPart}`;
      if (valid.length === 1) {
        return `Combines with ${j.from} on ${valid[0].localField} = ${valid[0].foreignField}${fieldsPart}`;
      }
      return `Combines with ${j.from} on ${valid.length} conditions${fieldsPart}`;
    }
    case 'addColumn': {
      const defs = Array.isArray(s.columns) && s.columns.length
        ? s.columns : (s.name ? [{ name: s.name, formula: s.formula }] : []);
      if (!defs.length) return 'Adds a column';
      if (defs.length === 1) return `Adds "${defs[0].name || '…'}" = ${defs[0].formula || '…'}`;
      return `Adds ${defs.length} columns: ${defs.map((d) => d.name || '…').join(', ')}`;
    }
    case 'summarize': return `Groups by ${(s.groupBys || []).join(', ') || '(all rows)'} → ${(s.metrics || []).length} metric(s)`;
    case 'sort': {
      const list = Array.isArray(s.sorts) && s.sorts.length
        ? s.sorts
        : (s.field ? [{ field: s.field, dir: s.dir }] : []);
      const valid = list.filter((r) => r && r.field);
      if (!valid.length) return 'Sorts by ?';
      if (valid.length === 1) return `Sorts by ${valid[0].field} (${valid[0].dir || 'desc'})`;
      return `Sorts by ${valid.length} fields`;
    }
    case 'keepTopN': return `Keeps the top ${s.limit || 100} rows`;
    case 'chooseColumns': return `${s.mode === 'drop' ? 'Removes' : 'Keeps only'} ${(s.columns || []).length} column(s)`;
    case 'rename': {
      const list = Array.isArray(s.renames) && s.renames.length
        ? s.renames : (s.from ? [{ from: s.from, to: s.to }] : []);
      const valid = list.filter((r) => r && r.from && r.to);
      if (!valid.length) return 'Renames a column';
      if (valid.length === 1) return `Renames ${valid[0].from} → ${valid[0].to}`;
      return `Renames ${valid.length} columns`;
    }
    default: return '';
  }
}

export const STEP_LABELS = {
  filter: 'Filter rows',
  combine: 'Combine with another table',
  addColumn: 'New column',
  summarize: 'Summarize',
  sort: 'Sort',
  keepTopN: 'Limit rows',
  chooseColumns: 'Choose columns',
  rename: 'Rename column',
};
