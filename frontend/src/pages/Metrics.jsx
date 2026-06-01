import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Button, Grid, Card, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Autocomplete,
  MenuItem, FormControl, InputLabel, Select, Chip, Skeleton, Stack, Divider, Switch,
  Tooltip, Alert, LinearProgress, Snackbar,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import SpeedIcon from '@mui/icons-material/Speed';
import VerifiedIcon from '@mui/icons-material/Verified';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TuneIcon from '@mui/icons-material/Tune';
import DataObjectIcon from '@mui/icons-material/DataObject';
import PaletteIcon from '@mui/icons-material/Palette';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CloseIcon from '@mui/icons-material/Close';
import HighlightOffOutlinedIcon from '@mui/icons-material/HighlightOffOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha } from '@mui/material/styles';
import api from '../hooks/useQuery';
import KpiTile from '../components/shared/KpiTile';
import formatKpi from '../components/shared/formatKpi';
import FilterValueInput from '../components/query-builder/FilterValueInput';
import useKpiContextStore from '../store/kpiContextStore';

const KPI_TILE_FRAME_SX = {
  height: 220,
};

const FORMAT_KINDS = [
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'percent', label: 'Percent' },
];

// ISO 4217 major world currencies — code, symbol, name
const CURRENCIES = [
  { code: 'USD', symbol: '$',     name: 'US Dollar' },
  { code: 'EUR', symbol: '€',     name: 'Euro' },
  { code: 'GBP', symbol: '£',     name: 'British Pound' },
  { code: 'JPY', symbol: '¥',     name: 'Japanese Yen' },
  { code: 'CHF', symbol: 'Fr',    name: 'Swiss Franc' },
  { code: 'AUD', symbol: 'A$',    name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'CA$',   name: 'Canadian Dollar' },
  { code: 'CNY', symbol: '¥',     name: 'Chinese Yuan' },
  { code: 'HKD', symbol: 'HK$',   name: 'Hong Kong Dollar' },
  { code: 'SGD', symbol: 'S$',    name: 'Singapore Dollar' },
  { code: 'INR', symbol: '₹',     name: 'Indian Rupee' },
  { code: 'KRW', symbol: '₩',     name: 'South Korean Won' },
  { code: 'BRL', symbol: 'R$',    name: 'Brazilian Real' },
  { code: 'MXN', symbol: 'MX$',   name: 'Mexican Peso' },
  { code: 'ZAR', symbol: 'R',     name: 'South African Rand' },
  { code: 'NOK', symbol: 'kr',    name: 'Norwegian Krone' },
  { code: 'SEK', symbol: 'kr',    name: 'Swedish Krona' },
  { code: 'DKK', symbol: 'kr',    name: 'Danish Krone' },
  { code: 'NZD', symbol: 'NZ$',   name: 'New Zealand Dollar' },
  { code: 'AED', symbol: 'د.إ',   name: 'UAE Dirham' },
  { code: 'SAR', symbol: '﷼',     name: 'Saudi Riyal' },
  { code: 'TRY', symbol: '₺',     name: 'Turkish Lira' },
  { code: 'THB', symbol: '฿',     name: 'Thai Baht' },
  { code: 'MYR', symbol: 'RM',    name: 'Malaysian Ringgit' },
  { code: 'IDR', symbol: 'Rp',    name: 'Indonesian Rupiah' },
  { code: 'PHP', symbol: '₱',     name: 'Philippine Peso' },
  { code: 'PLN', symbol: 'zł',    name: 'Polish Zloty' },
  { code: 'CZK', symbol: 'Kč',    name: 'Czech Koruna' },
  { code: 'HUF', symbol: 'Ft',    name: 'Hungarian Forint' },
  { code: 'ILS', symbol: '₪',     name: 'Israeli Shekel' },
  { code: 'VND', symbol: '₫',     name: 'Vietnamese Dong' },
  { code: 'EGP', symbol: 'E£',    name: 'Egyptian Pound' },
  { code: 'NGN', symbol: '₦',     name: 'Nigerian Naira' },
  { code: 'KES', symbol: 'KSh',   name: 'Kenyan Shilling' },
  { code: 'ARS', symbol: 'AR$',   name: 'Argentine Peso' },
  { code: 'CLP', symbol: 'CL$',   name: 'Chilean Peso' },
  { code: 'COP', symbol: 'CO$',   name: 'Colombian Peso' },
  { code: 'PKR', symbol: '₨',     name: 'Pakistani Rupee' },
  { code: 'QAR', symbol: 'ر.ق',   name: 'Qatari Riyal' },
  { code: 'KWD', symbol: 'د.ك',   name: 'Kuwaiti Dinar' },
  { code: 'BHD', symbol: '.د.ب',  name: 'Bahraini Dinar' },
  { code: 'OMR', symbol: 'ر.ع.',   name: 'Omani Rial' },
  { code: 'JOD', symbol: 'JD',    name: 'Jordanian Dinar' },
];

const AGGS = [
  { value: '$sum', label: 'Sum' },
  { value: '$avg', label: 'Average' },
  { value: '$count', label: 'Count' },
  { value: '$min', label: 'Min' },
  { value: '$max', label: 'Max' },
];

const COMPARISONS = [
  { value: 'none', label: 'None' },
  { value: 'lastPeriod', label: 'Previous period' },
  { value: 'lastYear', label: 'Same period last year' },
];

const SOURCE_KINDS = [
  { value: 'collection', label: 'Collection' },
  { value: 'dataset', label: 'Dataset' },
  { value: 'question', label: 'Report' },
];

const FILTER_OPS = [
  { value: '$eq', label: '=' },
  { value: '$ne', label: '≠' },
  { value: '$gt', label: '>' },
  { value: '$gte', label: '≥' },
  { value: '$lt', label: '<' },
  { value: '$lte', label: '≤' },
  { value: '$in', label: 'in (csv)' },
  { value: '$nin', label: 'not in (csv)' },
  { value: '$regex', label: 'matches (regex)' },
  { value: '$exists', label: 'exists' },
];

function bandColor(value, targets) {
  if (!targets?.bands?.length || value == null) return null;
  // Treat empty / blank `to` as +Infinity so an open-ended top band still works.
  const upper = (b) => {
    if (b.to == null || b.to === '' || isNaN(Number(b.to))) return Infinity;
    return Number(b.to);
  };
  const sorted = [...targets.bands].sort((a, b) => upper(a) - upper(b));
  for (const band of sorted) {
    if (Number(value) <= upper(band)) return band.color;
  }
  return sorted[sorted.length - 1].color;
}

/**
 * Coerce target inputs (which TextField stores as strings) into numbers
 * before sending to the backend. Empty / NaN entries become null so they
 * don't poison the comparator.
 */
function normalizeTargets(t) {
  if (!t) return t;
  const num = (v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };
  return {
    ...t,
    value: num(t.value),
    bands: (t.bands || []).map((b) => ({ ...b, to: num(b.to) })),
  };
}

