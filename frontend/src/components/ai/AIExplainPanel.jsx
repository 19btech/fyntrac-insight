import React from 'react';
import { Paper, Stack, Typography, Button } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

/**
 * Compact "Ask AI" launcher shown beneath the Sort & Limit step in the Report
 * editor. Clicking the button dispatches the global `fyntrac:ai:open` event so
 * the same Ask Insight chat drawer used elsewhere (e.g. dashboards) opens with
 * a pre-seeded prompt asking the assistant to explain the current results.
 */
export default function AIExplainPanel() {
  const openAskInsight = () => {
    window.dispatchEvent(
      new CustomEvent('fyntrac:ai:open', {
        detail: { prompt: 'Explain the results of this report.' },
      }),
    );
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mt: 2, bgcolor: '#fafaff' }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <AutoAwesomeIcon sx={{ color: '#7c3aed', fontSize: 18 }} />
        <Typography variant="subtitle2" sx={{ flex: 1 }}>Explain this result</Typography>
        <Button size="small" variant="outlined" onClick={openAskInsight}>
          Ask AI
        </Button>
      </Stack>
    </Paper>
  );
}
