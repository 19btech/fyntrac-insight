import React, { useEffect, useRef, useState } from 'react';
import {
  Card, CardActionArea, Box, Stack, Typography, Chip, Tooltip, Skeleton,
  LinearProgress, Divider,
} from '@mui/material';
import { keyframes } from '@mui/system';
import VerifiedIcon from '@mui/icons-material/Verified';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import { SparkLineChart } from '@mui/x-charts/SparkLineChart';
import formatKpi from './formatKpi';

// --- Animations -----------------------------------------------------------
const fadeSlideUp = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
`;
const chipPop = keyframes`
  0%   { opacity: 0; transform: scale(0.85); }
  60%  { opacity: 1; transform: scale(1.06); }
  100% { opacity: 1; transform: scale(1); }
`;
const sparklineDraw = keyframes`
  from { stroke-dasharray: 400; stroke-dashoffset: 400; }
  to   { stroke-dasharray: 400; stroke-dashoffset: 0; }
`;

// Smoothly tween the displayed number toward `target` over ~1.1s.
// Starts at 0 on first mount so every KPI visibly counts up when it appears.
function useCountUp(target, enabled = true) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef(null);
  useEffect(() => {
    if (!enabled || target == null || Number.isNaN(Number(target))) {
      setDisplay(target);
      return undefined;
    }
    const from = Number(fromRef.current ?? 0);
    const to = Number(target);
    if (from === to) { setDisplay(to); return undefined; }
    const duration = 1100;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (to - from) * eased;
      setDisplay(v);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else { fromRef.current = to; setDisplay(to); }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, enabled]);
  return display;
}

/**
 * Blend a hex color with white (35% white) to produce a soft pastel tint
 * suitable for large bold text on a white card background.
 */
function toPastelColour(hex) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (c) => Math.round(c * 0.65 + 255 * 0.35);
  return `#${mix(r).toString(16).padStart(2, '0')}${mix(g).toString(16).padStart(2, '0')}${mix(b).toString(16).padStart(2, '0')}`;
}

/**
 * Modern MUI KPI widget. Single tile that knows how to render a number
 * with an up/down delta chip, a soft pastel sparkline showing the trend
 * from the previous period to now, and an optional goal-progress bar.
 *
 * Used by the standalone Metrics (KPIs) page and by dashboards. Keeping
 * the rendering in one place means tweaks to spacing, colors, or
 * typography land everywhere consistently.
 *
 * Props:
 *   - title             string                        — KPI name
 *   - verified          boolean                       — show ✓ certified badge
 *   - value             number|null                   — current period value
 *   - trendValue        number|null                   — comparison value (e.g. last period)
 *   - comparisonLabel   'lastPeriod' | 'lastYear' | string — used for chip label
 *   - format            { kind, decimals, compact, … } | undefined
 *   - legacyFormat / prefix / suffix                  — legacy KPI shape, accepted for compat
 *   - sourceLabel       string|null                   — small chip under the value (e.g. "Dataset: Customer 360")
 *   - direction         'higherBetter' | 'lowerBetter'
 *   - goal              { value, percent } | null
 *   - bandColor         string|null                   — overrides value color
 *   - sparklineSeries   number[]|null                 — extra historical points (optional, falls back to [trendValue, value])
 *   - loading, error                                  — skeleton / error states
 *   - dense             boolean                       — compact layout for dashboard cards
 *   - animateCard       boolean                       — enable stronger entry/hover motion for showcase grids
 *   - onClick           function|undefined
 *   - actions           ReactNode|undefined           — top-right slot (more menu, edit/delete buttons)
 */
