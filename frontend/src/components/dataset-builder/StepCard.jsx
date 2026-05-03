import React, { useEffect, useRef, useState } from 'react';
import {
  Box, Stack, Typography, IconButton, TextField, Select, MenuItem, FormControl,
  InputLabel, Chip, Button, Tooltip, Paper, Popover, List, ListItemButton,
  ListItemIcon, ListItemText, Divider,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import FilterListIcon from '@mui/icons-material/FilterList';
import FunctionsIcon from '@mui/icons-material/Functions';
import GroupWorkIcon from '@mui/icons-material/GroupWork';
import SortIcon from '@mui/icons-material/Sort';
import Filter1Icon from '@mui/icons-material/Filter1';
import api from '../../hooks/useQuery';
import FilterBuilder from '../query-builder/FilterBuilder';
import SummarizePanel from '../query-builder/SummarizePanel';
import FieldPicker from '../query-builder/FieldPicker';
import { STEP_LABELS, describeStep, parseFormula } from './compileSteps';

// Module-level cache shared across all StepCard instances in the same session.
// Avoids duplicate $sample-based schema inference calls when multiple step
// editors (Filter, AddColumn, ChooseColumns) reference the same collection.
const _fieldCache = {};
const _fieldPending = {};
function fetchFields(collection) {
  if (!collection) return Promise.resolve([]);
  if (_fieldCache[collection]) return Promise.resolve(_fieldCache[collection]);
  if (_fieldPending[collection]) return _fieldPending[collection];
  const p = api.get(`/schema/collections/${collection}/fields`)
    .then((r) => { _fieldCache[collection] = r.data; return r.data; })
    .catch(() => [])
    .finally(() => { delete _fieldPending[collection]; });
  _fieldPending[collection] = p;
  return p;
}

// Derives the extra column names injected into the data stream by preceding
// steps. Combine steps hoist selected foreign fields to flat scalars;
// addColumn steps add named computed fields. Used by ChooseColumnsEditor and
// AddColumnEditor so they can show joined/computed columns in their pickers.
function getDerivedColumns(precedingSteps) {
  const cols = [];
  for (const s of precedingSteps || []) {
    if (s.disabled) continue;
    if (s.kind === 'combine') {
      const joins = Array.isArray(s.joins) && s.joins.length
        ? s.joins
        : [{ from: s.from, as: s.as, fields: s.fields || [], relationship: s.relationship }];
      for (const j of joins) {
        if (!j.as) continue;
        const fields = Array.isArray(j.fields) ? j.fields.filter(Boolean) : [];
        if (fields.length > 0 && j.relationship === 'one') {
          // One-to-one: flat scalar columns.
          for (const f of fields) {
            const safe = String(f).replace(/[^A-Za-z0-9_]/g, '_');
            cols.push({ name: `${j.as}_${safe}`, source: j.from || 'joined table', originalField: f });
          }
        } else if (fields.length > 0) {
          // Many-to-many with selected fields: each field becomes a scalar-array column.
          for (const f of fields) {
            const safe = String(f).replace(/[^A-Za-z0-9_]/g, '_');
            cols.push({ name: `${j.as}_${safe}`, source: j.from || 'joined table', originalField: f });
          }
        } else {
          cols.push({ name: j.as, source: j.from || 'joined table' });
        }
      }
    } else if (s.kind === 'addColumn') {
      const defs = Array.isArray(s.columns) && s.columns.length
        ? s.columns : (s.name ? [{ name: s.name }] : []);
      for (const d of defs) {
        if (d.name) cols.push({ name: d.name, source: 'computed' });
      }
    } else if (s.kind === 'summarize') {
      // Metric aliases produced by the summarize step are new columns not in
      // the source schema. groupBys pass through with their original names so
      // they are already shown by FieldPicker via the schema fetch.
      const safe = (p) => String(p).replace(/\./g, '_');
      for (const m of s.metrics || []) {
        const alias = m.alias ||
          (m.agg === '$count' ? 'count' : `${m.agg.replace('$', '')}_${safe(m.field || 'val')}`);
        cols.push({ name: alias, source: 'Summarize metrics' });
      }
    }
  }
  return cols;
}

const KIND_COLOR = {
  filter: '#fef3c7', combine: '#dbeafe', addColumn: '#ede9fe',
  summarize: '#fce7f3', sort: '#dcfce7', keepTopN: '#fee2e2', chooseColumns: '#e0f2fe',
};

export function StepCard({ step, index, total, sourceCollection, onChange, onDelete, rowCount, defaultExpanded = false, precedingSteps = [] }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // All field edits accumulate in a local draft. Only "Save step" commits to the parent.
  const [draft, setDraft] = useState(step);

  // Sync draft when the committed step changes externally (e.g., history restore).
  // Uses JSON comparison so this is a no-op after a Save-step commit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setDraft(step); }, [JSON.stringify(step)]);

  // Keep a ref so update() always reads the latest draft without stale closure issues.
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const isDirty = JSON.stringify(draft) !== JSON.stringify(step);

  // Field edits go into the draft only — nothing is committed until "Save step".
  const update = (patch) => {
    const next = { ...draftRef.current, ...patch };
    setDraft(next);
  };

  // Enable/disable commits immediately and pre-syncs the draft so the incoming
  // step-prop change doesn't reset other pending draft edits.
  const toggle = () => {
    const next = { ...draft, disabled: !draft.disabled };
    onChange(next);
    setDraft(next);
  };

  return (
    <Box sx={{
      border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5,
      bgcolor: draft.disabled ? '#f8fafc' : '#fff',
      borderLeft: `3px solid ${KIND_COLOR[draft.kind] || '#cbd5e1'}`,
      opacity: draft.disabled ? 0.6 : 1,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: expanded ? 1.5 : 0 }}>
        <Chip size="small" label={`${index + 1}`} sx={{ height: 22, fontWeight: 700 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {STEP_LABELS[draft.kind] || draft.kind}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }} noWrap>
          {describeStep(draft)}
        </Typography>
        {typeof rowCount === 'number' && (
          <Tooltip title="Rows after this step">
            <Chip size="small" label={`${rowCount.toLocaleString()} rows`} />
          </Tooltip>
        )}
        {isDirty && (
          <Chip size="small" label="Unsaved" color="warning" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
        )}
        <Tooltip title={draft.disabled ? 'Enable' : 'Disable'}>
          <IconButton size="small" onClick={toggle}>
            {draft.disabled ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete step">
          <IconButton size="small" onClick={onDelete}><DeleteOutlineIcon fontSize="small" /></IconButton>
        </Tooltip>
        <Tooltip title={expanded ? 'Collapse' : 'Expand'}>
          <IconButton size="small" onClick={() => setExpanded((v) => !v)} sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary' } }}>
            {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>

      {expanded && (
        <Box sx={{ pl: 0.5 }}>
          <StepBody step={draft} sourceCollection={sourceCollection} update={update} precedingSteps={precedingSteps} />
          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
            <Button
              size="small"
              disabled={!isDirty}
              onClick={() => setDraft(step)}
              sx={{
                borderRadius: 2, fontWeight: 600, textTransform: 'none',
                color: '#475569', border: '1px solid #e2e8f0', bgcolor: '#f8fafc',
                '&:hover': { bgcolor: '#f1f5f9', borderColor: '#cbd5e1' },
                '&.Mui-disabled': { bgcolor: '#f8fafc', color: '#cbd5e1' },
              }}
            >
              Clear
            </Button>
            <Button
              size="small"
              disabled={!isDirty}
              onClick={() => onChange(draft)}
              sx={{
                borderRadius: 2, fontWeight: 700, textTransform: 'none',
                bgcolor: '#14213d', color: '#fff', boxShadow: 'none',
                '&:hover': { bgcolor: '#0a1628', boxShadow: 'none' },
                '&.Mui-disabled': { bgcolor: '#e2e8f0', color: '#94a3b8' },
              }}
            >
              Save step
            </Button>
          </Stack>
        </Box>
      )}
    </Box>
  );
}

function StepBody({ step, sourceCollection, update, precedingSteps }) {
  switch (step.kind) {
    case 'filter': {
      const filterDerivedCols = getDerivedColumns(precedingSteps);
      return (
        <FilterBuilder
          collection={sourceCollection}
          filters={step.filters || []}
          onChange={(filters) => update({ filters })}precedingSteps={precedingSteps} 
          extraFields={filterDerivedCols}
        />
      );
    }
    case 'combine':
      return <CombineEditor step={step} sourceCollection={sourceCollection} update={update} />;
    case 'addColumn':
      return <AddColumnEditor step={step} sourceCollection={sourceCollection} update={update} precedingSteps={precedingSteps} />;
    case 'summarize': {
      const summarizeExtraFields = getDerivedColumns(precedingSteps);
      return (
        <SummarizePanel
          collection={sourceCollection}
          groupBys={step.groupBys || []}
          metrics={step.metrics || []}
          onGroupBysChange={(groupBys) => update({ groupBys })}
          onMetricsChange={(metrics) => update({ metrics })}
          extraFields={summarizeExtraFields}
        />
      );
    }
    case 'sort':
      return <SortEditor step={step} sourceCollection={sourceCollection} update={update} precedingSteps={precedingSteps} />;
    case 'keepTopN':
      return (
        <TextField
          size="small" type="number" label="Limit rows"
          value={step.limit ?? 100}
          onChange={(e) => update({ limit: Number(e.target.value) })}
          sx={{ maxWidth: 180 }}
        />
      );
    case 'chooseColumns':
      return <ChooseColumnsEditor step={step} sourceCollection={sourceCollection} update={update} precedingSteps={precedingSteps} />;
    default:
      return null;
  }
}

// Normalize a join's match conditions. Saved datasets may use the legacy
// single-field shape (`localField` + `foreignField`); the editor always
// works with an array so the UI for compound keys is uniform.
function getJoinConditions(join) {
  if (Array.isArray(join.conditions) && join.conditions.length) return join.conditions;
  if (join.localField || join.foreignField) {
    return [{ localField: join.localField || '', foreignField: join.foreignField || '' }];
  }
  return [{ localField: '', foreignField: '' }];
}

// Normalize a combine step into an array of joins. New shape: `step.joins`.
// Legacy: top-level `from` / `as` / `conditions` / `fields` / etc. = one join.
function getJoins(step) {
  if (Array.isArray(step.joins) && step.joins.length) return step.joins;
  return [{
    from: step.from || '',
    as: step.as || '',
    conditions: step.conditions || (step.localField
      ? [{ localField: step.localField, foreignField: step.foreignField || '' }]
      : []),
    fields: step.fields || [],
    relationship: step.relationship || 'one',
    unmatched: step.unmatched || 'keep',
  }];
}

function CombineEditor({ step, sourceCollection, update }) {
  const [collections, setCollections] = useState([]);
  const [localFields, setLocalFields] = useState([]);

  useEffect(() => {
    api.get('/schema/collections')
      .then((r) => setCollections(r.data))
      .catch(() => setCollections([]));
  }, []);
  useEffect(() => {
    if (!sourceCollection) return;
    fetchFields(sourceCollection).then(setLocalFields);
  }, [sourceCollection]);

  const joins = getJoins(step);
  // Keep a ref to the latest joins so that callbacks (e.g. auto-suggest effects
  // that fire after an async foreign-field fetch) always merge against the
  // most-recent snapshot and never overwrite a concurrent change.
  const joinsRef = React.useRef(joins);
  joinsRef.current = joins;

  const setJoins = (next) => {
    // Mirror the first join into the legacy top-level fields so older readers
    // (and saved datasets that haven't been re-saved yet) keep working.
    const first = next[0] || {};
    const firstCond = first.conditions?.[0] || {};
    update({
      joins: next,
      from: first.from || '',
      as: first.as || '',
      conditions: first.conditions || [],
      fields: first.fields || [],
      relationship: first.relationship || 'one',
      unmatched: first.unmatched || 'keep',
      localField: firstCond.localField || '',
      foreignField: firstCond.foreignField || '',
    });
  };
  // Always read from the ref so the callback is never stale, even when called
  // from inside a JoinPanel useEffect that fires after an async fetch.
  const updateJoin = React.useCallback((i, patch) => {
    setJoins(joinsRef.current.map((j, idx) => (idx === i ? { ...j, ...patch } : j)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const addJoin = () => setJoins([...joinsRef.current, {
    from: '', as: '', conditions: [{ localField: '', foreignField: '' }],
    fields: [], relationship: 'one', unmatched: 'keep',
  }]);
  const removeJoin = (i) => setJoins(joinsRef.current.filter((_, idx) => idx !== i));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {joins.map((join, i) => (
        <JoinPanel
          // Use the index as a stable key. Keying on join.as caused the panel
          // to remount on every keystroke in "Save as column", resetting
          // foreignFields state and causing focus loss.
          key={i}
          join={join}
          index={i}
          total={joins.length}
          sourceCollection={sourceCollection}
          collections={collections}
          localFields={localFields}
          onChange={(patch) => updateJoin(i, patch)}
          onRemove={() => removeJoin(i)}
        />
      ))}
      <Button
        size="small"
        startIcon={<AddIcon />}
        onClick={addJoin}
        sx={{
          alignSelf: 'flex-start', borderRadius: 2, fontWeight: 600, textTransform: 'none',
          color: '#1e40af', border: '1px solid #bfdbfe', bgcolor: '#eff6ff',
          '&:hover': { bgcolor: '#dbeafe', borderColor: '#93c5fd' },
        }}
      >
        Combine with another table
      </Button>
    </Box>
  );
}

function JoinPanel({ join, index, total, sourceCollection, collections, localFields, onChange, onRemove }) {
  const [foreignFields, setForeignFields] = useState([]);

  useEffect(() => {
    if (!join.from) { setForeignFields([]); return; }
    fetchFields(join.from).then(setForeignFields);
  }, [join.from]);

  const conditions = getJoinConditions(join);
  const setConditions = (next) => onChange({
    conditions: next,
    // Mirror first condition into legacy fields (per-join).
    localField: next[0]?.localField || '',
    foreignField: next[0]?.foreignField || '',
  });
  const updateCondition = (i, patch) =>
    setConditions(conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const addCondition = () => setConditions([...conditions, { localField: '', foreignField: '' }]);
  const removeCondition = (i) => setConditions(conditions.filter((_, idx) => idx !== i));

  // Auto-suggest a join key the first time a foreign collection is picked.
  useEffect(() => {
    if (!join.from || !localFields.length || !foreignFields.length) return;
    if (conditions[0]?.localField && conditions[0]?.foreignField) return;
    const localNames = new Set(localFields.map((f) => f.name.toLowerCase()));
    const foreignNames = new Set(foreignFields.map((f) => f.name.toLowerCase()));
    const candidates = [
      `${join.from.toLowerCase().replace(/s$/, '')}id`,
      `${join.from.toLowerCase().replace(/s$/, '')}_id`,
      `${join.from.toLowerCase()}id`,
      'customerid', 'accountid', 'productid', 'transactionid', 'userid',
    ];
    for (const c of candidates) {
      if (localNames.has(c) && (foreignNames.has('_id') || foreignNames.has(c))) {
        const lf = localFields.find((f) => f.name.toLowerCase() === c)?.name;
        const ff = foreignFields.find((f) => f.name.toLowerCase() === '_id')?.name
          || foreignFields.find((f) => f.name.toLowerCase() === c)?.name;
        if (lf && ff) {
          setConditions([{ localField: lf, foreignField: ff }]);
          if (!join.as) onChange({ as: join.from });
        }
        return;
      }
    }
  }, [join.from, localFields, foreignFields]); // eslint-disable-line

  const selectedFields = join.fields || [];
  const toggleField = (name) => {
    const next = selectedFields.includes(name)
      ? selectedFields.filter((f) => f !== name)
      : [...selectedFields, name];
    // Selecting specific fields means the compiler hoists them to flat scalar
    // columns (e.g. subledgerMapping_accountSubType). That only works with
    // one-to-one joins, so automatically switch when fields are first chosen.
    // The user can still manually change it back to 'many' if needed.
    const patch = { fields: next };
    if (next.length > 0 && join.relationship !== 'one') patch.relationship = 'one';
    onChange(patch);
  };

  return (
    <Box sx={{
      border: '1px dashed', borderColor: 'divider', borderRadius: 1,
      p: 2, display: 'flex', flexDirection: 'column', gap: 2,
      bgcolor: '#fafbff',
    }}>
      {/* Header: which join + remove */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Chip
          size="small"
          label={total > 1 ? `Join ${index + 1} of ${total}` : 'Join'}
          sx={{ height: 22, fontWeight: 600 }}
        />
        <Box sx={{ flex: 1 }} />
        {total > 1 && (
          <Tooltip title="Remove this join">
            <IconButton size="small" onClick={onRemove} sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Foreign collection */}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 240 }}>
          <InputLabel>Combine with</InputLabel>
          <Select
            label="Combine with"
            value={join.from || ''}
            onChange={(e) => onChange({
              from: e.target.value,
              as: join.as || e.target.value,
              // Reset fields and conditions whenever the foreign table changes
              // so the auto-suggest can pick up the new table's keys. Without
              // this, stale conditions referencing the old table's fields remain
              // and the join silently produces wrong / empty results.
              fields: [],
              conditions: [{ localField: '', foreignField: '' }],
            })}
          >
            {collections.filter((c) => c !== sourceCollection).map((c) => (
              <MenuItem key={c} value={c}>{c}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Conditions (compound key) */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {conditions.map((cond, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 56 }}>
              {i === 0 ? 'where' : 'and'}
            </Typography>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>This.field</InputLabel>
              <Select
                label="This.field"
                value={cond.localField || ''}
                onChange={(e) => updateCondition(i, { localField: e.target.value })}
              >
                {localFields.map((f) => <MenuItem key={f.name} value={f.name}>{f.name}</MenuItem>)}
              </Select>
            </FormControl>
            <Typography variant="body2">=</Typography>
            <FormControl size="small" sx={{ minWidth: 200 }} disabled={!join.from}>
              <InputLabel>Other.field</InputLabel>
              <Select
                label="Other.field"
                value={cond.foreignField || ''}
                onChange={(e) => updateCondition(i, { foreignField: e.target.value })}
              >
                {foreignFields.map((f) => <MenuItem key={f.name} value={f.name}>{f.name}</MenuItem>)}
              </Select>
            </FormControl>
            <Tooltip title="Remove condition">
              <span>
                <IconButton
                  size="small"
                  onClick={() => removeCondition(i)}
                  disabled={conditions.length <= 1}
                  sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary' } }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        ))}
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={addCondition}
          disabled={!join.from}
          sx={{
            alignSelf: 'flex-start', borderRadius: 2, fontWeight: 600, textTransform: 'none',
            color: '#475569', border: '1px solid #e2e8f0', bgcolor: '#f8fafc',
            '&:hover': { bgcolor: '#f1f5f9', borderColor: '#cbd5e1' },
            '&.Mui-disabled': { bgcolor: '#f8fafc', color: '#cbd5e1' },
          }}
        >
          Add another match condition
        </Button>
      </Box>

      {/* Fields to bring in */}
      {join.from && foreignFields.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Typography variant="caption" color="text.secondary">
            Fields to bring in from <strong>{join.from}</strong>
            {selectedFields.length === 0
              ? ' — none selected: the whole joined record appears as a raw JSON column (hard to read). Pick fields below for clean, separate columns.'
              : ` — ${selectedFields.length} selected. Each appears as its own readable column, e.g. ${join.as || join.from}_fieldName. Relationship set to "One match per row" automatically.`}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', maxHeight: 140, overflow: 'auto' }}>
            {foreignFields.map((f) => (
              <Box
                key={f.name}
                component="span"
                onClick={() => toggleField(f.name)}
                sx={{
                  display: 'inline-flex', alignItems: 'center',
                  px: 1, py: 0.25, fontSize: '0.75rem', fontWeight: 500,
                  borderRadius: 1, cursor: 'pointer', userSelect: 'none',
                  bgcolor: selectedFields.includes(f.name) ? '#eff6ff' : '#f8fafc',
                  color: selectedFields.includes(f.name) ? '#1e40af' : '#475569',
                  border: selectedFields.includes(f.name) ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                  '&:hover': { bgcolor: selectedFields.includes(f.name) ? '#dbeafe' : '#e2e8f0' },
                }}
              >
                {f.name}
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Save as / relationship / unmatched */}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <TextField
          size="small" label="Save as column" value={join.as || ''}
          onChange={(e) => onChange({ as: e.target.value })}
          sx={{ minWidth: 220 }}
          helperText="Combined fields appear under this name (e.g. customer.name)"
        />
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Relationship</InputLabel>
          <Select label="Relationship" value={join.relationship || 'one'} onChange={(e) => onChange({ relationship: e.target.value })}>
            <MenuItem value="one">One match per row</MenuItem>
            <MenuItem value="many">Many matches per row</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Unmatched rows</InputLabel>
          <Select label="Unmatched rows" value={join.unmatched || 'keep'} onChange={(e) => onChange({ unmatched: e.target.value })}>
            <MenuItem value="keep">Keep them (left join)</MenuItem>
            <MenuItem value="drop">Drop them (inner join)</MenuItem>
          </Select>
        </FormControl>
      </Box>
    </Box>
  );
}

/**
 * Inline-autocomplete formula input. Shows a dropdown of field-name
 * suggestions as the user types a token that matches available fields.
 * Selecting a suggestion splices it in at the cursor, replacing only the
 * characters the user has typed so far (the partial token).
 */
function FormulaField({ value, onChange, error, helperText, allFields }) {
  const inputRef = useRef(null);
  const [suggestions, setSuggestions] = useState([]);
  const [tokenRange, setTokenRange] = useState(null); // { start, end }

  // Extract the word (token) being typed immediately before the cursor.
  // Field-name characters: letters, digits, underscore, dot.
  const getTokenAtCursor = (text, pos) => {
    let start = pos;
    while (start > 0 && /[A-Za-z0-9_.]/.test(text[start - 1])) start--;
    return { token: text.slice(start, pos), start, end: pos };
  };

  const handleChange = (e) => {
    const text = e.target.value;
    const pos = e.target.selectionStart;
    onChange(text);
    const { token, start, end } = getTokenAtCursor(text, pos);
    if (token.length >= 1) {
      const lower = token.toLowerCase();
      const matches = allFields
        .filter((f) => f.toLowerCase().startsWith(lower) || f.toLowerCase().includes(lower))
        .slice(0, 12);
      if (matches.length) {
        setSuggestions(matches);
        setTokenRange({ start, end });
        return;
      }
    }
    setSuggestions([]);
    setTokenRange(null);
  };

  const handleKeyDown = (e) => {
    if (suggestions.length && e.key === 'Escape') {
      setSuggestions([]);
      setTokenRange(null);
      e.preventDefault();
    }
  };

  const insertSuggestion = (fieldName) => {
    if (!tokenRange) return;
    const before = (value || '').slice(0, tokenRange.start);
    const after = (value || '').slice(tokenRange.end);
    const newVal = before + fieldName + after;
    onChange(newVal);
    setSuggestions([]);
    setTokenRange(null);
    setTimeout(() => {
      const el = inputRef.current;
      if (el) { el.focus(); const p = tokenRange.start + fieldName.length; el.setSelectionRange(p, p); }
    }, 0);
  };

  return (
    <Box sx={{ flex: 1, position: 'relative' }}>
      <TextField
        inputRef={inputRef}
        size="small" label="Formula" value={value || ''}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        fullWidth multiline maxRows={3}
        placeholder='e.g. amount - refund   or   if(status == "paid", amount, 0)'
        error={error}
        helperText={helperText || 'Type a field name to autocomplete. Supports +−×÷, if(), round(), concat(), year(), coalesce(), etc.'}
        inputProps={{ style: { fontFamily: 'monospace', fontSize: 13 } }}
      />
      {suggestions.length > 0 && (
        <Paper elevation={8} sx={{
          position: 'absolute', zIndex: 1400, width: '100%',
          maxHeight: 220, overflow: 'auto', top: '100%', left: 0, mt: 0.25,
        }}>
          {suggestions.map((s) => (
            <MenuItem
              key={s} dense
              onMouseDown={(e) => { e.preventDefault(); insertSuggestion(s); }}
              sx={{ fontFamily: 'monospace', fontSize: 13 }}
            >
              {s}
            </MenuItem>
          ))}
        </Paper>
      )}
    </Box>
  );
}

function AddColumnEditor({ step, sourceCollection, update, precedingSteps }) {
  const [schemaFields, setSchemaFields] = useState([]);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!sourceCollection) return;
    fetchFields(sourceCollection).then(setSchemaFields);
  }, [sourceCollection]);

  // Legacy single-column shape { name, formula } → normalise to array.
  const cols = Array.isArray(step.columns) && step.columns.length
    ? step.columns
    : (step.name ? [{ name: step.name, formula: step.formula || '' }] : [{ name: '', formula: '' }]);

  const setCols = (next) => update({ columns: next, name: undefined, formula: undefined });

  const updateCol = (i, patch) => {
    const next = cols.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    if (patch.formula !== undefined) {
      const errs = { ...errors };
      if (patch.formula.trim()) {
        try { parseFormula(patch.formula); delete errs[i]; }
        catch (e) { errs[i] = e.message; }
      } else { delete errs[i]; }
      setErrors(errs);
    }
    setCols(next);
  };

  const addCol = () => setCols([...cols, { name: '', formula: '' }]);

  const removeCol = (i) => {
    setCols(cols.filter((_, idx) => idx !== i));
    setErrors((prev) => {
      const next = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki !== i) next[ki < i ? ki : ki - 1] = v;
      });
      return next;
    });
  };

  const derivedCols = getDerivedColumns(precedingSteps);
  const schemaNames = new Set(schemaFields.map((f) => f.name));

  // Flat field list for autocomplete: source fields + derived/joined fields +
  // columns defined above this row in the same step.
  const getAllFields = (rowIdx) => {
    const names = new Set();
    schemaFields.forEach((f) => names.add(f.name));
    derivedCols.forEach((d) => { if (!schemaNames.has(d.name)) names.add(d.name); });
    cols.slice(0, rowIdx).forEach((c) => { if (c.name) names.add(c.name); });
    return Array.from(names);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {cols.map((col, i) => (
        <Box key={i} sx={{
          display: 'flex', flexDirection: 'column', gap: 0.75,
          pb: i < cols.length - 1 ? 1.5 : 0,
          borderBottom: i < cols.length - 1 ? '1px dashed' : 'none',
          borderColor: 'divider',
        }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            {cols.length > 1 && (
              <Typography variant="caption" color="text.secondary"
                sx={{ minWidth: 20, mt: 1.2, fontWeight: 700 }}>
                {i + 1}.
              </Typography>
            )}
            <TextField
              size="small" label="Column name" value={col.name || ''}
              onChange={(e) => updateCol(i, { name: e.target.value })}
              sx={{ minWidth: 180 }}
            />
            <FormulaField
              value={col.formula}
              onChange={(formula) => updateCol(i, { formula })}
              error={!!errors[i]}
              helperText={errors[i]}
              allFields={getAllFields(i)}
            />
            <Tooltip
              arrow
              placement="left"
              title={
                <Box sx={{ p: 0.5 }}>
                  <Typography variant="caption" fontWeight={700} sx={{ display: 'block', mb: 0.75, color: '#e2e8f0' }}>
                    Available functions
                  </Typography>
                  {[
                    { fn: 'round(x, n)',       desc: 'Round x to n decimal places' },
                    { fn: 'abs(x)',             desc: 'Absolute value' },
                    { fn: 'ceil(x)',            desc: 'Round up to integer' },
                    { fn: 'floor(x)',           desc: 'Round down to integer' },
                    { fn: 'min(a, b)',          desc: 'Smaller of two values' },
                    { fn: 'max(a, b)',          desc: 'Larger of two values' },
                    { fn: 'if(cond, a, b)',     desc: 'Conditional — a if cond else b' },
                    { fn: 'concat(a, b, …)',    desc: 'Concatenate strings' },
                    { fn: 'upper(s)',           desc: 'Uppercase string' },
                    { fn: 'lower(s)',           desc: 'Lowercase string' },
                    { fn: 'year(d)',            desc: 'Year from date field' },
                    { fn: 'month(d)',           desc: 'Month from date field' },
                    { fn: 'day(d)',             desc: 'Day of month from date' },
                    { fn: 'coalesce(a, b)',     desc: 'First non-null value' },
                    { fn: 'sum(a, b, …)',       desc: 'Add multiple values' },
                  ].map(({ fn, desc }) => (
                    <Box key={fn} sx={{ display: 'flex', gap: 1.5, mb: 0.4, alignItems: 'baseline' }}>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#93c5fd', minWidth: 148, flexShrink: 0 }}>{fn}</Typography>
                      <Typography variant="caption" sx={{ color: '#94a3b8' }}>{desc}</Typography>
                    </Box>
                  ))}
                  <Typography variant="caption" sx={{ display: 'block', mt: 1, color: '#64748b' }}>
                    Operators: + − * / and field names directly (e.g. amount * 1.1)
                  </Typography>
                </Box>
              }
              componentsProps={{ tooltip: { sx: { maxWidth: 420, bgcolor: '#1e293b', border: '1px solid #334155' } }, arrow: { sx: { color: '#1e293b' } } }}
            >
              <IconButton size="small" sx={{ mt: 0.5, color: 'text.disabled', '&:hover': { color: '#6366f1' } }}>
                <FunctionsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={cols.length <= 1 ? 'Need at least one column' : 'Remove this column'}>
              <span>
                <IconButton size="small" disabled={cols.length <= 1} onClick={() => removeCol(i)}
                  sx={{ mt: 0.5, color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>
      ))}

      <Button size="small" startIcon={<AddIcon />} onClick={addCol}
        sx={{
          alignSelf: 'flex-start', borderRadius: 2, fontWeight: 600, textTransform: 'none',
          color: '#475569', border: '1px solid #e2e8f0', bgcolor: '#f8fafc',
          '&:hover': { bgcolor: '#f1f5f9', borderColor: '#cbd5e1' },
        }}
      >
        Add another column
      </Button>
    </Box>
  );
}

function ChooseColumnsEditor({ step, sourceCollection, update, precedingSteps }) {
  const [schemaFields, setSchemaFields] = useState([]);
  useEffect(() => {
    if (!sourceCollection) return;
    fetchFields(sourceCollection).then(setSchemaFields);
  }, [sourceCollection]);

  const derivedCols = getDerivedColumns(precedingSteps);
  const schemaNames = new Set(schemaFields.map((f) => f.name));

  // Group columns by origin so the chooser is clear about what comes from where.
  const groups = { 'Source table': schemaFields.map((f) => f.name) };
  for (const d of derivedCols) {
    if (schemaNames.has(d.name)) continue; // avoid duplicates
    const grp = d.source === 'computed' ? 'Computed columns'
      : d.source === 'Summarize metrics' ? 'Summarize metrics'
      : `From ${d.source}`;
    if (!groups[grp]) groups[grp] = [];
    groups[grp].push(d.name);
  }
  const activeGroups = Object.entries(groups).filter(([, names]) => names.length > 0);

  const cols = step.columns || [];
  const toggle = (name) => {
    const next = cols.includes(name) ? cols.filter((c) => c !== name) : [...cols, name];
    update({ columns: next });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <FormControl size="small" sx={{ maxWidth: 240 }}>
        <InputLabel>Mode</InputLabel>
        <Select label="Mode" value={step.mode || 'keep'} onChange={(e) => update({ mode: e.target.value })}>
          <MenuItem value="keep">Keep only selected</MenuItem>
          <MenuItem value="drop">Drop selected</MenuItem>
        </Select>
      </FormControl>
      {activeGroups.map(([grp, names]) => (
        <Box key={grp}>
          {activeGroups.length > 1 && (
            <Typography variant="caption" color="text.secondary"
              sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
              {grp}
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', maxHeight: 200, overflow: 'auto' }}>
            {names.map((name) => (
              <Box
                key={name}
                component="span"
                onClick={() => toggle(name)}
                sx={{
                  display: 'inline-flex', alignItems: 'center',
                  px: 1, py: 0.25, fontSize: '0.75rem', fontWeight: 500,
                  borderRadius: 1, cursor: 'pointer', userSelect: 'none',
                  bgcolor: cols.includes(name) ? '#eff6ff' : '#f8fafc',
                  color: cols.includes(name) ? '#1e40af' : '#475569',
                  border: cols.includes(name) ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                  '&:hover': { bgcolor: cols.includes(name) ? '#dbeafe' : '#e2e8f0' },
                }}
              >
                {name}
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function SortEditor({ step, sourceCollection, update, precedingSteps }) {
  // Multi-field sort editor. Migrates legacy single-field sort step into the
  // new array shape on first render so the UI is uniform; the compiler also
  // accepts both shapes for backwards compatibility with saved datasets.
  const extraFields = getDerivedColumns(precedingSteps);
  const sorts = React.useMemo(() => {
    if (Array.isArray(step.sorts) && step.sorts.length) return step.sorts;
    if (step.field) return [{ field: step.field, dir: step.dir || 'desc' }];
    return [{ field: '', dir: 'desc' }];
  }, [step]);

  const setSorts = (next) => {
    update({ sorts: next, field: undefined, dir: undefined });
  };
  const updateRow = (i, patch) => setSorts(sorts.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i) => setSorts(sorts.filter((_, idx) => idx !== i));
  const addRow = () => setSorts([...sorts, { field: '', dir: 'desc' }]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {sorts.map((row, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 56 }}>
            {i === 0 ? 'Sort by' : 'then by'}
          </Typography>
          <FieldPicker
            collection={sourceCollection}
            value={row.field || ''}
            onChange={(field) => updateRow(i, { field })}
            label="Field"
            extraFields={extraFields}
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Direction</InputLabel>
            <Select label="Direction" value={row.dir || 'desc'} onChange={(e) => updateRow(i, { dir: e.target.value })}>
              <MenuItem value="asc">Ascending</MenuItem>
              <MenuItem value="desc">Descending</MenuItem>
            </Select>
          </FormControl>
          <Tooltip title="Remove sort">
            <span>
              <IconButton
                size="small"
                onClick={() => removeRow(i)}
                disabled={sorts.length <= 1}
                sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary' } }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      ))}
      <Button size="small" startIcon={<AddIcon />} onClick={addRow}
        sx={{
          alignSelf: 'flex-start', borderRadius: 2, fontWeight: 600, textTransform: 'none',
          color: '#475569', border: '1px solid #e2e8f0', bgcolor: '#f8fafc',
          '&:hover': { bgcolor: '#f1f5f9', borderColor: '#cbd5e1' },
        }}
      >
        Add sort field
      </Button>
    </Box>
  );
}

export function StepArrow() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', my: -0.5 }}>
      <ArrowDownwardIcon sx={{ color: 'text.disabled', fontSize: 18 }} />
    </Box>
  );
}

export function AddStepButton({ onAdd, existingKinds = [] }) {
  const [anchor, setAnchor] = useState(null);
  const usedKinds = new Set(existingKinds);

  const items = [
    {
      kind: 'chooseColumns', label: 'Choose columns',
      desc: 'Keep or drop specific columns from the output',
      icon: <ViewColumnIcon fontSize="small" />, color: '#0ea5e9',
      defaults: { columns: [], mode: 'keep' },
    },
    {
      kind: 'combine', label: 'Combine table',
      desc: 'Join with another collection on a matching key',
      icon: <MergeTypeIcon fontSize="small" />, color: '#6366f1',
      defaults: { relationship: 'one', unmatched: 'keep' },
    },
    {
      kind: 'filter', label: 'Filter rows',
      desc: 'Keep only rows that match your conditions',
      icon: <FilterListIcon fontSize="small" />, color: '#f59e0b',
      defaults: { filters: [] },
    },
    {
      kind: 'addColumn', label: 'New column',
      desc: 'Add a calculated field using a formula',
      icon: <FunctionsIcon fontSize="small" />, color: '#8b5cf6',
      defaults: { columns: [{ name: '', formula: '' }] },
    },
    {
      kind: 'summarize', label: 'Summarize',
      desc: 'Group rows and compute aggregates (sum, count, avg…)',
      icon: <GroupWorkIcon fontSize="small" />, color: '#ec4899',
      defaults: { groupBys: [], metrics: [] },
    },
    {
      kind: 'sort', label: 'Sort',
      desc: 'Order rows by one or more columns',
      icon: <SortIcon fontSize="small" />, color: '#10b981',
      defaults: { dir: 'desc' },
    },
    {
      kind: 'keepTopN', label: 'Limit rows',
      desc: 'Keep only the first N rows of the result',
      icon: <Filter1Icon fontSize="small" />, color: '#ef4444',
      defaults: { limit: 100 },
    },
  ];

  const handleAdd = (item) => {
    setAnchor(null);
    onAdd({ kind: item.kind, ...item.defaults });
  };

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'center', my: 1.5 }}>
        <Tooltip title="Add a step" placement="top">
          <IconButton
            onClick={(e) => setAnchor(e.currentTarget)}
            sx={{
              width: 36, height: 36,
              border: '1.5px dashed',
              borderColor: '#94a3b8',
              color: '#64748b',
              '&:hover': { borderColor: 'primary.main', color: 'primary.main', bgcolor: 'primary.50' },
              transition: 'all 0.15s',
            }}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        PaperProps={{ sx: { width: 300, borderRadius: 2, overflow: 'hidden', mt: 0.5 } }}
      >
        <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary"
            sx={{ letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Add a step
          </Typography>
        </Box>
        <Divider />
        <List dense disablePadding>
          {items.map((it, idx) => {
            const used = usedKinds.has(it.kind);
            return (
              <ListItemButton
                key={it.kind}
                onClick={() => !used && handleAdd(it)}
                disabled={used}
                sx={{
                  py: 1.25, px: 2,
                  borderBottom: idx < items.length - 1 ? '1px solid' : 'none',
                  borderColor: 'divider',
                  '&:hover:not(.Mui-disabled)': { bgcolor: `${it.color}18` },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Box sx={{
                    width: 28, height: 28, borderRadius: 1,
                    bgcolor: `${it.color}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: it.color,
                  }}>
                    {it.icon}
                  </Box>
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                        {it.label}
                      </Typography>
                      {used && <Chip size="small" label="added" sx={{ height: 16, fontSize: '0.6rem' }} />}
                    </Box>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
                      {it.desc}
                    </Typography>
                  }
                />
              </ListItemButton>
            );
          })}
        </List>
      </Popover>
    </>
  );
}
