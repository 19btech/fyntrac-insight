import React, { useMemo } from 'react';
import { Box, Stack, Typography, Tooltip } from '@mui/material';
import { CHART_COLORS, CHART_HEIGHT } from './_chartColors';
import { formatByColumn } from './_columnRules';

// Format respecting domain rules (period IDs have no thousands separators),
// falling back to a thousands-separated number for ordinary measures.
function fmt(field, v) {
  const ruled = formatByColumn(field, v);
  if (ruled !== undefined && ruled !== '') return ruled;
  return typeof v === 'number' ? v.toLocaleString() : String(v ?? '');
}

/**
 * Lightweight funnel renderer. MUI X Charts (community) does not ship a
 * Funnel component, so we draw one with plain SVG + MUI typography. Each row
 * becomes a stacked trapezoid scaled to its value relative to the maximum.
 */
export default function FunnelChart({ data = [], xField, yFields = [], height }) {
  const valueField = yFields[0] || 'value';
  const chartH = height || CHART_HEIGHT;

  const rows = useMemo(() => {
    const out = (data || [])
      .map((d) => ({ name: d?.[xField], value: Number(d?.[valueField]) }))
      .filter((r) => r.name != null && Number.isFinite(r.value) && r.value >= 0);
    return out;
  }, [data, xField, valueField]);

  if (!rows.length) {
    return (
      <Box sx={{ height: chartH, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">No data to plot.</Typography>
      </Box>
    );
  }

  const max = Math.max(...rows.map((r) => r.value), 1);
  const width = 320;
  const stepHeight = Math.max(28, Math.floor((chartH - 16) / rows.length));
  const totalHeight = stepHeight * rows.length;

  return (
    <Box sx={{ height: chartH, display: 'flex', alignItems: 'center' }}>
      <Box sx={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <svg width={width} height={totalHeight} role="img" aria-label="Funnel chart">
          {rows.map((r, i) => {
            const ratioTop = r.value / max;
            const next = rows[i + 1]?.value ?? r.value;
            const ratioBottom = next / max;
            const topW = width * ratioTop;
            const botW = width * ratioBottom;
            const y = i * stepHeight;
            const cx = width / 2;
            const points = [
              [cx - topW / 2, y],
              [cx + topW / 2, y],
              [cx + botW / 2, y + stepHeight],
              [cx - botW / 2, y + stepHeight],
            ].map((p) => p.join(',')).join(' ');
            return (
              <polygon
                key={i}
                points={points}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                opacity={0.9}
              />
            );
          })}
        </svg>
        <Stack spacing={0.5} sx={{ minWidth: 140 }}>
          {rows.map((r, i) => (
            <Tooltip key={i} title={`${fmt(xField, r.name)}: ${fmt(valueField, r.value)}`} arrow placement="left">
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: CHART_COLORS[i % CHART_COLORS.length] }} />
                <Typography variant="caption" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                  {fmt(xField, r.name)}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>{fmt(valueField, r.value)}</Typography>
              </Stack>
            </Tooltip>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
