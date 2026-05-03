import React, { useEffect, useState } from 'react';
import { Paper, Stack, Typography, Chip, IconButton, Tooltip } from '@mui/material';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import CloseIcon from '@mui/icons-material/Close';
import api from '../../hooks/useQuery';

/**
 * Heuristic match of the current builderState/collection against the user's
 * curated KPIs. If we find a likely match, suggest swapping to the curated
 * object so the team gets consistent answers.
 *
 * Match is intentionally simple: same collection + overlapping group/metric
 * field names. Surface as a single, dismissable banner.
 */
export default function ReplaceWithCuratedStrip({ collection, builderState, onApplyKpi, onApplySavedFilter }) {
  const [kpis, setKpis] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get('/metrics').then((r) => r.data).catch(() => []).then((m) => {
      if (cancelled) return;
      setKpis(m || []);
    });
    return () => { cancelled = true; };
  }, []);

  if (dismissed || !collection || !builderState) return null;

  const groupFields = (builderState.groupBys || []).filter(Boolean);
  const metricFields = (builderState.metrics || []).map((m) => m.field).filter(Boolean);
  // KPI candidates: same collection AND overlapping numerator field
  const matchingKpis = kpis.filter((k) => {
    if (k.collection !== collection) return false;
    const num = k.definition?.numerator?.field;
    if (!num) return false;
    return metricFields.includes(num);
  }).slice(0, 3);

  if (matchingKpis.length === 0) return null;

  return (
    <Paper variant="outlined" sx={{ p: 1, my: 1, bgcolor: '#fffbeb', borderColor: '#fde68a' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: 'wrap' }}>
        <LightbulbIcon sx={{ fontSize: 18, color: '#d97706' }} />
        <Typography variant="caption" sx={{ fontWeight: 600, color: '#92400e' }}>
          Use a curated source for consistent answers:
        </Typography>
        {matchingKpis.map((k) => (
          <Tooltip key={k._id} title={k.description || `Replace with KPI "${k.name}"`}>
            <Chip size="small" clickable
              label={`📊 Use KPI: ${k.name}`}
              onClick={() => onApplyKpi?.(k)}
              sx={{ fontSize: '0.72rem', height: 22, bgcolor: '#fef3c7' }} />
          </Tooltip>
        ))}
        <IconButton size="small" onClick={() => setDismissed(true)} sx={{ ml: 'auto' }}>
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Stack>
    </Paper>
  );
}
