import React, { useMemo } from 'react';
import { PieChart as XPieChart } from '@mui/x-charts/PieChart';
import { Box, Typography } from '@mui/material';
import useFilterStore from '../../store/filterStore';
import { CHART_COLORS, CHART_HEIGHT } from './_chartColors';

export default function PieChart({ data = [], xField, yFields = [], onPointClick, height, compact = false }) {
  const valueField = yFields[0] || 'value';
  const setFilter = useFilterStore((s) => s.setFilter);

  // Aggregate duplicate categories and use absolute values so mixed-sign data still renders.
  const { slices, hasNegatives } = useMemo(() => {
    const totals = new Map();
    let neg = false;
    for (const row of data || []) {
      const k = row?.[xField];
      const v = Number(row?.[valueField]);
      if (k == null || k === '' || !Number.isFinite(v)) continue;
      if (v < 0) neg = true;
      totals.set(k, (totals.get(k) || 0) + v);
    }
    const out = [];
    let id = 0;
    for (const [k, v] of totals.entries()) {
      const abs = Math.abs(v);
      if (abs > 0) out.push({ id: id++, label: String(k), value: abs, raw: v, key: k });
    }
    out.sort((a, b) => b.value - a.value);
    return { slices: out, hasNegatives: neg };
  }, [data, xField, valueField]);

  const chartH = height || CHART_HEIGHT;

  if (!slices.length) {
    return (
      <Box sx={{ height: chartH, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No values to plot. Pie charts need a category column on X and a numeric column on Y.
        </Typography>
      </Box>
    );
  }

  const handleItemClick = (_event, item) => {
    const slice = slices[item?.dataIndex];
    if (!slice) return;
    if (onPointClick) { onPointClick({ [xField]: slice.key, [valueField]: slice.raw }); return; }
    if (slice.key != null && xField) setFilter(xField, slice.key);
  };

  return (
    <Box sx={{ height: chartH, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {hasNegatives && (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, mb: 1 }}>
          Note: some values are negative — slice sizes use absolute values.
        </Typography>
      )}
      <XPieChart
        series={[{
          data: slices.map((s, i) => ({ id: s.id, value: s.value, label: s.label, color: CHART_COLORS[i % CHART_COLORS.length] })),
          innerRadius: 0,
          outerRadius: '85%',
          paddingAngle: 1,
          cornerRadius: 2,
          highlightScope: { faded: 'global', highlighted: 'item' },
        }]}
        height={hasNegatives ? chartH - 28 : chartH}
        margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        onItemClick={handleItemClick}
        slotProps={{
          legend: compact ? { hidden: true } : { labelStyle: { fontSize: 11 } },
        }}
      />
    </Box>
  );
}
