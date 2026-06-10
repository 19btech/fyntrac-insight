import React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
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
import StarIcon from '@mui/icons-material/Star';

const META = {
  table:    { label: 'Table',     icon: <TableViewIcon fontSize="small" /> },
  pivot:    { label: 'Pivot',     icon: <GridOnIcon fontSize="small" /> },
  line:     { label: 'Line',      icon: <ShowChartIcon fontSize="small" /> },
  bar:      { label: 'Bar',       icon: <BarChartIcon fontSize="small" /> },
  area:     { label: 'Area',      icon: <TimelineIcon fontSize="small" /> },
  pie:      { label: 'Pie',       icon: <PieChartIcon fontSize="small" /> },
  metric:   { label: 'KPI',       icon: <NumbersIcon fontSize="small" /> },
  scatter:  { label: 'Scatter',   icon: <ScatterPlotIcon fontSize="small" /> },
  combo:    { label: 'Combo',     icon: <StackedBarChartIcon fontSize="small" /> },
  funnel:   { label: 'Funnel',    icon: <FilterAltIcon fontSize="small" /> },
  waterfall:{ label: 'Waterfall', icon: <WaterfallChartIcon fontSize="small" /> },
  variance: { label: 'Variance',  icon: <CompareArrowsIcon fontSize="small" /> },
};

const ORDER = ['table', 'pivot', 'metric', 'bar', 'line', 'area', 'combo', 'pie', 'scatter', 'funnel', 'waterfall', 'variance'];

/**
 * Compact chart-type gallery — a clean tile per type (vs. the old inline
 * recommendation cards). Recommended types get a ⭐; the current one is filled.
 */
export default function ChartTypeSwitcher({ current, onPick, recommended = [] }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {ORDER.map((key) => {
        const m = META[key];
        if (!m) return null;
        const active = current === key;
        const isRec = recommended.includes(key);
        return (
          <Tooltip key={key} title={isRec ? `${m.label} · recommended` : m.label} arrow>
            <Box
              role="button"
              onClick={() => onPick(key)}
              sx={{
                position: 'relative', flex: '1 1 92px', minWidth: 84, py: 1.25, borderRadius: 2.5, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.5,
                border: active ? '2px solid' : '1px solid', userSelect: 'none',
                // Tinted (not solid) boundary when selected.
                borderColor: active ? '#a5b4fc' : '#e2e8f0',
                bgcolor: active ? '#eef2ff' : '#fff',
                color: active ? '#4f46e5' : '#64748b',
                boxShadow: active ? '0 2px 8px rgba(165,180,252,0.30)' : 'none',
                transition: 'all 140ms ease',
                '&:hover': { borderColor: active ? '#a5b4fc' : '#c7d2fe', bgcolor: active ? '#eef2ff' : '#f8faff', transform: 'translateY(-1px)' },
                '& svg.viz-icon': { fontSize: 26 },
              }}
            >
              {isRec && (
                <StarIcon sx={{ position: 'absolute', top: 5, right: 6, fontSize: 13, color: '#f59e0b' }} />
              )}
              {React.cloneElement(m.icon, { className: 'viz-icon', fontSize: 'medium' })}
              <Typography sx={{ fontSize: '0.72rem', fontWeight: active ? 700 : 600, lineHeight: 1 }}>
                {m.label}
              </Typography>
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