/** Reusable card section with optional header action button */
function SectionCard({ title, description, children, action }) {
  return (
    <Box sx={{ bgcolor: '#fff', borderRadius: 2.5, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <Box sx={{ px: 2.5, py: 1.75, borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
        <Box>
          <Typography variant="body2" fontWeight={700} color="#0f172a">{title}</Typography>
          {description && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block', lineHeight: 1.4 }}>
              {description}
            </Typography>
          )}
        </Box>
        {action && <Box sx={{ flexShrink: 0, mt: 0.25 }}>{action}</Box>}
      </Box>
      <Stack spacing={1.5} sx={{ p: 2.5 }}>
        {children}
      </Stack>
    </Box>
  );
}

/** Clickable tile for source-type / format-type selection */
function ChoiceCard({ selected, onClick, label, sub }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        flex: 1, p: 1.75, borderRadius: 2, border: '1.5px solid',
        cursor: 'pointer', textAlign: 'center',
        borderColor: selected ? '#3b82f6' : '#e2e8f0',
        bgcolor: selected ? '#eff6ff' : '#fff',
        boxShadow: selected ? '0 0 0 3px rgba(59,130,246,0.12)' : 'none',
        transition: 'all .14s ease',
        '&:hover': {
          borderColor: selected ? '#3b82f6' : '#93c5fd',
          bgcolor: selected ? '#eff6ff' : '#f8fafc',
        },
      }}
    >
      <Typography variant="body2" fontWeight={selected ? 700 : 500} color={selected ? '#1d4ed8' : 'text.secondary'}>
        {label}
      </Typography>
      {sub && (
        <Typography variant="caption" color={selected ? '#3b82f6' : 'text.disabled'} sx={{ display: 'block', mt: 0.25 }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}

/** Small label+value row for the preview rail */
function PreviewRow({ label, value }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
      <Typography variant="caption" color="text.disabled" fontWeight={600} sx={{ flexShrink: 0 }}>{label}</Typography>
      <Typography variant="caption" color="text.secondary" fontWeight={500} sx={{ textAlign: 'right', wordBreak: 'break-word' }}>{value}</Typography>
    </Box>
  );
}

/** Palette of soft pastel indicator colours used by the band colour picker. */
const PASTEL_COLORS = [
  '#fca5a5', '#fdba74', '#fde68a', '#d9f99d',
  '#86efac', '#6ee7b7', '#a5f3fc', '#93c5fd',
  '#a5b4fc', '#d8b4fe', '#fbcfe8', '#cbd5e1',
];

function PastelColorPicker({ value, onChange }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, width: 136 }}>
      {PASTEL_COLORS.map((c) => (
        <Box
          key={c}
          onClick={() => onChange(c)}
          sx={{
            width: 20, height: 20, borderRadius: 0.75, bgcolor: c,
            border: value === c ? '2.5px solid #0f172a' : '1.5px solid rgba(0,0,0,0.12)',
            cursor: 'pointer',
            transition: 'transform .1s',
            '&:hover': { transform: 'scale(1.25)', zIndex: 1, position: 'relative' },
          }}
        />
      ))}
    </Box>
  );
}

