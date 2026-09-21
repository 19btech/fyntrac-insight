import React, { useState } from 'react';
import {
  Box, Paper, Stack, Typography, Chip, Skeleton, Tooltip,
} from '@mui/material';
import ScienceIcon from '@mui/icons-material/ScienceOutlined';
import TableChartIcon from '@mui/icons-material/TableChartOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmberOutlined';
import VerifiedIcon from '@mui/icons-material/Verified';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';

const ACCENT = '#4f46e5';
const ACCENT_BG = '#eef2ff';
const SLATE_100 = '#f1f5f9';

/**
 * One row per registered source. The count badge is the point of this rail:
 * after a search it shows at a glance which datasets and reports actually
 * carry the instrument, so an empty source is visible without clicking it.
 *
 * Rows are reorderable by dragging. Native HTML5 drag-and-drop is used rather
 * than pulling in a DnD library for a list this short — a click that never
 * moves still selects, because the browser only fires dragstart once the
 * pointer actually travels.
 */
function SourceRow({
  source, state, active, onClick,
  index, dragging, dropBefore, dropAfter, onDragStart, onDragOver, onDrop, onDragEnd,
}) {
  const isDataset = source.sourceType === 'dataset';
  const count = state?.rowCount;

  const badge = () => {
    if (source.missing) {
      return (
        <Tooltip title="The underlying dataset or report was deleted or archived">
          <WarningAmberIcon sx={{ fontSize: 16, color: '#f59e0b' }} />
        </Tooltip>
      );
    }
    if (state?.loading) return <Skeleton variant="rounded" width={30} height={20} sx={{ borderRadius: '6px' }} />;
    if (state?.error) {
      return (
        <Tooltip title={state.error}>
          <WarningAmberIcon sx={{ fontSize: 16, color: '#ef4444' }} />
        </Tooltip>
      );
    }
    if (count === undefined || count === null) return null;
    return (
      <Chip
        label={count.toLocaleString()}
        size="small"
        sx={{
          height: 20,
          minWidth: 28,
          borderRadius: '6px',
          fontSize: '0.7rem',
          fontWeight: 700,
          // A zero-row source is muted rather than hidden — "we looked and
          // found nothing" is useful information here.
          bgcolor: count > 0 ? (active ? '#fff' : ACCENT_BG) : SLATE_100,
          color: count > 0 ? ACCENT : '#94a3b8',
        }}
      />
    );
  };

  // The insertion point is drawn as a rule on the edge the row would land on,
  // so the drop target is unambiguous without moving anything mid-drag.
  const edge = {
    content: '""',
    position: 'absolute',
    left: 6,
    right: 6,
    height: 2,
    borderRadius: 2,
    bgcolor: ACCENT,
  };

  return (
    <Box
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(index); }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver(index); }}
      onDrop={(e) => { e.preventDefault(); onDrop(index); }}
      onDragEnd={onDragEnd}
      onClick={() => !source.missing && onClick()}
      sx={{
        position: 'relative',
        px: 1.5,
        py: 1.25,
        borderRadius: '12px',
        cursor: source.missing ? 'not-allowed' : 'pointer',
        opacity: source.missing ? 0.6 : dragging ? 0.4 : 1,
        bgcolor: active ? ACCENT_BG : 'transparent',
        border: '1px solid',
        borderColor: active ? '#c7d2fe' : 'transparent',
        transition: 'background-color 160ms, border-color 160ms, opacity 120ms',
        '&:hover': { bgcolor: active ? ACCENT_BG : SLATE_100 },
        '&:hover .ib-grip': { opacity: 1 },
        ...(dropBefore ? { '&::before': { ...edge, top: -2 } } : {}),
        ...(dropAfter ? { '&::after': { ...edge, bottom: -2 } } : {}),
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1}>
        <DragIndicatorIcon
          className="ib-grip"
          sx={{
            fontSize: 15,
            color: '#cbd5e1',
            flexShrink: 0,
            ml: -0.75,
            opacity: 0,
            transition: 'opacity 140ms',
            cursor: 'grab',
          }}
        />

        <Box
          sx={{
            width: 26, height: 26, borderRadius: '8px', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: active ? '#fff' : SLATE_100,
            color: active ? ACCENT : '#64748b',
          }}
        >
          {isDataset ? <ScienceIcon sx={{ fontSize: 15 }} /> : <TableChartIcon sx={{ fontSize: 15 }} />}
        </Box>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Typography
              noWrap
              sx={{
                fontSize: '0.8125rem',
                fontWeight: active ? 700 : 600,
                color: active ? ACCENT : 'text.primary',
              }}
            >
              {source.label}
            </Typography>
            {source.verified && <VerifiedIcon sx={{ fontSize: 13, color: '#10b981', flexShrink: 0 }} />}
          </Stack>
          <Typography noWrap sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
            {source.sourceType === 'dataset' ? 'Dataset' : 'Report'}
            {source.dateMode === 'accountingPeriod' ? ' · period' : source.dateMode === 'none' ? ' · no period' : ' · posting date'}
          </Typography>
        </Box>

        {badge()}
      </Stack>
    </Box>
  );
}

export default function InstrumentSourceRail({ sources, states, activeId, onSelect, onReorder, loading }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  const reset = () => { setDragIndex(null); setOverIndex(null); };

  const handleDrop = (targetIndex) => {
    if (dragIndex === null || dragIndex === targetIndex) { reset(); return; }
    const next = [...sources];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    reset();
    onReorder?.(next.map((s) => s._id));
  };

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: '16px',
        border: '1px solid',
        borderColor: 'divider',
        p: 1.5,
        position: 'sticky',
        top: 16,
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1, pb: 1 }}>
        <Typography
          sx={{
            fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'text.secondary',
          }}
        >
          Sources
        </Typography>
        {!loading && sources.length > 0 && (
          <Chip
            label={sources.length}
            size="small"
            sx={{ height: 18, minWidth: 22, borderRadius: '6px', fontSize: '0.65rem', fontWeight: 700, bgcolor: SLATE_100, color: '#64748b' }}
          />
        )}
      </Stack>

      {loading ? (
        <Stack spacing={0.5}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={48} sx={{ borderRadius: '12px' }} />
          ))}
        </Stack>
      ) : (
        <Stack spacing={0.25} onDragLeave={() => setOverIndex(null)}>
          {sources.map((s, i) => (
            <SourceRow
              key={s._id}
              source={s}
              state={states[s._id]}
              active={activeId === s._id}
              onClick={() => onSelect(s._id)}
              index={i}
              dragging={dragIndex === i}
              // The rule sits on the edge the row would be inserted at: above
              // when dragging upward, below when dragging down.
              dropBefore={dragIndex !== null && overIndex === i && dragIndex > i}
              dropAfter={dragIndex !== null && overIndex === i && dragIndex < i}
              onDragStart={setDragIndex}
              onDragOver={setOverIndex}
              onDrop={handleDrop}
              onDragEnd={reset}
            />
          ))}
        </Stack>
      )}

      {sources.length > 1 && !loading && (
        <Typography sx={{ px: 1, pt: 1.25, fontSize: '0.65rem', color: '#94a3b8' }}>
          Drag to reorder
        </Typography>
      )}
    </Paper>
  );
}
