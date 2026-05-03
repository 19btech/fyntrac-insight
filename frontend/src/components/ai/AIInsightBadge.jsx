import React from 'react';
import { IconButton, Tooltip } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

/**
 * Sparkly icon shown on each dashboard card. Clicking it opens the global
 * Ask Insight chat drawer (same as the dashboard / report Ask AI buttons),
 * pre-seeded with a prompt that asks the assistant to explain this card.
 */
export default function AIInsightBadge({ data, chartConfig }) {
  const open = (e) => {
    e.stopPropagation();
    const chartType = chartConfig?.chartType || 'chart';
    window.dispatchEvent(
      new CustomEvent('fyntrac:ai:open', {
        detail: {
          prompt: `Explain what this ${chartType} on the dashboard is showing and any notable trends.`,
        },
      }),
    );
  };

  return (
    <Tooltip title="AI Insight">
      <IconButton size="small" onClick={open} sx={{ color: 'text.secondary' }}>
        <AutoAwesomeIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}
