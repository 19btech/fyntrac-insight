import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogActions, Box, Stack, Typography, Button, IconButton,
  TextField, MenuItem, Chip, Divider, Tooltip, Switch, CircularProgress, Alert,
  ToggleButtonGroup, ToggleButton, Skeleton, InputAdornment, Collapse,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowBackIcon from '@mui/icons-material/ArrowBackOutlined';
import ScienceIcon from '@mui/icons-material/ScienceOutlined';
import TableChartIcon from '@mui/icons-material/TableChartOutlined';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmberOutlined';
import VerifiedIcon from '@mui/icons-material/Verified';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonthOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import api from '../../hooks/useQuery';
import BrandedDialogTitle from '../shared/BrandedDialogTitle';

const ACCENT = '#4f46e5';
const SLATE_100 = '#f1f5f9';

function SourceIcon({ type, ...props }) {
  return type === 'dataset' ? <ScienceIcon {...props} /> : <TableChartIcon {...props} />;
}

/* ─── Registered list ──────────────────────────────────────────────────── */

function RegisteredRow({ source, onToggle, onRemove, onPatch, busy }) {
  // The source's real columns, so both mappings are a choice rather than typed
  // from memory — a mistyped column name yields a source that silently returns
  // nothing, which is indistinguishable from "no data".
  const [cols, setCols] = useState(null);
  const [colsError, setColsError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get(`/instruments/sources/${source._id}/columns`)
      .then(({ data }) => {
        if (cancelled) return;
        setCols(data);
        if (data.error) setColsError(data.error);
      })
      .catch((e) => { if (!cancelled) setColsError(e.response?.data?.error || e.message); });
    return () => { cancelled = true; };
  }, [source._id]);

  const isPeriod = source.dateMode === 'accountingPeriod';
  const noPeriod = source.dateMode === 'none';
  const dateOptions = (isPeriod ? cols?.period : cols?.postingDate) || [];
  const instrumentOptions = cols?.instrument || [];

  // Whatever is currently saved always stays selectable, even if the detector
  // would not have suggested it.
  const withCurrent = (list, current) =>
    current && !list.includes(current) ? [current, ...list] : list;

  const loading = cols === null && !colsError;

  const renderSelect = (label, value, options, onPick, disabledReason) => (
    <TextField
      select
      size="small"
      label={label}
      value={value || ''}
      onChange={(e) => onPick(e.target.value)}
      disabled={busy || loading || !!disabledReason}
      helperText={disabledReason || ' '}
      sx={{ flex: 1, width: '100%' }}
      InputLabelProps={{ shrink: true }}
    >
      {withCurrent(options, value).map((c) => (
        <MenuItem key={c} value={c}>
          {c}
          {cols?.types?.[c] && (
            <Box component="span" sx={{ color: 'text.secondary', ml: 1, fontSize: '0.72rem' }}>
              {cols.types[c]}
            </Box>
          )}
        </MenuItem>
      ))}
    </TextField>
  );

  return (
    <Box
      sx={{
        p: 1.75, borderRadius: '12px', border: '1px solid', borderColor: 'divider',
        bgcolor: source.enabled ? '#fff' : '#fafbfc',
        opacity: source.enabled ? 1 : 0.75,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Box sx={{ width: 30, height: 30, borderRadius: '8px', flexShrink: 0, bgcolor: SLATE_100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
          <SourceIcon type={source.sourceType} sx={{ fontSize: 16 }} />
        </Box>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <Typography noWrap sx={{ fontSize: '0.875rem', fontWeight: 700 }}>{source.label}</Typography>
            {source.verified && <VerifiedIcon sx={{ fontSize: 14, color: '#10b981' }} />}
            {source.missing && (
              <Tooltip title="The underlying dataset or report no longer exists">
                <WarningAmberIcon sx={{ fontSize: 15, color: '#f59e0b' }} />
              </Tooltip>
            )}
            {loading && <CircularProgress size={12} />}
          </Stack>
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
            {source.sourceType === 'dataset' ? 'Dataset' : 'Report'}
          </Typography>
        </Box>

        <Tooltip title={source.enabled ? 'Shown in the browser' : 'Hidden from the browser'}>
          <Switch size="small" checked={source.enabled} onChange={(e) => onToggle(source, e.target.checked)} disabled={busy} />
        </Tooltip>
        <Tooltip title="Remove from the Instrument Browser">
          <span>
            <IconButton size="small" onClick={() => onRemove(source)} disabled={busy}
              sx={{ color: 'text.secondary', '&:hover': { color: '#ef4444' } }}>
              <DeleteOutlineIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {colsError && (
        <Alert severity="warning" sx={{ mt: 1.25, borderRadius: '10px', fontSize: '0.75rem', py: 0 }}>
          Could not read this source's columns ({colsError}). The saved mapping is still in effect.
        </Alert>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mt: 1.5 }} alignItems="flex-start">
        {renderSelect(
          'Instrument ID column',
          source.instrumentField,
          instrumentOptions,
          (v) => onPatch(source, { instrumentField: v })
        )}
        <ToggleButtonGroup
          exclusive
          size="small"
          value={source.dateMode}
          onChange={(_e, v) => {
            if (!v || v === source.dateMode) return;
            // The mapped column belongs to the old mode, so move it to a
            // candidate for the new one in the same write — leaving the stale
            // name behind would filter a period against a date column.
            if (v === 'none') { onPatch(source, { dateMode: v }); return; }
            const next = (v === 'postingDate' ? cols?.postingDate : cols?.period) || [];
            onPatch(source, { dateMode: v, ...(next[0] ? { dateField: next[0] } : {}) });
          }}
          disabled={busy || loading}
          sx={{ mt: 0.25, '& .MuiToggleButton-root': { px: 1.25, py: 0.6, fontSize: '0.7rem', textTransform: 'none', fontWeight: 600, borderRadius: '8px' } }}
        >
          <ToggleButton value="postingDate" disabled={cols ? cols.postingDate.length === 0 : false}>
            <EventOutlinedIcon sx={{ fontSize: 14, mr: 0.5 }} />Date
          </ToggleButton>
          <ToggleButton value="accountingPeriod" disabled={cols ? cols.period.length === 0 : false}>
            <CalendarMonthIcon sx={{ fontSize: 14, mr: 0.5 }} />Period
          </ToggleButton>
          <ToggleButton value="none">None</ToggleButton>
        </ToggleButtonGroup>
        {noPeriod ? (
          <Typography sx={{ flex: 1, fontSize: '0.75rem', color: 'text.secondary', pt: 1 }}>
            Browsed by instrument only — no period filter.
          </Typography>
        ) : renderSelect(
          isPeriod ? 'Accounting period column' : 'Posting date column',
          source.dateField,
          dateOptions,
          (v) => onPatch(source, { dateField: v })
        )}
      </Stack>
    </Box>
  );
}

/* ─── Add flow ─────────────────────────────────────────────────────────── */

function AddSource({ onCancel, onAdded, existingCount }) {
  const [available, setAvailable] = useState({ datasets: [], reports: [], skipped: [] });
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState('dataset');
  const [filter, setFilter] = useState('');
  const [picked, setPicked] = useState(null);
  const [showSkipped, setShowSkipped] = useState(false);

  const [instrumentField, setInstrumentField] = useState('');
  const [dateMode, setDateMode] = useState('postingDate');
  const [dateField, setDateField] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get('/instruments/sources/available')
      .then(({ data }) => { if (!cancelled) setAvailable(data); })
      .catch(() => { if (!cancelled) setAvailable({ datasets: [], reports: [], skipped: [] }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // The server has already probed each source and told us which of its columns
  // qualify, so picking one just seeds the form.
  const choose = (item) => {
    setLabel('');
    setPicked(item);
    setInstrumentField(item.instrument[0] || '');
    // Default to whichever dimension this source actually has.
    const mode = item.postingDate.length ? 'postingDate'
      : item.period.length ? 'accountingPeriod'
        : 'none';
    setDateMode(mode);
    setDateField(mode === 'none' ? ''
      : (mode === 'postingDate' ? item.postingDate[0] : item.period[0]) || '');
  };

  const switchMode = (mode) => {
    setDateMode(mode);
    if (mode === 'none') { setDateField(''); return; }
    setDateField((mode === 'postingDate' ? picked.postingDate[0] : picked.period[0]) || '');
  };

  const list = kind === 'dataset' ? available.datasets : available.reports;
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? list.filter((i) => i.name.toLowerCase().includes(q)) : list;
  }, [list, filter]);

  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const { data } = await api.post('/instruments/sources', {
        sourceType: picked.sourceType,
        sourceId: picked.sourceId,
        label: label.trim(),
        instrumentField,
        dateMode,
        dateField,
      });
      onAdded(data);
    } catch (e) {
      setSaveError(e.response?.data?.error || e.message || 'Could not add this source');
      setSaving(false);
    }
  };

  /* Step 2 — map the columns. */
  if (picked) {
    const modeOptions = dateMode === 'postingDate' ? picked.postingDate : picked.period;
    const hasBoth = picked.postingDate.length > 0 && picked.period.length > 0;

    return (
      <Box>
        <Button size="small" startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />} onClick={() => setPicked(null)}
          sx={{ mb: 1.5, color: 'text.secondary', fontWeight: 600 }}>
          Back to list
        </Button>

        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 2 }}>
          <Box sx={{ width: 34, height: 34, borderRadius: '10px', bgcolor: '#eef2ff', color: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SourceIcon type={picked.sourceType} sx={{ fontSize: 18 }} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 700 }}>{picked.name}</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
              {picked.columns.length} columns
            </Typography>
          </Box>
        </Stack>

        <Stack spacing={2}>
          <TextField
            select
            label="Instrument ID column"
            value={instrumentField}
            onChange={(e) => setInstrumentField(e.target.value)}
            helperText="The column the browser matches the searched instrument against."
          >
            {picked.instrument.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
                <Box component="span" sx={{ color: 'text.secondary', ml: 1, fontSize: '0.72rem' }}>
                  {picked.types[c]}
                </Box>
              </MenuItem>
            ))}
          </TextField>

          <Box>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.secondary', mb: 0.75 }}>
              FILTER THIS SOURCE BY
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={dateMode}
              onChange={(_e, v) => v && switchMode(v)}
              sx={{ '& .MuiToggleButton-root': { borderRadius: '10px', px: 2, py: 0.75, fontWeight: 600, fontSize: '0.78rem', textTransform: 'none' } }}
            >
              <ToggleButton value="postingDate" disabled={picked.postingDate.length === 0}>
                <EventOutlinedIcon sx={{ fontSize: 16, mr: 0.75 }} />
                Posting date
              </ToggleButton>
              <ToggleButton value="accountingPeriod" disabled={picked.period.length === 0}>
                <CalendarMonthIcon sx={{ fontSize: 16, mr: 0.75 }} />
                Accounting period
              </ToggleButton>
              <ToggleButton value="none">Nothing — instrument only</ToggleButton>
            </ToggleButtonGroup>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mt: 0.75 }}>
              {dateMode === 'none'
                ? 'This source has no time dimension — it will ignore the period control.'
                : hasBoth
                  ? 'This source has both — pick the one to filter on. Only one can be used.'
                  : dateMode === 'postingDate'
                    ? 'This source only exposes a posting date.'
                    : 'This source only exposes an accounting period.'}
            </Typography>
          </Box>

          {dateMode !== 'none' && (
          <TextField
            select
            label={dateMode === 'accountingPeriod' ? 'Accounting period column' : 'Posting date column'}
            value={dateField}
            onChange={(e) => setDateField(e.target.value)}
            helperText={
              dateMode === 'accountingPeriod'
                ? 'Matched against the period picked in the browser (e.g. 202607).'
                : 'Matched against the date picked in the browser.'
            }
          >
            {modeOptions.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
                <Box component="span" sx={{ color: 'text.secondary', ml: 1, fontSize: '0.72rem' }}>
                  {picked.types[c]}
                </Box>
              </MenuItem>
            ))}
          </TextField>
          )}

          <TextField
            label="Display name"
            placeholder={picked.name}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            InputLabelProps={{ shrink: true }}
            helperText="Optional. Leave blank to follow the source's own name if it is renamed later."
          />
        </Stack>

        {saveError && <Alert severity="error" sx={{ borderRadius: '12px', mt: 2 }}>{saveError}</Alert>}

        <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: 2.5 }}>
          <Button onClick={() => setPicked(null)} sx={{ borderRadius: '10px' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={save}
            disabled={!instrumentField || (dateMode !== 'none' && !dateField) || saving}
            startIcon={saving ? <CircularProgress size={15} color="inherit" /> : <AddIcon />}
            sx={{ borderRadius: '10px', boxShadow: 'none', '&:hover': { boxShadow: 'none' } }}
          >
            Add to browser
          </Button>
        </Stack>
      </Box>
    );
  }

  /* Step 1 — choose a dataset or report. */
  return (
    <Box>
      {existingCount > 0 && (
        <Button size="small" startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />} onClick={onCancel}
          sx={{ mb: 1.5, color: 'text.secondary', fontWeight: 600 }}>
          Back to sources
        </Button>
      )}

      <Alert severity="info" icon={<InfoOutlinedIcon fontSize="small" />}
        sx={{ borderRadius: '12px', mb: 2, bgcolor: '#eef2ff', color: '#3730a3', fontSize: '0.8rem', '& .MuiAlert-icon': { color: ACCENT } }}>
        Only datasets and reports that expose an instrument ID <strong>and</strong> either a posting date
        or an accounting period can be browsed, so the list below is already filtered to those.
      </Alert>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <ToggleButtonGroup
          exclusive size="small" value={kind} onChange={(_e, v) => v && setKind(v)}
          sx={{ '& .MuiToggleButton-root': { borderRadius: '10px', px: 2, fontWeight: 600, fontSize: '0.78rem', textTransform: 'none' } }}
        >
          <ToggleButton value="dataset">
            <ScienceIcon sx={{ fontSize: 16, mr: 0.75 }} />
            Datasets ({available.datasets.length})
          </ToggleButton>
          <ToggleButton value="report">
            <TableChartIcon sx={{ fontSize: 16, mr: 0.75 }} />
            Reports ({available.reports.length})
          </ToggleButton>
        </ToggleButtonGroup>

        <TextField
          size="small" placeholder="Filter by name…" value={filter}
          onChange={(e) => setFilter(e.target.value)} sx={{ flex: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment>
            ),
          }}
        />
      </Stack>

      <Box sx={{ maxHeight: 340, overflowY: 'auto', pr: 0.5 }}>
        {loading ? (
          <>
            <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', mb: 1.5 }}>
              Checking each dataset and report for an instrument ID and a date or period…
            </Typography>
            <Stack spacing={1}>
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={56} sx={{ borderRadius: '12px' }} />)}
            </Stack>
          </>
        ) : shown.length === 0 ? (
          <Stack alignItems="center" spacing={1} sx={{ py: 5, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 700 }}>
              {list.length === 0 ? `No eligible ${kind === 'dataset' ? 'datasets' : 'reports'}` : 'Nothing matches that filter'}
            </Typography>
            <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', maxWidth: 420 }}>
              {list.length === 0
                ? `Every ${kind} is either already added, or has no instrument ID paired with a posting date or accounting period.`
                : 'Try a different search term.'}
            </Typography>
          </Stack>
        ) : (
          <Stack spacing={1}>
            {shown.map((item) => (
              <Box
                key={item.sourceId}
                onClick={() => choose(item)}
                sx={{
                  p: 1.5, borderRadius: '12px', border: '1px solid', borderColor: 'divider',
                  cursor: 'pointer', transition: 'border-color 160ms, background-color 160ms',
                  '&:hover': { borderColor: '#c7d2fe', bgcolor: '#f8faff' },
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <Box sx={{ width: 30, height: 30, borderRadius: '8px', bgcolor: SLATE_100, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <SourceIcon type={item.sourceType} sx={{ fontSize: 16 }} />
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={0.75}>
                      <Typography noWrap sx={{ fontSize: '0.875rem', fontWeight: 600 }}>{item.name}</Typography>
                      {item.verified && <VerifiedIcon sx={{ fontSize: 14, color: '#10b981' }} />}
                    </Stack>
                    <Stack direction="row" spacing={0.5} sx={{ mt: 0.4 }}>
                      {item.postingDate.length > 0 && (
                        <Chip size="small" icon={<EventOutlinedIcon sx={{ fontSize: 12 }} />} label="date"
                          sx={{ height: 18, borderRadius: '6px', fontSize: '0.65rem', bgcolor: SLATE_100, color: '#64748b', '& .MuiChip-icon': { ml: 0.5 } }} />
                      )}
                      {item.period.length > 0 && (
                        <Chip size="small" icon={<CalendarMonthIcon sx={{ fontSize: 12 }} />} label="period"
                          sx={{ height: 18, borderRadius: '6px', fontSize: '0.65rem', bgcolor: SLATE_100, color: '#64748b', '& .MuiChip-icon': { ml: 0.5 } }} />
                      )}
                    </Stack>
                  </Box>
                  <Chip label="Add" size="small" sx={{ height: 22, borderRadius: '8px', fontSize: '0.7rem', fontWeight: 700, bgcolor: '#eef2ff', color: ACCENT }} />
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      {/* Why something the user expected to see is not listed. */}
      {!loading && available.skipped?.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Button
            size="small"
            onClick={() => setShowSkipped((v) => !v)}
            endIcon={<ExpandMoreIcon sx={{ fontSize: 18, transform: showSkipped ? 'rotate(180deg)' : 'none', transition: 'transform 160ms' }} />}
            sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.75rem' }}
          >
            {available.skipped.length} not eligible
          </Button>
          <Collapse in={showSkipped}>
            <Stack spacing={0.5} sx={{ mt: 1, pl: 1 }}>
              {available.skipped.map((s, i) => (
                <Stack key={`${s.name}-${i}`} direction="row" spacing={1} alignItems="center">
                  <Typography noWrap sx={{ fontSize: '0.75rem', fontWeight: 600, minWidth: 0, flex: 1 }}>{s.name}</Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', flexShrink: 0 }}>{s.reason}</Typography>
                </Stack>
              ))}
            </Stack>
          </Collapse>
        </Box>
      )}
    </Box>
  );
}

/* ─── Dialog shell ─────────────────────────────────────────────────────── */

export default function InstrumentSourcesDialog({ open, onClose, sources, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Open straight into the add flow when nothing is configured yet — the
  // empty list has no value to show.
  useEffect(() => {
    if (open) { setAdding(sources.length === 0); setError(''); }
  }, [open, sources.length]);

  const patch = async (source, body) => {
    setBusy(true);
    try {
      await api.put(`/instruments/sources/${source._id}`, body);
      await onChanged();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (source) => {
    setBusy(true);
    try {
      await api.delete(`/instruments/sources/${source._id}`);
      await onChanged();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
      <BrandedDialogTitle
        label="Instrument Browser"
        title={adding ? 'Add a dataset or report' : 'Configure sources'}
        onClose={onClose}
      />

      <DialogContent sx={{ p: 3 }}>
        {error && <Alert severity="error" sx={{ borderRadius: '12px', mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        {adding ? (
          <AddSource
            existingCount={sources.length}
            onCancel={() => setAdding(false)}
            onAdded={async () => { await onChanged(); setAdding(false); }}
          />
        ) : (
          <>
            <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mb: 2 }}>
              These datasets and reports appear in the Instrument Browser. Each one is filtered by its
              instrument ID column plus either a posting date or an accounting period — not both.
            </Typography>

            <Stack spacing={1.25}>
              {sources.map((s) => (
                <RegisteredRow
                  key={s._id}
                  source={s}
                  busy={busy}
                  onToggle={(src, enabled) => patch(src, { enabled })}
                  onPatch={(src, body) => patch(src, body)}
                  onRemove={remove}
                />
              ))}
            </Stack>

            <Divider sx={{ my: 2 }} />
            <Button
              fullWidth startIcon={<AddIcon />} onClick={() => setAdding(true)}
              sx={{
                borderRadius: '12px', py: 1.25, fontWeight: 600,
                border: '1px dashed', borderColor: '#c7d2fe', color: ACCENT,
                '&:hover': { bgcolor: '#f8faff', borderColor: ACCENT },
              }}
            >
              Add a dataset or report
            </Button>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} variant="contained"
          sx={{ borderRadius: '10px', boxShadow: 'none', '&:hover': { boxShadow: 'none' } }}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
