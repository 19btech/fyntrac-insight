import React, { useEffect, useState } from 'react';
import {
  Box, Card, CardActionArea, CardContent, Typography, Grid, FormControl, InputLabel,
  Select, MenuItem, Stack, Button, Chip, Divider,
} from '@mui/material';
import NumbersIcon from '@mui/icons-material/Numbers';
import TimelineIcon from '@mui/icons-material/Timeline';
import BarChartIcon from '@mui/icons-material/BarChart';
import TableViewIcon from '@mui/icons-material/TableView';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import VerifiedIcon from '@mui/icons-material/Verified';
import api from '../../hooks/useQuery';

const STARTERS = [
  { intent: 'number', icon: <NumbersIcon />, title: 'Show a number (KPI)', desc: 'Net revenue this month, total cash on hand, count of failed payments.' },
  { intent: 'time', icon: <TimelineIcon />, title: 'Compare over time', desc: 'How a number changes day, month, or quarter.' },
  { intent: 'category', icon: <BarChartIcon />, title: 'Compare across categories', desc: 'By region, GL account, customer, or any grouping.' },
  { intent: 'rows', icon: <TableViewIcon />, title: 'Find rows that match', desc: 'All transactions over $50k that failed; all unpaid invoices.' },
  { intent: 'variance', icon: <CompareArrowsIcon />, title: 'Variance vs target', desc: 'Actual vs Budget by account. Colored deltas, no chart juggling.' },
  { intent: 'topn', icon: <LeaderboardIcon />, title: 'Top / bottom N', desc: 'Top 10 customers by net spend; bottom 5 accounts by margin.' },
  { intent: 'ai', icon: <AutoAwesomeIcon />, title: 'Ask in plain English', desc: 'Describe what you want; AI builds it on top of your KPIs and Datasets.' },
];

/**
 * Report starter — finance-friendly tiles that pre-seed dataset + step stack
 * + chart type so the user lands on a near-finished scaffold.
 */
export default function StarterChooser({ onPick, onSkip }) {
  const [collections, setCollections] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [source, setSource] = useState({ kind: 'collection', value: '' });

  useEffect(() => {
    Promise.all([
      api.get('/schema/collections').then((r) => r.data || []).catch(() => []),
      api.get('/models').then((r) => r.data || []).catch(() => []),
    ]).then(([cs, ds]) => {
      setCollections(cs.filter((c) => c.toLowerCase() !== 'eventhistory'));
      setDatasets(ds);
      const certified = ds.find((d) => d.verified);
      if (certified) setSource({ kind: 'dataset', value: certified._id });
      else if (ds[0]) setSource({ kind: 'dataset', value: ds[0]._id });
      else if (cs[0]) setSource({ kind: 'collection', value: cs[0] });
    });
  }, []);

  const handleSourceChange = (e) => {
    const v = e.target.value;
    if (typeof v === 'string' && v.startsWith('ds:')) setSource({ kind: 'dataset', value: v.slice(3) });
    else setSource({ kind: 'collection', value: v });
  };

  const sourceValue = source.kind === 'dataset' ? `ds:${source.value}` : source.value;
  const selectedDataset = datasets.find((d) => d._id === source.value);
  const collection = source.kind === 'dataset' ? selectedDataset?.sourceCollection : source.value;

  const pick = (intent) => onPick({
    intent,
    collection,
    datasetId: source.kind === 'dataset' ? source.value : null,
    datasetName: selectedDataset?.name,
    datasetVerified: !!selectedDataset?.verified,
  });

  return (
    <Box sx={{ maxWidth: 980, mx: 'auto', mt: 4 }}>
      <Typography variant="h2" sx={{ mb: 1 }}>What would you like to know?</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Pick a starting point — we'll wire up the dataset, the steps, and the right chart for you. You can change anything later.
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 3 }} alignItems="center" flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 360 }}>
          <InputLabel>Source</InputLabel>
          <Select label="Source" value={sourceValue || ''} onChange={handleSourceChange}>
            {datasets.length > 0 && (
              <MenuItem disabled value="__h_ds__" sx={{ opacity: 0.6, fontSize: '0.7rem', textTransform: 'uppercase' }}>
                Datasets (recommended)
              </MenuItem>
            )}
            {datasets.map((d) => (
              <MenuItem key={`ds:${d._id}`} value={`ds:${d._id}`}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  {d.verified && <VerifiedIcon sx={{ fontSize: 14, color: '#16a34a' }} />}
                  <span>{d.name}</span>
                </Stack>
              </MenuItem>
            ))}
            {datasets.length > 0 && <Divider key="ds-d" />}
            <MenuItem disabled value="__h_col__" sx={{ opacity: 0.6, fontSize: '0.7rem', textTransform: 'uppercase' }}>
              Raw collections (advanced)
            </MenuItem>
            {collections.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </Select>
        </FormControl>
        {selectedDataset && (
          <Chip
            icon={selectedDataset.verified ? <VerifiedIcon /> : null}
            label={selectedDataset.verified ? `Building on certified dataset · ${selectedDataset.name}` : `Building on ${selectedDataset.name}`}
            color={selectedDataset.verified ? 'success' : 'default'}
            size="small"
            variant="outlined"
          />
        )}
        <Button size="small" onClick={onSkip}>Skip — start blank</Button>
      </Stack>

      <Grid container spacing={2}>
        {STARTERS.map((s) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={s.intent}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardActionArea onClick={() => pick(s.intent)} disabled={!collection} sx={{ height: '100%', alignItems: 'flex-start' }}>
                <CardContent>
                  <Box sx={{ color: 'primary.main', mb: 1 }}>{s.icon}</Box>
                  <Typography variant="h4" sx={{ mb: 0.5 }}>{s.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{s.desc}</Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

/**
 * Map an intent into a partial builderState + chart config the QuestionEditor
 * can hydrate. Field names are intentionally generic — the user picks fields
 * once they're in the builder.
 */
export function intentDefaults(intent) {
  switch (intent) {
    case 'number':
      return {
        chartType: 'scalar',
        builderState: { filters: [], groupBys: [], metrics: [{ agg: '$sum', field: '', alias: 'value' }], sortField: '', sortDir: -1, limit: 1 },
      };
    case 'time':
      return {
        chartType: 'line',
        builderState: { filters: [], groupBys: [''], metrics: [{ agg: '$sum', field: '', alias: 'total' }], sortField: '', sortDir: 1, limit: 0 },
      };
    case 'category':
      return {
        chartType: 'bar',
        builderState: { filters: [], groupBys: [''], metrics: [{ agg: '$sum', field: '', alias: 'total' }], sortField: 'total', sortDir: -1, limit: 25 },
      };
    case 'topn':
      return {
        chartType: 'bar',
        builderState: { filters: [], groupBys: [''], metrics: [{ agg: '$sum', field: '', alias: 'total' }], sortField: 'total', sortDir: -1, limit: 10 },
      };
    case 'rows':
      return {
        chartType: 'table',
        builderState: { filters: [], groupBys: [], metrics: [], sortField: '', sortDir: -1, limit: 100 },
      };
    case 'variance':
      return {
        chartType: 'variance',
        builderState: {
          filters: [], groupBys: [''],
          metrics: [
            { agg: '$sum', field: '', alias: 'actual' },
            { agg: '$sum', field: '', alias: 'budget' },
          ],
          sortField: 'actual', sortDir: -1, limit: 50,
        },
      };
    case 'ai':
    default:
      return { chartType: 'table', builderState: null };
  }
}