export default function KpiTile({
  title,
  verified = false,
  value,
  trendValue = null,
  comparisonLabel = 'lastPeriod',
  format,
  legacyFormat,
  prefix,
  suffix,
  sourceLabel = null,
  direction = 'higherBetter',
  goal = null,
  bandColor = null,
  sparklineSeries = null,
  loading = false,
  error = false,
  dense = false,
  animateCard = false,
  onClick,
  actions,
}) {
  // Self-measure the card container so all content scales with its dimensions.
  const cardRef = useRef(null);
  const [containerH, setContainerH] = useState(0);
  useEffect(() => {
    if (!cardRef.current || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect?.height;
      if (h > 1) setContainerH(Math.floor(h));
    });
    ro.observe(cardRef.current);
    return () => ro.disconnect();
  }, []);

  // Responsive size tiers based on measured card height.
  // xs < 130 | sm 130–199 | md 200–279 | lg ≥ 280
  const tier = containerH < 130 ? 'xs' : containerH < 200 ? 'sm' : containerH < 280 ? 'md' : 'lg';
  const middleAlignContent = !dense;
  const sizes = {
    xs: { pad: 1,    valFs: '1.56rem', titleFs: '0.84rem', chipFontSize: '0.7rem',  chipPx: 1,    chipPy: 0.25, arrowSz: 12, sparkH: 0, showDelta: false, showLabel: false, showGoal: false },
    sm: { pad: 1.25, valFs: '2.12rem', titleFs: '0.96rem', chipFontSize: '0.75rem', chipPx: 1,    chipPy: 0.35, arrowSz: 13, sparkH: 0, showDelta: true,  showLabel: false, showGoal: false },
    md: { pad: 1.5,  valFs: '2.6rem',titleFs: '1rem', chipFontSize: '0.78rem', chipPx: 1.1,  chipPy: 0.4,  arrowSz: 14, sparkH: 0, showDelta: true,  showLabel: true,  showGoal: false },
    lg: { pad: dense ? 1.5 : 2.75, valFs: dense ? '2.62rem' : '3.5rem', titleFs: dense ? '0.96rem' : '1.12rem', chipFontSize: '0.82rem', chipPx: 1.25, chipPy: 0.5, arrowSz: 16, sparkH: dense ? 38 : 48, showDelta: true, showLabel: true, showGoal: true },
  }[tier];

  const hasValue = value != null && !Number.isNaN(Number(value));
  const animatedValue = useCountUp(hasValue ? Number(value) : null, hasValue && !loading);
  const hasTrend = trendValue != null && !Number.isNaN(Number(trendValue));
  const absDelta = hasValue && hasTrend ? Number(value) - Number(trendValue) : null;
  // When prior period is zero and current is non-zero, the percentage change is ±∞.
  const priorIsZero = hasTrend && Number(trendValue) === 0;
  const delta = absDelta != null && !priorIsZero
    ? (absDelta / Math.abs(Number(trendValue))) * 100
    : (absDelta != null && absDelta !== 0 ? null : 0);

  const isUp = absDelta != null && absDelta > 0;
  const isDown = absDelta != null && absDelta < 0;
  const trendGood = direction === 'lowerBetter' ? isDown : isUp;
  const trendBad = direction === 'lowerBetter' ? isUp : isDown;

  // Soft pastel palette so trend chips don't shout from the dashboard.
  const trendColors = trendGood
    ? { bg: '#dcfce7', fg: '#166534', sparkle: '#16a34a' }
    : trendBad
      ? { bg: '#fee2e2', fg: '#991b1b', sparkle: '#dc2626' }
      : { bg: '#f1f5f9', fg: '#475569', sparkle: '#64748b' };

  const valueColor = toPastelColour(bandColor) || '#0f172a';

  const series = (Array.isArray(sparklineSeries) && sparklineSeries.length >= 2)
    ? sparklineSeries.map((n) => Number(n))
    : (hasValue && hasTrend ? [Number(trendValue), Number(value)] : null);

  const comparisonText = comparisonLabel === 'lastYear' ? 'vs last year' : 'vs prev period';

  const goalPercent = goal?.percent != null
    ? Math.max(0, Math.min(150, Number(goal.percent)))
    : (goal?.value != null && hasValue
      ? Math.max(0, Math.min(150, (Number(value) / Number(goal.value)) * 100))
      : null);

  const valueNode = (
    <Typography
      component="div"
      sx={{
        fontSize: sizes.valFs,
        fontWeight: 800,
        letterSpacing: '-0.02em',
        lineHeight: 1.05,
        color: valueColor,
        animation: `${fadeSlideUp} .5s ease-out both`,
        fontVariantNumeric: 'tabular-nums',
        textAlign: 'left',
      }}
    >
      {formatKpi(animatedValue, format, legacyFormat, prefix, suffix)}
    </Typography>
  );

  const ArrowIcon = isUp ? ArrowUpwardRoundedIcon
    : isDown ? ArrowDownwardRoundedIcon
      : RemoveRoundedIcon;
  const absDeltaFormatted = absDelta != null
    ? formatKpi(Math.abs(absDelta), format, legacyFormat, prefix, suffix)
    : null;
  // When prior period is exactly zero, percentage is ±∞ — display the symbol instead of "—%".
  const pctFormatted = priorIsZero && absDelta !== 0
    ? `${isUp ? '+' : '-'}∞%`
    : delta != null ? `${Math.abs(delta).toFixed(1)}%` : '—';

  const deltaBlock = sizes.showDelta && absDelta != null && (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: sizes.chipPx,
        py: sizes.chipPy,
        borderRadius: 999,
        bgcolor: trendColors.bg,
        color: trendColors.fg,
        animation: `${chipPop} .55s cubic-bezier(.2,.9,.3,1.2) both`,
        animationDelay: '.25s',
      }}
    >
      <ArrowIcon sx={{ fontSize: sizes.arrowSz }} />
      <Typography component="span" sx={{ fontWeight: 700, fontSize: sizes.chipFontSize, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {pctFormatted}
      </Typography>
      <Box component="span" sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: 'currentColor', opacity: 0.4 }} />
      <Typography component="span" sx={{ fontWeight: 600, fontSize: sizes.chipFontSize, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {isDown ? '-' : isUp ? '+' : ''}{absDeltaFormatted}
      </Typography>
    </Box>
  );

  const sparkline = sizes.sparkH > 0 && series && (
    <Box sx={{ width: '100%', height: sizes.sparkH, mt: 1 }}>
      <SparkLineChart
        data={series}
        height={sizes.sparkH}
        showHighlight
        showTooltip
        curve="natural"
        area
        sx={{
          '& .MuiAreaElement-root': { fill: trendColors.bg, opacity: 0.7, animation: `${fadeSlideUp} .7s ease-out both`, animationDelay: '.15s' },
          '& .MuiLineElement-root': { stroke: trendColors.sparkle, strokeWidth: 2, animation: `${sparklineDraw} 1s ease-out both` },
        }}
        colors={[trendColors.sparkle]}
      />
    </Box>
  );

  const inner = (
    <Box
      sx={{
        p: sizes.pad,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: middleAlignContent ? 'center' : 'flex-start',
        position: 'relative',
        overflow: 'hidden',
        '&::before': absDelta != null ? {
          content: '""',
          position: 'absolute',
          left: 0, top: 8, bottom: 8, width: 3,
          borderRadius: 4,
          bgcolor: trendColors.sparkle,
          opacity: 0.7,
        } : undefined,
      }}
    >
      {/* Title row */}
      <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ width: '100%', pr: actions && middleAlignContent ? 5 : 0, transform: middleAlignContent ? 'translateY(-26px)' : 'none' }}>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              fontSize: sizes.titleFs,
              fontWeight: 700,
              color: '#475569',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              textAlign: 'left',
            }}
          >
            {title}
          </Typography>
          {verified && tier !== 'xs' && (
            <Tooltip title="Verified KPI">
              <VerifiedIcon sx={{ fontSize: 12, color: '#10b981', flexShrink: 0 }} />
            </Tooltip>
          )}
        </Stack>
        {actions && (
          <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, ml: 'auto', position: middleAlignContent ? 'absolute' : 'static', top: sizes.pad, right: sizes.pad }}>
            {actions}
          </Box>
        )}
      </Stack>

      {/* Value */}
      <Box sx={{ mt: tier === 'xs' ? 0.05 : tier === 'sm' ? 0.25 : 0.45, width: '100%' }}>
        {loading ? (
          <Skeleton variant="text" width={120} height={36} />
        ) : error ? (
          <Typography variant="body2" color="error" sx={{ fontSize: sizes.titleFs, textAlign: 'left' }}>Failed to evaluate</Typography>
        ) : (
          valueNode
        )}
      </Box>

      {/* Delta chip + label */}
      {!loading && !error && (deltaBlock || sizes.showLabel) && (
        <Stack direction="row" alignItems="center" spacing={0.9} sx={{ mt: 2.1, flexWrap: 'wrap', rowGap: 0.4 }}>
          {deltaBlock}
          {sizes.showLabel && absDelta != null && (
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 500, fontSize: sizes.chipFontSize }}>
              {comparisonText}
            </Typography>
          )}
        </Stack>
      )}

      {sourceLabel && !loading && !error && tier === 'lg' && (
        <Box sx={{ mt: 1.1 }}>
          <Chip size="small" label={sourceLabel} variant="outlined" sx={{ height: 20, fontSize: '0.68rem', color: '#475569', borderColor: '#e2e8f0' }} />
        </Box>
      )}

      {/* Sparkline at bottom */}
      {sparkline && (
        <Box sx={{ mt: middleAlignContent ? 1.25 : 'auto', minHeight: 0, overflow: 'hidden', width: '100%' }}>
          {sparkline}
        </Box>
      )}

      {/* Goal progress */}
      {sizes.showGoal && goalPercent != null && !loading && !error && (
        <Box sx={{ mt: 1 }}>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>Progress to goal</Typography>
            <Typography variant="caption" sx={{ fontWeight: 600, color: '#475569', fontSize: '0.7rem' }}>
              {Math.round(goalPercent)}%
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, goalPercent)}
            sx={{
              height: 5,
              borderRadius: 3,
              bgcolor: '#f1f5f9',
              '& .MuiLinearProgress-bar': {
                borderRadius: 3,
                bgcolor: goalPercent >= 100
                  ? (direction === 'lowerBetter' ? '#dc2626' : '#16a34a')
                  : (direction === 'lowerBetter' ? '#16a34a' : '#f59e0b'),
              },
            }}
          />
        </Box>
      )}
    </Box>
  );

  return (
    <Card
      ref={cardRef}
      variant="outlined"
      sx={{
        height: '100%',
        borderRadius: 3,
        borderColor: '#e2e8f0',
        bgcolor: '#fff',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
        animation: `${fadeSlideUp} ${animateCard ? '.65s' : '.45s'} ease-out both`,
        transition: 'box-shadow .25s ease, transform .25s ease, border-color .25s ease',
        ...(animateCard && {
          '&:hover': {
            boxShadow: '0 14px 32px rgba(15, 23, 42, 0.12)',
            borderColor: '#cbd5e1',
            transform: 'translateY(-4px) scale(1.01)',
          },
        }),
        ...(onClick && {
          cursor: 'pointer',
          '&:hover': {
            boxShadow: '0 12px 28px rgba(15, 23, 42, 0.10)',
            borderColor: '#cbd5e1',
            transform: 'translateY(-2px)',
          },
        }),
      }}
    >
      {onClick ? (
        <CardActionArea onClick={onClick} sx={{ height: '100%' }}>{inner}</CardActionArea>
      ) : inner}
    </Card>
  );
}