function MetricEditDialog({ open, onClose, onSave, initial = {} }) {
  const [tab, setTab] = useState(0);
  const [name, setName] = useState(initial.name || '');
  const [description, setDescription] = useState(initial.description || '');
  // Source: kind + (collection name | dataset id | question id).
  // Legacy KPIs only have `collection`, so default kind to 'collection'.
  const [sourceKind, setSourceKind] = useState(initial.source?.kind || 'collection');
  const [collection, setCollection] = useState(
    initial.source?.kind === 'collection' || !initial.source?.kind
      ? (initial.collection || '')
      : ''
  );
  const [sourceId, setSourceId] = useState(
    initial.source?.kind && initial.source.kind !== 'collection' ? (initial.source.id || '') : ''
  );
  const [definition, setDefinition] = useState(() => {
    const d = initial.definition || {
      numerator: { agg: '$sum', field: '', filters: [] },
      denominator: null,
      filters: [],
      timeFilter: null,
      comparison: 'lastPeriod',
    };
    // Legacy KPIs may not have a top-level filters array.
    if (!Array.isArray(d.filters)) d.filters = [];
    return d;
  });
  const [pipeline, setPipeline] = useState(JSON.stringify(initial.pipeline || [], null, 2));
  const [usePipeline, setUsePipeline] = useState(!!(initial.pipeline?.length && !initial.definition));
  const [format, setFormat] = useState(initial.format || {
    kind: initial.displayFormat || 'number',
    decimals: 0, compact: false, negatives: 'minus',
    prefix: initial.prefix || '', suffix: initial.suffix || '',
    currencyCode: '',
  });
  const [targets, setTargets] = useState(initial.targets || {
    value: initial.goalValue ?? '', direction: 'higherBetter',
    bands: [{ to: '', color: '#fca5a5' }, { to: '', color: '#86efac' }],
  });
  const [targetSuggest, setTargetSuggest] = useState({ loading: false, result: null });
  const [verified, setVerified] = useState(!!initial.verified);
  const [collections, setCollections] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [fields, setFields] = useState([]);
  const [error, setError] = useState('');

  // Live preview evaluation — fires 800 ms after the config stops changing.
  const [previewEval, setPreviewEval] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewTimer = useRef(null);

  const setKpiCtx = useKpiContextStore((s) => s.setKpi);
  const clearKpiCtx = useKpiContextStore((s) => s.clearKpi);

  // Publish KPI context for the global AI drawer.
  useEffect(() => {
    if (!open) { clearKpiCtx(); return; }
    setKpiCtx({
      name,
      description,
      collection: sourceKind === 'collection' ? collection : undefined,
      definition: usePipeline ? null : definition,
      pipeline: usePipeline ? (() => { try { return JSON.parse(pipeline); } catch { return []; } })() : [],
      format,
      targets,
      verified,
    });
  }, [open, name, description, sourceKind, collection, definition, pipeline, usePipeline, format, targets, verified]); // eslint-disable-line
  useEffect(() => () => clearKpiCtx(), [clearKpiCtx]);

  const suggestTarget = async () => {
    setTargetSuggest({ loading: true, result: null });
    try {
      const { data } = await api.post('/ai/suggest-target', {
        name,
        description,
        direction: targets.direction || 'higherBetter',
      });
      setTargetSuggest({ loading: false, result: data });
    } catch {
      setTargetSuggest({ loading: false, result: null });
    }
  };

  useEffect(() => {
    if (!open) return;
    api.get('/schema/collections').then((r) => setCollections(r.data)).catch(() => {});
    api.get('/models').then((r) => setDatasets(r.data || [])).catch(() => {});
    api.get('/questions').then((r) => setQuestions(r.data || [])).catch(() => {});
  }, [open]);

  // Debounced live preview: re-evaluate 800 ms after any config change.
  useEffect(() => {
    if (!open) return;
    // Require a source to be configured before evaluating.
    if (sourceKind === 'collection' && !collection) return;
    if ((sourceKind === 'dataset' || sourceKind === 'question') && !sourceId) return;
    // Require either a valid definition or a non-empty pipeline.
    if (!usePipeline && !definition?.numerator?.agg) return;
    if (usePipeline) {
      try { JSON.parse(pipeline); } catch { return; }
    }
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const parsedPipeline = usePipeline ? JSON.parse(pipeline) : [];
        const payload = {
          source: sourceKind === 'collection' ? { kind: 'collection' } : { kind: sourceKind, id: sourceId },
          collection: sourceKind === 'collection' ? collection : undefined,
          definition: usePipeline ? null : definition,
          pipeline: parsedPipeline,
        };
        const res = await api.post('/metrics/evaluate-preview', payload);
        setPreviewEval(res.data);
      } catch {
        setPreviewEval({ error: true });
      } finally {
        setPreviewLoading(false);
      }
    }, 800);
    return () => clearTimeout(previewTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceKind, collection, sourceId, definition, pipeline, usePipeline]);

  // Load fields for the chosen source so Field inputs become dropdowns.
  useEffect(() => {
    setFields([]);
    if (sourceKind === 'collection') {
      if (!collection) return;
      api.get('/schema/source/fields', { params: { kind: 'collection', name: collection } })
        .then((r) => setFields(r.data || []))
        .catch(() => setFields([]));
    } else if (sourceKind === 'dataset' || sourceKind === 'question') {
      if (!sourceId) return;
      api.get('/schema/source/fields', { params: { kind: sourceKind, id: sourceId } })
        .then((r) => setFields(r.data || []))
        .catch(() => setFields([]));
    }
  }, [sourceKind, collection, sourceId]);

  const handleSave = async () => {
    setError('');
    if (!name) return setError('Name is required');
    if (sourceKind === 'collection' && !collection) return setError('Collection is required');
    if ((sourceKind === 'dataset' || sourceKind === 'question') && !sourceId) {
      return setError(`${sourceKind === 'dataset' ? 'Dataset' : 'Report'} is required`);
    }
    const source = sourceKind === 'collection'
      ? { kind: 'collection' }
      : { kind: sourceKind, id: sourceId };
    let payload = {
      name, description, source, format, targets: normalizeTargets(targets),
      verified,
      displayFormat: format.kind, prefix: format.prefix, suffix: format.suffix,
      goalValue: targets.value === '' || targets.value == null ? undefined : Number(targets.value),
    };
    // Only send `collection` directly when the user explicitly picked one;
    // for dataset/report sources the backend resolves it from the source id.
    if (sourceKind === 'collection') payload.collection = collection;
    if (usePipeline) {
      try { payload.pipeline = JSON.parse(pipeline); }
      catch { return setError('Pipeline must be valid JSON array'); }
      payload.definition = null;
    } else {
      if (!definition.numerator.agg) return setError('Numerator aggregation is required');
      if (definition.numerator.agg !== '$count' && !definition.numerator.field)
        return setError('Numerator field is required (or use Count)');
      // Strip incomplete filter rows so they don't blow up the compiler
      const cleanFilters = (definition.filters || []).filter(
        (f) => f && f.field && f.operator && (f.operator === '$exists' || f.value !== '' && f.value != null)
      );
      payload.definition = { ...definition, filters: cleanFilters };
      payload.pipeline = [];
    }
    try {
      await onSave(payload);
      onClose();
    } catch (e) { setError(e.response?.data?.error || e.message); }
  };

  const updateFilter = (i, patch) => {
    const next = [...(definition.filters || [])];
    next[i] = { ...next[i], ...patch };
    setDefinition({ ...definition, filters: next });
  };
  const removeFilter = (i) => {
    setDefinition({ ...definition, filters: (definition.filters || []).filter((_, j) => j !== i) });
  };
  const addFilter = () => {
    setDefinition({ ...definition, filters: [...(definition.filters || []), { field: '', operator: '$eq', value: '' }] });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 4,
          overflow: 'hidden',
          height: '90vh',
          maxHeight: 820,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 32px 64px rgba(0,0,0,0.14)',
          border: '1px solid',
          borderColor: 'divider',
        },
      }}
    >
      {/* ── Branded header ────────────────────────────────────────── */}
      <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        px: 3, pt: 3, pb: 2.5,
        background: 'linear-gradient(135deg, rgba(30,64,175,0.05) 0%, rgba(99,102,241,0.04) 100%)',
        borderBottom: '1px solid', borderColor: 'divider',
        flexShrink: 0,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <img src="/fyntrac9.png" alt="Fyntrac" style={{ width: 72, height: 'auto' }} />
          <Box>
            <Chip
              label="KPI"
              size="small"
              sx={{
                height: 18, fontSize: '0.6rem', fontWeight: 700, letterSpacing: 0.8,
                textTransform: 'uppercase', bgcolor: alpha('#3f51b5', 0.1),
                color: '#3f51b5', mb: 0.5, borderRadius: 1,
              }}
            />
            <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2, color: 'text.primary' }}>
              {name?.trim() || (initial._id ? 'Edit KPI' : 'New KPI')}
            </Typography>
          </Box>
          {verified && (
            <Chip
              icon={<VerifiedIcon sx={{ fontSize: '13px !important', color: '#166534 !important' }} />}
              label="Verified"
              size="small"
              sx={{ bgcolor: '#dcfce7', color: '#166534', fontWeight: 700, height: 22, fontSize: '0.68rem', border: 'none' }}
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            size="small" variant="contained" onClick={handleSave}
            sx={{ fontWeight: 700, px: 2.5, borderRadius: 2 }}
          >
            Save KPI
          </Button>
          <Tooltip title="Close" placement="left">
            <IconButton
              onClick={onClose} size="small"
              sx={{ color: 'text.secondary', bgcolor: 'action.hover', borderRadius: 2, '&:hover': { bgcolor: 'error.50', color: 'error.main' } }}
            >
              <HighlightOffOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* ── Step tabs ─────────────────────────────────────────────── */}
      <Box sx={{
        display: 'flex', gap: 0, flexShrink: 0,
        borderBottom: '1px solid #e2e8f0',
        bgcolor: '#fff',
        overflowX: 'auto',
        px: 2,
      }}>
        {[
          { label: 'Details', icon: <InfoOutlinedIcon sx={{ fontSize: 15 }} /> },
          { label: 'Source', icon: <DataObjectIcon sx={{ fontSize: 15 }} /> },
          { label: 'Definition', icon: <TuneIcon sx={{ fontSize: 15 }} /> },
          { label: 'Format', icon: <PaletteIcon sx={{ fontSize: 15 }} /> },
          { label: 'Targets', icon: <TrackChangesIcon sx={{ fontSize: 15 }} /> },
        ].map(({ label, icon }, i) => (
          <Box
            key={label}
            onClick={() => setTab(i)}
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.75,
              px: 2, py: 1.5, cursor: 'pointer', position: 'relative',
              color: tab === i ? '#1e40af' : '#64748b',
              fontWeight: tab === i ? 700 : 500,
              fontSize: '0.82rem',
              whiteSpace: 'nowrap',
              transition: 'color .12s',
              '&:hover': { color: tab === i ? '#1e40af' : '#1e293b' },
              '&::after': {
                content: '""',
                position: 'absolute', bottom: 0, left: 0, right: 0,
                height: 2.5, borderRadius: '2px 2px 0 0',
                bgcolor: tab === i ? '#3b82f6' : 'transparent',
                transition: 'background-color .12s',
              },
            }}
          >
            {icon}
            <Typography variant="body2" fontWeight="inherit" fontSize="inherit" color="inherit">
              {label}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* ── Body ──────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Content area */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 3, bgcolor: '#f8fafc' }}>

          {/* ── Details ─────────────────────────────────────────────── */}
          {tab === 0 && (
            <Stack spacing={2}>
              <SectionCard
                title="Identity"
                description="Give this KPI a concise name and a plain-English description so teammates understand it at a glance."
              >
                <TextField
                  label="KPI name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  fullWidth size="small"
                  placeholder="e.g. Monthly Revenue, Churn Rate, Avg. Days Open"
                  autoFocus
                />
                <TextField
                  label="Description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  fullWidth size="small"
                  multiline rows={3}
                  placeholder="Describe what this KPI measures and when to use it…"
                />
              </SectionCard>

              <SectionCard title="Quality">
                <Box sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  px: 2, py: 1.5, borderRadius: 2, bgcolor: '#f0fdf4', border: '1px solid #bbf7d0',
                }}>
                  <Box>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <CheckCircleIcon sx={{ fontSize: 16, color: '#16a34a' }} />
                      <Typography variant="body2" fontWeight={700} color="#15803d">Verified KPI</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ pl: 3, display: 'block' }}>
                      Mark as certified — a green <VerifiedIcon sx={{ fontSize: 10, verticalAlign: 'middle', color: '#16a34a' }} /> badge appears on every tile
                    </Typography>
                  </Box>
                  <Switch checked={verified} onChange={(e) => setVerified(e.target.checked)} color="success" size="small" />
                </Box>
              </SectionCard>
            </Stack>
          )}

          {/* ── Source ──────────────────────────────────────────────── */}
          {tab === 1 && (
            <Stack spacing={2}>
              <SectionCard
                title="Data source"
                description="Choose where this KPI pulls its rows from — a raw collection, a saved dataset, or a report."
              >
                <Stack direction="row" spacing={1.5}>
                  {SOURCE_KINDS.map((k) => (
                    <ChoiceCard
                      key={k.value}
                      selected={sourceKind === k.value}
                      onClick={() => {
                        setSourceKind(k.value);
                        setCollection('');
                        setSourceId('');
                        setDefinition((d) => ({
                          ...d,
                          filters: [],
                          periodField: null,
                          numerator: { ...d.numerator, field: '', filters: [] },
                          denominator: d.denominator ? { ...d.denominator, field: '', filters: [] } : null,
                        }));
                      }}
                      label={k.label}
                      sub={k.value === 'collection' ? 'MongoDB collection' : k.value === 'dataset' ? 'Saved dataset model' : 'Saved report / question'}
                    />
                  ))}
                </Stack>

                {sourceKind === 'collection' && (
                  <FormControl size="small" fullWidth>
                    <InputLabel>Source collection</InputLabel>
                    <Select value={collection} label="Source collection" onChange={(e) => setCollection(e.target.value)}>
                      {collections.filter((c) => c.toLowerCase() !== 'eventhistory').map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                    </Select>
                  </FormControl>
                )}
                {sourceKind === 'dataset' && (
                  <FormControl size="small" fullWidth>
                    <InputLabel>Source dataset</InputLabel>
                    <Select value={sourceId} label="Source dataset" onChange={(e) => setSourceId(e.target.value)}>
                      {datasets.map((d) => <MenuItem key={d._id} value={d._id}>{d.name}</MenuItem>)}
                      {!datasets.length && <MenuItem disabled value=""><em>No datasets available</em></MenuItem>}
                    </Select>
                  </FormControl>
                )}
                {sourceKind === 'question' && (
                  <FormControl size="small" fullWidth>
                    <InputLabel>Source report</InputLabel>
                    <Select value={sourceId} label="Source report" onChange={(e) => setSourceId(e.target.value)}>
                      {questions.map((q) => <MenuItem key={q._id} value={q._id}>{q.name}</MenuItem>)}
                      {!questions.length && <MenuItem disabled value=""><em>No reports available</em></MenuItem>}
                    </Select>
                  </FormControl>
                )}
              </SectionCard>
            </Stack>
          )}

          {/* ── Definition ──────────────────────────────────────────── */}
          {tab === 2 && (
            <Stack spacing={2}>
              <SectionCard
                title="Calculation mode"
                description="Use the visual builder for most KPIs. Switch to raw pipeline mode for complete control."
              >
                <Box sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  px: 2, py: 1.5, borderRadius: 2, bgcolor: usePipeline ? '#fffbeb' : 'transparent',
                  border: '1px solid', borderColor: usePipeline ? '#fde68a' : '#e2e8f0',
                  transition: 'all .15s',
                }}>
                  <Box>
                    <Typography variant="body2" fontWeight={700}>Raw MongoDB pipeline</Typography>
                    <Typography variant="caption" color="text.secondary">Write your own aggregation for advanced use-cases</Typography>
                  </Box>
                  <Switch checked={usePipeline} onChange={(e) => setUsePipeline(e.target.checked)} size="small" />
                </Box>
              </SectionCard>

              {!usePipeline ? (
                <>
                  <SectionCard title="Numerator" description="The main value this KPI computes.">
                    <Stack direction="row" spacing={1.5}>
                      <FormControl size="small" sx={{ minWidth: 150 }}>
                        <InputLabel>Aggregation</InputLabel>
                        <Select label="Aggregation" value={definition.numerator.agg}
                          onChange={(e) => setDefinition({ ...definition, numerator: { ...definition.numerator, agg: e.target.value } })}>
                          {AGGS.map(a => <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>)}
                        </Select>
                      </FormControl>
                      {definition.numerator.agg !== '$count' && (
                        <FormControl size="small" sx={{ flex: 1 }} disabled={!fields.length}>
                          <InputLabel>Field</InputLabel>
                          <Select label="Field" value={definition.numerator.field || ''}
                            onChange={(e) => setDefinition({ ...definition, numerator: { ...definition.numerator, field: e.target.value } })}>
                            {fields.filter((f) => f.type === 'number' && f.semanticType !== 'period').map((f) => <MenuItem key={f.name} value={f.name}>{f.name}{f.semanticType ? ` (${f.semanticType})` : ''}</MenuItem>)}
                            {!fields.length && <MenuItem disabled value=""><em>Pick a source first</em></MenuItem>}
                          </Select>
                        </FormControl>
                      )}
                    </Stack>

                    <Box sx={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      mt: 1.5, px: 1.5, py: 1.25, borderRadius: 1.5,
                      bgcolor: definition.denominator ? '#eff6ff' : '#f8fafc',
                      border: '1px solid', borderColor: definition.denominator ? '#bfdbfe' : '#e2e8f0',
                      transition: 'all .15s',
                    }}>
                      <Box>
                        <Typography variant="body2" fontWeight={700}>Add denominator</Typography>
                        <Typography variant="caption" color="text.secondary">Creates a ratio (numerator ÷ denominator)</Typography>
                      </Box>
                      <Switch size="small" checked={!!definition.denominator}
                        onChange={(e) => setDefinition({ ...definition, denominator: e.target.checked ? { agg: '$sum', field: '', filters: [] } : null })} />
                    </Box>

                    {definition.denominator && (
                      <Box sx={{ mt: 1.5, p: 2, borderRadius: 2, bgcolor: '#eff6ff', border: '1px solid #bfdbfe' }}>
                        <Typography variant="caption" fontWeight={700} color="#1d4ed8" sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1.5, display: 'block' }}>
                          Denominator
                        </Typography>
                        <Stack direction="row" spacing={1.5}>
                          <FormControl size="small" sx={{ minWidth: 150 }}>
                            <InputLabel>Aggregation</InputLabel>
                            <Select label="Aggregation" value={definition.denominator.agg}
                              onChange={(e) => setDefinition({ ...definition, denominator: { ...definition.denominator, agg: e.target.value } })}>
                              {AGGS.map(a => <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>)}
                            </Select>
                          </FormControl>
                          {definition.denominator.agg !== '$count' && (
                            <FormControl size="small" sx={{ flex: 1 }} disabled={!fields.length}>
                              <InputLabel>Field</InputLabel>
                              <Select label="Field" value={definition.denominator.field || ''}
                                onChange={(e) => setDefinition({ ...definition, denominator: { ...definition.denominator, field: e.target.value } })}>
                                {fields.filter((f) => f.type === 'number' && f.semanticType !== 'period').map((f) => <MenuItem key={f.name} value={f.name}>{f.name}{f.semanticType ? ` (${f.semanticType})` : ''}</MenuItem>)}
                                {!fields.length && <MenuItem disabled value=""><em>Pick a source first</em></MenuItem>}
                              </Select>
                            </FormControl>
                          )}
                        </Stack>
                      </Box>
                    )}
                  </SectionCard>

                  <SectionCard
                    title="Filters"
                    description="Narrow rows before aggregation — all conditions are AND-ed."
                    action={
                      <Button size="small" startIcon={<AddIcon />} onClick={addFilter}>Add filter</Button>
                    }
                  >
                    {(definition.filters || []).length === 0 ? (
                      <Box sx={{ py: 2, textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: 1.5 }}>
                        <Typography variant="caption" color="text.secondary">No filters — all source rows are included</Typography>
                      </Box>
                    ) : (
                      <Stack spacing={1}>
                        {(definition.filters || []).map((f, i) => (
                          <Stack key={i} direction="row" spacing={1} alignItems="center"
                            sx={{ p: 1.25, bgcolor: '#f8fafc', borderRadius: 1.5, border: '1px solid #e2e8f0' }}>
                            <FormControl size="small" sx={{ flex: 1.4 }} disabled={!fields.length}>
                              <InputLabel>Field</InputLabel>
                              <Select label="Field" value={f.field || ''} onChange={(e) => updateFilter(i, { field: e.target.value, value: '' })}>
                                {fields.map((fd) => <MenuItem key={fd.name} value={fd.name}>{fd.name} ({fd.semanticType || fd.type})</MenuItem>)}
                                {!fields.length && <MenuItem disabled value=""><em>Pick a source first</em></MenuItem>}
                              </Select>
                            </FormControl>
                            <FormControl size="small" sx={{ minWidth: 116 }}>
                              <InputLabel>Operator</InputLabel>
                              <Select label="Operator" value={f.operator || '$eq'} onChange={(e) => updateFilter(i, { operator: e.target.value })}>
                                {FILTER_OPS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                              </Select>
                            </FormControl>
                            {f.operator !== '$exists' && (
                              <FilterValueInput
                                collection={sourceKind === 'collection' ? collection : undefined}
                                field={f.field}
                                operator={f.operator || '$eq'}
                                value={f.value ?? ''}
                                onChange={(val) => updateFilter(i, { value: val })}
                                extraFields={[]}
                              />
                            )}
                            <IconButton size="small" onClick={() => removeFilter(i)}
                              sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        ))}
                      </Stack>
                    )}
                  </SectionCard>

                  <SectionCard
                    title="Time intelligence"
                    description="Pick a period field (e.g. year_month, quarter) — the latest value becomes the current period; the previous is the comparison."
                  >
                    <Stack direction="row" spacing={1.5}>
                      <FormControl size="small" sx={{ flex: 1 }} disabled={!fields.length}>
                        <InputLabel>Period field</InputLabel>
                        <Select label="Period field" value={definition.periodField || ''}
                          onChange={(e) => setDefinition({ ...definition, periodField: e.target.value || null })}>
                          <MenuItem value=""><em>None</em></MenuItem>
                          {fields.filter((f) => f.type === 'date' || f.semanticType === 'period').map((f) => <MenuItem key={f.name} value={f.name}>{f.name}{f.type ? ` (${f.semanticType || f.type})` : ''}</MenuItem>)}
                        </Select>
                      </FormControl>
                      <FormControl size="small" sx={{ flex: 1 }}>
                        <InputLabel>Compare with</InputLabel>
                        <Select label="Compare with" value={definition.comparison || 'none'}
                          onChange={(e) => setDefinition({ ...definition, comparison: e.target.value })}>
                          {/* lastYear is not supported for period-field KPIs (period labels have no year semantics) */}
                          {(definition.periodField
                            ? COMPARISONS.filter((c) => c.value !== 'lastYear')
                            : COMPARISONS
                          ).map(c => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
                        </Select>
                      </FormControl>
                    </Stack>
                  </SectionCard>
                </>
              ) : (
                <SectionCard title="MongoDB aggregation pipeline" description="Must produce a single document with a value field.">
                  <TextField
                    value={pipeline}
                    onChange={(e) => setPipeline(e.target.value)}
                    multiline minRows={12} fullWidth size="small"
                    inputProps={{ style: { fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 } }}
                    placeholder='[{"$group":{"_id":null,"value":{"$sum":"$amount"}}}]'
                  />
                </SectionCard>
              )}
            </Stack>
          )}

          {/* ── Format ──────────────────────────────────────────────── */}
          {tab === 3 && (
            <Stack spacing={2}>
              <SectionCard
                title="Value type"
                description="Controls how the number is formatted on tiles and dashboards."
              >
                <Stack direction="row" spacing={1.5}>
                  {FORMAT_KINDS.map((k) => (
                    <ChoiceCard
                      key={k.value}
                      selected={format.kind === k.value}
                      onClick={() => setFormat({ ...format, kind: k.value })}
                      label={k.label}
                      sub={k.value === 'number' ? '1,234' : k.value === 'currency' ? '$1,234' : '12.3%'}
                    />
                  ))}
                </Stack>
              </SectionCard>

              {format.kind === 'currency' && (
                <SectionCard
                  title="Currency"
                  description="Select a currency to auto-set the symbol prefix. The prefix below can still be overridden manually."
                >
                  <Autocomplete
                    size="small"
                    options={CURRENCIES}
                    getOptionLabel={(o) => `${o.code} — ${o.name}`}
                    value={CURRENCIES.find((c) => c.code === format.currencyCode) || null}
                    onChange={(_, c) => setFormat({ ...format, currencyCode: c?.code || '', prefix: c?.symbol || format.prefix })}
                    renderOption={(props, o) => (
                      <Box component="li" {...props} sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                        <Typography variant="body2" fontWeight={700} sx={{ minWidth: 44, color: 'primary.main' }}>{o.code}</Typography>
                        <Typography variant="body2" sx={{ flex: 1 }}>{o.name}</Typography>
                        <Typography variant="body2" color="text.secondary" fontWeight={600}>{o.symbol}</Typography>
                      </Box>
                    )}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Currency"
                        placeholder="Search currencies…"
                        InputProps={{ ...params.InputProps,
                          startAdornment: format.currencyCode ? (
                            <Typography variant="body2" sx={{ ml: 1, mr: 0.5, fontWeight: 700, color: 'primary.main' }}>{format.currencyCode}</Typography>
                          ) : params.InputProps.startAdornment,
                        }}
                      />
                    )}
                    isOptionEqualToValue={(o, v) => o.code === v.code}
                    sx={{ maxWidth: 380 }}
                  />
                </SectionCard>
              )}

              <SectionCard title="Display options">
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap">
                  <TextField size="small" label="Decimal places" type="number" value={format.decimals ?? 0}
                    onChange={(e) => setFormat({ ...format, decimals: Number(e.target.value) })} sx={{ width: 160 }} inputProps={{ min: 0, max: 6 }} />
                  <FormControl size="small" sx={{ minWidth: 170 }}>
                    <InputLabel>Negatives</InputLabel>
                    <Select label="Negatives" value={format.negatives || 'minus'}
                      onChange={(e) => setFormat({ ...format, negatives: e.target.value })}>
                      <MenuItem value="minus">−1,000</MenuItem>
                      <MenuItem value="parens">(1,000)</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField size="small" label="Prefix" value={format.prefix || ''}
                    onChange={(e) => setFormat({ ...format, prefix: e.target.value })} sx={{ width: 140 }} placeholder="e.g. $, £" />
                  <TextField size="small" label="Suffix" value={format.suffix || ''}
                    onChange={(e) => setFormat({ ...format, suffix: e.target.value })} sx={{ width: 140 }} placeholder="e.g. USD, pts" />
                </Stack>
                <Box sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  px: 2, py: 1.25, borderRadius: 1.5, border: '1px solid #e2e8f0',
                }}>
                  <Box>
                    <Typography variant="body2" fontWeight={700}>Compact notation</Typography>
                    <Typography variant="caption" color="text.secondary">Display large numbers as 1.2M, 3.4K, etc.</Typography>
                  </Box>
                  <Switch size="small" checked={!!format.compact} onChange={(e) => setFormat({ ...format, compact: e.target.checked })} />
                </Box>
              </SectionCard>

              {/* Live format preview */}
              <Box sx={{
                p: 3, borderRadius: 2.5, textAlign: 'center',
                background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                border: '1px solid #bae6fd',
              }}>
                <Typography variant="caption" color="#0284c7" fontWeight={700}
                  sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1, display: 'block' }}>
                  Live preview
                </Typography>
                <Typography sx={{ fontSize: '3rem', fontWeight: 900, letterSpacing: '-0.03em', color: '#0c4a6e', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {formatKpi(previewEval?.value != null ? previewEval.value : 123456.78, format)}
                </Typography>
                <Typography variant="caption" color="#0284c7" sx={{ mt: 0.5, display: 'block' }}>
                  {previewEval?.value != null ? 'live evaluated value' : 'sample value 123,456.78'}
                </Typography>
              </Box>
            </Stack>
          )}

          {/* ── Targets ─────────────────────────────────────────────── */}
          {tab === 4 && (
            <Stack spacing={2}>
              <SectionCard
                title="Goal"
                description="Set a target value and direction to show progress bars and delta chips on tiles."
                action={
                  <Tooltip placement="left" arrow
                    componentsProps={{ tooltip: { sx: { maxWidth: 300, bgcolor: '#1e293b', border: '1px solid #334155' } }, arrow: { sx: { color: '#1e293b' } } }}
                    title={
                      <Box sx={{ p: 0.5 }}>
                        <Typography variant="caption" fontWeight={700} sx={{ display: 'block', mb: 0.5, color: '#e2e8f0' }}>Goal</Typography>
                        {[
                          { l: 'Goal value', d: 'The number you are aiming for (e.g. 1,000,000 for revenue or 0 for defects). Leave blank to hide the progress indicator.' },
                          { l: 'Higher is better', d: 'Progress is shown as actual ÷ goal. A value above the goal turns green. Use for revenue, profit, conversion rate.' },
                          { l: 'Lower is better', d: 'A value below the goal turns green. Use for costs, error counts, days overdue.' },
                        ].map(({ l, d }) => (
                          <Box key={l} sx={{ mb: 0.6 }}>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#93c5fd', display: 'block' }}>{l}</Typography>
                            <Typography variant="caption" sx={{ color: '#94a3b8' }}>{d}</Typography>
                          </Box>
                        ))}
                      </Box>
                    }>
                    <InfoOutlinedIcon sx={{ fontSize: 16, color: '#94a3b8', cursor: 'default', mt: 0.25 }} />
                  </Tooltip>
                }
              >
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="flex-start" flexWrap="wrap" useFlexGap>
                  <TextField size="small" label="Goal value" type="number" value={targets.value ?? ''}
                    onChange={(e) => { setTargets({ ...targets, value: e.target.value }); setTargetSuggest({ loading: false, result: null }); }}
                    sx={{ width: 200 }} placeholder="e.g. 1000000" />
                  <FormControl size="small" sx={{ flex: 1, minWidth: 180 }}>
                    <InputLabel>Direction</InputLabel>
                    <Select label="Direction" value={targets.direction || 'higherBetter'}
                      onChange={(e) => setTargets({ ...targets, direction: e.target.value })}>
                      <MenuItem value="higherBetter">↑ Higher is better</MenuItem>
                      <MenuItem value="lowerBetter">↓ Lower is better</MenuItem>
                    </Select>
                  </FormControl>
                  <Tooltip title="Let AI suggest a target based on the KPI name and direction">
                    <Button
                      size="small" variant="outlined"
                      startIcon={targetSuggest.loading ? <CircularProgress size={13} /> : <AutoAwesomeIcon />}
                      onClick={suggestTarget}
                      disabled={targetSuggest.loading || !name}
                      sx={{
                        borderRadius: 2, textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap',
                        color: '#7c3aed', borderColor: '#ddd6fe', bgcolor: '#faf5ff',
                        '&:hover': { bgcolor: '#ede9fe', borderColor: '#c4b5fd' },
                      }}
                    >
                      Suggest target
                    </Button>
                  </Tooltip>
                </Stack>
                {targetSuggest.result && (
                  <Alert
                    severity="info"
                    icon={<AutoAwesomeIcon fontSize="small" sx={{ color: '#7c3aed' }} />}
                    sx={{ bgcolor: '#faf5ff', border: '1px solid #ddd6fe', color: '#4c1d95', borderRadius: 2, mt: 1.5 }}
                    action={
                      <Button size="small" sx={{ fontWeight: 700, color: '#7c3aed', textTransform: 'none' }}
                        onClick={() => {
                          setTargets({ ...targets, value: String(targetSuggest.result.suggested) });
                          setTargetSuggest({ loading: false, result: null });
                        }}>
                        Use this
                      </Button>
                    }
                  >
                    <Typography variant="body2" fontWeight={700}>Suggested: {Number(targetSuggest.result.suggested).toLocaleString()}</Typography>
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>{targetSuggest.result.reasoning}</Typography>
                  </Alert>
                )}
              </SectionCard>

              <SectionCard
                title="Color bands"
                description="Define value ranges and their indicator colors, sorted by upper bound. Leave 'up to' blank for an open-ended top band."
                action={
                  <Button size="small" startIcon={<AddIcon />}
                    onClick={() => setTargets({ ...targets, bands: [...(targets.bands || []), { to: '', color: '#93c5fd' }] })}>
                    Add band
                  </Button>
                }
              >
                {(targets.bands || []).length === 0 ? (
                  <Box sx={{ py: 2, textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">No bands — the KPI tile uses a neutral color</Typography>
                  </Box>
                ) : (
                  <Stack spacing={1}>
                    {(targets.bands || []).map((b, i) => (
                      <Stack key={i} direction="row" spacing={1.5} alignItems="center"
                        sx={{ p: 1.25, bgcolor: '#f8fafc', borderRadius: 1.5, border: '1px solid #e2e8f0' }}>
                        <Box sx={{
                          width: 28, height: 28, borderRadius: 1, flexShrink: 0,
                          bgcolor: b.color || '#3b82f6',
                          border: '2px solid rgba(0,0,0,0.1)',
                          boxShadow: `0 1px 4px ${b.color || '#3b82f6'}55`,
                        }} />
                        <PastelColorPicker value={b.color || '#fca5a5'}
                          onChange={(c) => {
                            const next = [...targets.bands]; next[i] = { ...next[i], color: c };
                            setTargets({ ...targets, bands: next });
                          }} />
                        <TextField size="small" label="Up to" type="number" value={b.to ?? ''}
                          onChange={(e) => {
                            const next = [...targets.bands]; next[i] = { ...next[i], to: e.target.value };
                            setTargets({ ...targets, bands: next });
                          }}
                          sx={{ width: 150 }} placeholder="∞ (leave blank)" />
                        <IconButton size="small"
                          onClick={() => setTargets({ ...targets, bands: targets.bands.filter((_, j) => j !== i) })}
                          sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </SectionCard>
            </Stack>
          )}
        </Box>

        {/* ── Right preview rail ──────────────────────────────────── */}
        <Box sx={{
          width: 240, flexShrink: 0,
          borderLeft: '1px solid #e2e8f0',
          display: 'flex', flexDirection: 'column',
          bgcolor: '#fff', overflow: 'hidden',
        }}>
          <Box sx={{ px: 2, pt: 2, pb: 1.5, borderBottom: '1px solid #f1f5f9' }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', fontSize: '0.62rem', letterSpacing: '0.08em' }}>
              Live preview
            </Typography>
          </Box>
          <Box sx={{ p: 2, flex: 1, overflow: 'auto' }}>
            <Box sx={{ height: 200, mb: 2.5 }}>
              <KpiTile
                title={name || 'KPI Name'}
                value={previewEval?.value ?? null}
                trendValue={null}
                format={format}
                direction={targets?.direction || 'higherBetter'}
                verified={verified}
                goal={targets?.value ? { value: Number(targets.value) } : null}
                loading={previewLoading}
                animateCard
              />
            </Box>
            <Divider sx={{ mb: 2 }} />
            <Stack spacing={1}>
              <PreviewRow label="Source" value={
                sourceKind === 'collection' ? (collection || '—') :
                sourceKind === 'dataset' ? (datasets.find(d => d._id === sourceId)?.name || '—') :
                (questions.find(q => q._id === sourceId)?.name || '—')
              } />
              <PreviewRow label="Aggregation" value={
                usePipeline ? 'Pipeline' :
                `${AGGS.find(a => a.value === definition.numerator.agg)?.label || '—'}${definition.numerator.field ? ` of ${definition.numerator.field}` : ''}`
              } />
              <PreviewRow label="Format" value={
                `${FORMAT_KINDS.find(k => k.value === format.kind)?.label || '—'}` +
                `${format.kind === 'currency' && format.currencyCode ? ` · ${format.currencyCode}` : ''}` +
                `${format.compact ? ' · compact' : ''}${format.decimals ? ` · ${format.decimals}dp` : ''}`
              } />
              <PreviewRow label="Goal" value={targets.value ? String(targets.value) : 'None'} />
              <PreviewRow label="Bands" value={`${(targets.bands || []).length} band${(targets.bands || []).length !== 1 ? 's' : ''}`} />
            </Stack>
          </Box>
        </Box>
      </Box>

      {/* ── Error footer ────────────────────────────────────────────── */}
      {error && (
        <Alert severity="error" variant="filled" icon={false} onClose={() => setError('')}
          sx={{ borderRadius: 0, py: 1, px: 3, flexShrink: 0, fontWeight: 600, fontSize: '0.82rem' }}>
          {error}
        </Alert>
      )}
    </Dialog>
  );
}

function MetricCardItem({ metric, onEdit, onDelete }) {
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.post(`/metrics/${metric._id}/evaluate`)
      .then((r) => setEvaluation(r.data))
      .catch(() => setEvaluation({ error: true }))
      .finally(() => setLoading(false));
  }, [metric._id]);

  const value = evaluation?.value;
  const rawTrendValue = evaluation?.trendValue;
  const comparison = evaluation?.comparison;
  // If comparison is configured but previous period returned no data, show delta from zero
  // so the chip still renders and indicates the full value as the increase/decrease.
  const trendValue = rawTrendValue != null
    ? rawTrendValue
    : (comparison && comparison !== 'none' ? 0 : null);
  const targets = metric.targets;
  const sourceLabel = metric.source && metric.source.kind && metric.source.kind !== 'collection'
    ? `${metric.source.kind === 'dataset' ? 'Dataset' : 'Report'}: ${metric.source.name || metric.collection}`
    : metric.collection;

  return (
    <KpiTile
      animateCard
      title={metric.name}
      verified={!!metric.verified}
      value={value}
      trendValue={trendValue}
      comparisonLabel={evaluation?.comparison}
      format={metric.format}
      legacyFormat={metric.displayFormat}
      prefix={metric.prefix}
      suffix={metric.suffix}
      sourceLabel={sourceLabel}
      direction={targets?.direction || 'higherBetter'}
      goal={targets?.value ? { value: Number(targets.value) } : null}
      bandColor={bandColor(value, targets)}
      sparklineSeries={Array.isArray(evaluation?.trendSeries) ? evaluation.trendSeries : null}
      loading={loading}
      error={!!evaluation?.error}
      actions={
        <>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => onEdit(metric)} sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary', bgcolor: 'action.hover' } }}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" onClick={() => onDelete(metric)} sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary', bgcolor: 'action.hover' } }}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </>
      }
    />
  );
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [toast, setToast] = useState({ open: false, msg: '', ok: true });

  const showToast = (msg, ok = true) => {
    setToast({ open: true, msg, ok });
    setTimeout(() => setToast((t) => ({ ...t, open: false })), 3000);
  };

  // AI co-pilot handoff
  useEffect(() => {
    if (searchParams.get('aiDraft') === '1') {
      try {
        const seed = JSON.parse(sessionStorage.getItem('fyntrac_ai_kpi') || 'null');
        if (seed) {
          setEditing({
            name: seed.name || '',
            description: seed.description || seed.plan || '',
            collection: seed.collection || '',
            definition: seed.definition || undefined,
            pipeline: seed.pipeline || undefined,
            format: seed.format || undefined,
            targets: seed.targets || undefined,
            verified: false,
            draftedByAI: true,
          });
          sessionStorage.removeItem('fyntrac_ai_kpi');
        }
      } catch { /* ignore */ }
      // Clear flag from URL
      searchParams.delete('aiDraft');
      setSearchParams(searchParams, { replace: true });
    }
  }, []); // eslint-disable-line

  const reload = () => {
    setLoading(true);
    api.get('/metrics').then((r) => setMetrics(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);

  // Open dialog from ?open=:id (or ?open=new)
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId) return;
    if (openId === 'new') {
      setEditing({});
    } else if (metrics.length) {
      const m = metrics.find((x) => x._id === openId);
      if (m) setEditing(m);
    } else {
      return; // wait for metrics to load
    }
    searchParams.delete('open');
    setSearchParams(searchParams, { replace: true });
  }, [metrics, searchParams, setSearchParams]);

  const handleSave = async (data) => {
    const payload = editing?.draftedByAI ? { ...data, draftedByAI: true } : data;
    const isNew = !(editing && editing._id);
    if (editing && editing._id) await api.put(`/metrics/${editing._id}`, payload);
    else await api.post('/metrics', payload);
    reload();
    showToast(isNew ? 'KPI created successfully' : 'KPI updated successfully');
  };

  const handleDelete = (m) => setDeleteTarget(m);

  const confirmDelete = async () => {
    try {
      const name = deleteTarget?.name || '';
      await api.delete(`/metrics/${deleteTarget._id}`);
      setDeleteTarget(null);
      reload();
      showToast(`"${name}" deleted successfully`);
    } catch (e) {
      showToast(e.response?.data?.error || 'Delete failed', false);
    }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h2">KPIs</Typography>
          <Typography variant="body2" color="text.secondary">
            Reusable key performance indicators — define once, drop into any dashboard.
          </Typography>
        </Box>
        <Tooltip title="New KPI">
          <IconButton
            onClick={() => setEditing({})}
            sx={{
              bgcolor: 'primary.main', color: '#fff', borderRadius: 2,
              '&:hover': { bgcolor: 'primary.dark' },
            }}
          >
            <AddIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {loading ? (
        <Grid container spacing={2}>
          {[1, 2, 3].map((i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 3 }}>
              <Skeleton variant="rounded" sx={KPI_TILE_FRAME_SX} />
            </Grid>
          ))}
        </Grid>
      ) : metrics.length === 0 ? (
        <Card variant="outlined" sx={{ p: 4, textAlign: 'center', mt: 4 }}>
          <SpeedIcon sx={{ fontSize: 56, color: 'text.disabled' }} />
          <Typography variant="h4" sx={{ mt: 1 }}>No KPIs yet</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Define a key performance indicator once — sum, average, ratio or custom pipeline — then reuse it on any dashboard.
          </Typography>
          <Button variant="contained" onClick={() => setEditing({})}>Create your first KPI</Button>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {metrics.map((m) => (
            <Grid size={{ xs: 12, sm: 6, md: 3 }} key={m._id}>
              <Box sx={KPI_TILE_FRAME_SX}>
                <MetricCardItem metric={m} onEdit={setEditing} onDelete={handleDelete} />
              </Box>
            </Grid>
          ))}
        </Grid>
      )}

      {editing != null && (
        <MetricEditDialog open initial={editing} onClose={() => setEditing(null)} onSave={handleSave} />
      )}

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete KPI?</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button onClick={confirmDelete} variant="contained" color="error">Delete</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        autoHideDuration={3000}
      >
        <Alert
          severity={toast.ok ? 'success' : 'error'}
          variant="filled"
          icon={false}
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          sx={toast.ok
            ? { bgcolor: '#dcfce7', color: '#166534', fontWeight: 600, border: '1px solid #bbf7d0', '& .MuiAlert-action': { color: '#166534' } }
            : { bgcolor: '#fee2e2', color: '#991b1b', fontWeight: 600, border: '1px solid #fecaca', '& .MuiAlert-action': { color: '#991b1b' } }}
        >
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
