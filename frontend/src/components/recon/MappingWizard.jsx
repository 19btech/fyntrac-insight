import React from 'react';
import {
  Box, Stack, Typography, Table, TableHead, TableRow, TableCell, TableBody,
  IconButton, Button, Chip, TextField, MenuItem, Tooltip, Alert,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CircularProgress from '@mui/material/CircularProgress';
import SearchSelect from '../shared/SearchSelect';
import ADD_BUTTON_SX from '../shared/addButtonSx';

const TRANSFORMS = [
  { v: '', label: 'none' },
  { v: 'trim', label: 'trim' },
  { v: 'upper', label: 'upper' },
  { v: 'lower', label: 'lower' },
  { v: 'stripNonAlnum', label: 'strip non-alnum' },
  { v: 'number', label: 'as number' },
  { v: 'abs', label: 'absolute' },
  { v: 'date:day', label: 'date · day' },
  { v: 'date:month', label: 'date · month' },
  { v: 'date:quarter', label: 'date · quarter' },
  { v: 'date:year', label: 'date · year' },
];

const CLEANUP_TOOLTIP = (
  <Box sx={{ p: 0.5, maxWidth: 320 }}>
    <Typography variant="caption" fontWeight={700} sx={{ display: 'block', mb: 0.75, color: '#e2e8f0' }}>Clean-up options</Typography>
    {[
      { v: 'none',            d: 'Use the value exactly as stored — no changes.' },
      { v: 'trim',            d: 'Remove leading and trailing spaces.' },
      { v: 'upper',           d: 'Convert to uppercase and trim spaces. Useful for reference codes.' },
      { v: 'lower',           d: 'Convert to lowercase and trim spaces.' },
      { v: 'strip non-alnum', d: 'Remove everything except letters and digits, then uppercase. Matches "LN-1001" to "LN1001".' },
      { v: 'as number',       d: 'Strip currency symbols ($, €, £), commas and parentheses, then convert to a number.' },
      { v: 'absolute',        d: 'Same as "as number" then takes the absolute value — treats debits and credits the same.' },
      { v: 'date · day',      d: 'Parse as a date and compare at day level (YYYY-MM-DD).' },
      { v: 'date · month',    d: 'Bucket to month (YYYY-MM) — two dates in the same month match.' },
      { v: 'date · quarter',  d: 'Bucket to quarter (YYYY-Q1 … Q4).' },
      { v: 'date · year',     d: 'Bucket to year only (YYYY).' },
    ].map(({ v, d }) => (
      <Box key={v} sx={{ display: 'flex', gap: 1, mb: 0.4 }}>
        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#93c5fd', minWidth: 110, flexShrink: 0 }}>{v}</Typography>
        <Typography variant="caption" sx={{ color: '#94a3b8' }}>{d}</Typography>
      </Box>
    ))}
  </Box>
);

const ATTRIBUTES_TOOLTIP = (
  <Box sx={{ p: 0.5, maxWidth: 300 }}>
    <Typography variant="caption" fontWeight={700} sx={{ display: 'block', mb: 0.5, color: '#e2e8f0' }}>Attributes</Typography>
    <Typography variant="caption" sx={{ color: '#94a3b8', lineHeight: 1.5, display: 'block' }}>
      Non-numeric columns compared for exact equality — such as account code, status, or counterparty name. A row is flagged when the values on Side A and Side B differ. No tolerance is applied; it's a strict text match (after any clean-up transform you choose). Attributes are optional — leave this section empty if you only need numeric reconciliation.
    </Typography>
  </Box>
);

const MEASURES_TOOLTIP = (
  <Box sx={{ p: 0.5, maxWidth: 300 }}>
    <Typography variant="caption" fontWeight={700} sx={{ display: 'block', mb: 0.5, color: '#e2e8f0' }}>Measures</Typography>
    <Typography variant="caption" sx={{ color: '#94a3b8', lineHeight: 1.5, display: 'block' }}>
      Numeric columns you want to compare between Side A and Side B. For each measure the engine calculates the difference and checks it against your tolerance. A row is flagged as mismatched only when the gap on any measure exceeds both the absolute and percentage limits.
    </Typography>
  </Box>
);

/**
 * A plain-language picture of how the recon works: Side A ── match on … ──
 * Side B, with the compared/also-checked columns listed below. Helps a first-
 * time user grasp keys/measures/attributes without reading any docs.
 */
function MentalModelDiagram({ mapping, sideAName, sideBName }) {
  const keys = (mapping?.keys || []).filter((k) => k.a && k.b);
  const measures = (mapping?.measures || []).filter((m) => m.a && m.b);
  const attrs = (mapping?.attributes || []).filter((a) => a.a && a.b);

  const SideBox = ({ letter, name, color, bg }) => (
    <Box sx={{ flex: 1, minWidth: 0, p: 1.25, borderRadius: 2, bgcolor: bg, border: `1px solid ${color}33`, textAlign: 'center' }}>
      <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: '#fff', border: `1px solid ${color}55`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', mb: 0.25 }}>
        <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.62rem', color }}>{letter}</Typography>
      </Box>
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name || `Side ${letter}`}
      </Typography>
    </Box>
  );

  return (
    <Box sx={{ p: 1.75, borderRadius: 2.5, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
      <Stack direction="row" alignItems="stretch" spacing={1}>
        <SideBox letter="A" name={sideAName} color="#1e40af" bg="#eff6ff" />
        <Stack alignItems="center" justifyContent="center" sx={{ px: 0.5, minWidth: 130 }}>
          <Box sx={{ px: 1, py: 0.25, borderRadius: 5, bgcolor: '#fff', border: '1px solid #cbd5e1' }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: keys.length ? '#0f172a' : '#94a3b8', fontSize: '0.66rem' }}>
              {keys.length ? `match on ${keys.length} key${keys.length > 1 ? 's' : ''}` : 'choose a key'}
            </Typography>
          </Box>
          <Box sx={{ width: '100%', height: 2, bgcolor: keys.length ? '#3b82f6' : '#e2e8f0', borderRadius: 2, mt: 0.75 }} />
        </Stack>
        <SideBox letter="B" name={sideBName} color="#7c3aed" bg="#faf5ff" />
      </Stack>
      <Stack direction="row" spacing={2} sx={{ mt: 1.25, flexWrap: 'wrap' }} useFlexGap>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>Compare:</Typography>
          {measures.length ? measures.map((m) => (
            <Chip key={m.a + m.b} size="small" label={m.a === m.b ? m.a : `${m.a} vs ${m.b}`} sx={{ height: 18, fontSize: '0.62rem', bgcolor: '#fef9c3', color: '#854d0e', borderRadius: 1 }} />
          )) : <Typography variant="caption" color="text.disabled">none yet</Typography>}
        </Stack>
        {attrs.length > 0 && (
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>Also check:</Typography>
            {attrs.map((a) => (
              <Chip key={a.a + a.b} size="small" label={a.a === a.b ? a.a : `${a.a} vs ${a.b}`} sx={{ height: 18, fontSize: '0.62rem', bgcolor: '#e0e7ff', color: '#3730a3', borderRadius: 1 }} />
            ))}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

function MappingTable({ title, subtitle, rows, onChange, columnsA, columnsB, withTolerance, onSuggest, suggestLabel, headerTooltip }) {
  const update = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () => onChange([...rows, { a: '', b: '', transform: '', tolerance: { abs: 0.01, pct: 0.001 } }]);

  return (
    <Box>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{title}</Typography>
            {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
          </Box>
          {headerTooltip && (
            <Tooltip title={headerTooltip} placement="right" arrow
              componentsProps={{ tooltip: { sx: { maxWidth: 360, bgcolor: '#1e293b', border: '1px solid #334155' } }, arrow: { sx: { color: '#1e293b' } } }}>
              <InfoOutlinedIcon sx={{ fontSize: 15, color: '#94a3b8', cursor: 'default', mt: 0.25 }} />
            </Tooltip>
          )}
        </Stack>
        <Stack direction="row" spacing={1}>
          {onSuggest && (
            <Button size="small" startIcon={<AutoAwesomeIcon />} onClick={onSuggest}>{suggestLabel || 'Auto-suggest'}</Button>
          )}
          <Tooltip title="Add row">
            <IconButton onClick={add} sx={{ ...ADD_BUTTON_SX, width: 32, height: 32 }}>
              <AddIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>A column</TableCell>
            <TableCell>B column</TableCell>
            <TableCell>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <span>Clean-up</span>
                  <Tooltip title={CLEANUP_TOOLTIP} placement="top" arrow
                    componentsProps={{ tooltip: { sx: { maxWidth: 400, bgcolor: '#1e293b', border: '1px solid #334155' } }, arrow: { sx: { color: '#1e293b' } } }}>
                    <InfoOutlinedIcon sx={{ fontSize: 13, color: '#94a3b8', cursor: 'default' }} />
                  </Tooltip>
                </Stack>
              </TableCell>
            {withTolerance && <TableCell>Tolerance (abs / pct)</TableCell>}
            <TableCell width={48} />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={withTolerance ? 5 : 4} sx={{ color: 'text.secondary' }}>None mapped yet.</TableCell></TableRow>
          )}
          {rows.map((r, i) => (
            <TableRow key={i}>
              <TableCell>
                <SearchSelect
                  value={r.a || ''}
                  onChange={(val) => update(i, { a: val ?? '' })}
                  options={[{ value: '', label: '—' }, ...columnsA.map((c) => ({ value: c, label: c }))]}
                  placeholder="—"
                  width="100%"
                />
              </TableCell>
              <TableCell>
                <SearchSelect
                  value={r.b || ''}
                  onChange={(val) => update(i, { b: val ?? '' })}
                  options={[{ value: '', label: '—' }, ...columnsB.map((c) => ({ value: c, label: c }))]}
                  placeholder="—"
                  width="100%"
                />
              </TableCell>
              <TableCell>
                <TextField
                  select size="small"
                  value={r.transform || ''}
                  onChange={(e) => update(i, { transform: e.target.value })}
                  sx={{ width: 150, '& .MuiOutlinedInput-root': { borderRadius: '16px' } }}
                >
                  {TRANSFORMS.map((t) => (
                    <MenuItem key={t.v} value={t.v}>{t.label}</MenuItem>
                  ))}
                </TextField>
              </TableCell>
              {withTolerance && (
                <TableCell>
                  <Stack direction="row" spacing={0.5}>
                    <TextField size="small" sx={{ width: 80 }} type="number" inputProps={{ step: 0.01 }}
                      value={r.tolerance?.abs ?? 0.01}
                      onChange={(e) => update(i, { tolerance: { ...(r.tolerance || {}), abs: Number(e.target.value) } })}
                    />
                    <Tooltip title="Percent (e.g. 0.001 = 0.1%)">
                      <TextField size="small" sx={{ width: 80 }} type="number" inputProps={{ step: 0.001 }}
                        value={r.tolerance?.pct ?? 0.001}
                        onChange={(e) => update(i, { tolerance: { ...(r.tolerance || {}), pct: Number(e.target.value) } })}
                      />
                    </Tooltip>
                  </Stack>
                </TableCell>
              )}
              <TableCell><IconButton size="small" onClick={() => remove(i)}><DeleteOutlineIcon fontSize="small" /></IconButton></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

export default function MappingWizard({ mapping, onChange, columnsA, columnsB, onAISuggest, aiSuggestLoading, aiReasoning, onClearReasoning, sideAName, sideBName }) {
  const set = (k, v) => onChange({ ...mapping, [k]: v });
  const hasColumns = (columnsA?.length ?? 0) > 0 && (columnsB?.length ?? 0) > 0;
  return (
    <Stack spacing={3}>
      <MentalModelDiagram mapping={mapping} sideAName={sideAName} sideBName={sideBName} />
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Chip label={`${columnsA?.length || 0} columns on A`} size="small" />
        <Chip label={`${columnsB?.length || 0} columns on B`} size="small" />
        {onAISuggest && hasColumns && (
          <Button
            size="small"
            variant="outlined"
            startIcon={aiSuggestLoading ? <CircularProgress size={13} /> : <AutoAwesomeIcon />}
            onClick={onAISuggest}
            disabled={!!aiSuggestLoading}
            sx={{
              borderRadius: 2, textTransform: 'none', fontWeight: 600,
              color: '#7c3aed', borderColor: '#ddd6fe', bgcolor: '#faf5ff',
              '&:hover': { bgcolor: '#ede9fe', borderColor: '#c4b5fd' },
            }}
          >
            {aiSuggestLoading ? 'AI thinking…' : 'AI suggest mapping'}
          </Button>
        )}
      </Stack>
      {aiReasoning && (
        <Alert
          severity="info"
          onClose={onClearReasoning}
          sx={{ borderRadius: 2, fontSize: 13, '& .MuiAlert-message': { lineHeight: 1.5 } }}
          icon={<AutoAwesomeIcon sx={{ fontSize: 16, color: '#7c3aed' }} />}
        >
          <strong>AI reasoning:</strong> {aiReasoning}
        </Alert>
      )}
      <MappingTable
        title="Match on"
        subtitle="Columns that identify the same record on both sides (e.g. invoice #, trade ID)"
        rows={mapping.keys || []} onChange={(rows) => set('keys', rows)}
        columnsA={columnsA} columnsB={columnsB}
      />
      <MappingTable
        title="Compare"
        subtitle="Numeric columns to check for differences, within a tolerance (e.g. amount, quantity)"
        rows={mapping.measures || []} onChange={(rows) => set('measures', rows)}
        columnsA={columnsA} columnsB={columnsB}
        withTolerance
        headerTooltip={MEASURES_TOOLTIP}
      />
      <MappingTable
        title="Also check"
        subtitle="Extra columns that must match exactly — optional (e.g. currency, status)"
        rows={mapping.attributes || []} onChange={(rows) => set('attributes', rows)}
        columnsA={columnsA} columnsB={columnsB}
        headerTooltip={ATTRIBUTES_TOOLTIP}
      />
    </Stack>
  );
}
