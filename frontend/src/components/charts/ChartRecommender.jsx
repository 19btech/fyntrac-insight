import React, { useMemo, useState } from 'react';
import { Box, Card, CardActionArea, Stack, Typography, Button, Menu, MenuItem, Tooltip } from '@mui/material';
import NumbersIcon from '@mui/icons-material/Numbers';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import BarChartIcon from '@mui/icons-material/BarChart';
import StackedBarChartIcon from '@mui/icons-material/StackedBarChart';
import PieChartIcon from '@mui/icons-material/PieChart';
import TableViewIcon from '@mui/icons-material/TableView';
import ScatterPlotIcon from '@mui/icons-material/ScatterPlot';
import TimelineIcon from '@mui/icons-material/Timeline';
import GridOnIcon from '@mui/icons-material/GridOn';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import WaterfallChartIcon from '@mui/icons-material/WaterfallChart';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';

const META = {
  metric:   { label: 'KPI',       icon: <NumbersIcon />,        why: 'A single number stands out clearly.' },
  line:     { label: 'Line',      icon: <ShowChartIcon />,      why: 'Best for trend over time.' },
  bar:      { label: 'Bar',       icon: <BarChartIcon />,       why: 'Compare categories side-by-side.' },
  area:     { label: 'Area',      icon: <TimelineIcon />,       why: 'Volume trend over time.' },
  pie:      { label: 'Pie',       icon: <PieChartIcon />,       why: 'Share of a whole (≤6 slices).' },
  pivot:    { label: 'Pivot',     icon: <GridOnIcon />,         why: 'Two-dimensional crosstab.' },
  table:    { label: 'Table',     icon: <TableViewIcon />,      why: 'Show every row.' },
  scatter:  { label: 'Scatter',   icon: <ScatterPlotIcon />,    why: 'Spot correlation between metrics.' },
  combo:    { label: 'Combo',     icon: <StackedBarChartIcon />, why: 'Mix bars + line (e.g. bar=actual, line=target).' },
  funnel:   { label: 'Funnel',    icon: <FilterAltIcon />,      why: 'Stage-by-stage drop-off.' },
  waterfall:{ label: 'Waterfall', icon: <WaterfallChartIcon />, why: 'Show how a balance moved.' },
  variance: { label: 'Variance',  icon: <CompareArrowsIcon />,  why: 'Actual vs Budget with colored deltas.' },
};

const ALL_KEYS = Object.keys(META);

function isTimey(k) { return /(date|month|day|quarter|year|period|yyyymm|yyyy_mm|created)/i.test(k || ''); }

/**
 * Smart heuristic — given the data shape (inferred X + Y[]) and column names,
 * suggest the top-3 most useful layouts for the question being asked.
 */
export function recommend({ data, x, y, allKeys }) {
  const numMetrics = (y || []).length;
  const hasX = !!x;
  const hasTime = isTimey(x);
  const dimCount = allKeys.filter((k) => k !== x && !y.includes(k)).length + (hasX ? 1 : 0);
  const hasActualBudget = ['actual','budget','target','plan','forecast'].filter((k) =>
    (y || []).some((m) => m.toLowerCase().includes(k))
  ).length >= 2;
  const rowCount = (data || []).length;

  const picks = [];
  if (hasActualBudget) picks.push('variance', 'bar', 'pivot');
  else if (numMetrics === 1 && !hasX) picks.push('metric', 'bar', 'table');
  else if (numMetrics >= 1 && hasTime) picks.push('line', 'bar', 'area');
  else if (numMetrics >= 2 && hasX) picks.push('combo', 'bar', 'scatter');
  else if (numMetrics === 1 && hasX && rowCount <= 8) picks.push('bar', 'pie', 'table');
  else if (numMetrics === 1 && hasX) picks.push('bar', 'line', 'table');
  else if (dimCount >= 2 && numMetrics >= 1) picks.push('pivot', 'bar', 'table');
  else picks.push('table', 'bar', 'metric');

  return Array.from(new Set(picks)).slice(0, 3);
}

export default function ChartRecommender({ data = [], inferred = { x: '', y: [] }, allKeys = [], current, onPick }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const recs = useMemo(
    () => recommend({ data, x: inferred.x, y: inferred.y, allKeys }),
    [data, inferred.x, inferred.y, allKeys]
  );

  const more = ALL_KEYS.filter((k) => !recs.includes(k));

  const card = (key) => {
    const m = META[key];
    if (!m) return null;
    const active = current === key;
    return (
      <Card
        key={key}
        variant="outlined"
        sx={{
          flex: 1, minWidth: 130, borderColor: active ? 'primary.main' : 'divider',
          borderWidth: active ? 2 : 1, bgcolor: active ? 'primary.lighter' : 'background.paper',
        }}
      >
        <Tooltip title={m.why} placement="top" arrow>
          <CardActionArea onClick={() => onPick(key)} sx={{ p: 1.25 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box sx={{ color: active ? 'primary.main' : 'text.secondary', display: 'flex' }}>{m.icon}</Box>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.1 }}>{m.label}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.1 }}>{m.why}</Typography>
              </Box>
            </Stack>
          </CardActionArea>
        </Tooltip>
      </Card>
    );
  };

  return (
    <Stack direction="row" spacing={1} alignItems="stretch" sx={{ mb: 1.5, flexWrap: 'wrap' }}>
      <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', mr: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Recommended
      </Typography>
      {recs.map((k) => card(k))}
      {/* current chart not in recs? show it as a 4th selected card so the user sees their pick */}
      {current && !recs.includes(current) && card(current)}
      <Button
        size="small"
        variant="text"
        endIcon={<KeyboardArrowDownIcon />}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{ alignSelf: 'center' }}
      >
        More layouts
      </Button>
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
        {more.map((k) => (
          <MenuItem key={k} onClick={() => { onPick(k); setAnchorEl(null); }} selected={current === k}>
            <Stack direction="row" spacing={1} alignItems="center">
              {META[k].icon}
              <span>{META[k].label}</span>
              <Typography variant="caption" color="text.secondary">— {META[k].why}</Typography>
            </Stack>
          </MenuItem>
        ))}
      </Menu>
    </Stack>
  );
}
