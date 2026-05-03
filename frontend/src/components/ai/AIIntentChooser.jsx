import React, { useState } from 'react';
import { Box, Typography, Card, CardActionArea, CardContent, Grid, TextField, Button } from '@mui/material';
import InsightsIcon from '@mui/icons-material/Insights';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import TimelineIcon from '@mui/icons-material/Timeline';
import RuleIcon from '@mui/icons-material/Rule';
import ChatIcon from '@mui/icons-material/Chat';

/**
 * Templates per intent. The `seed` becomes the initial prompt; users can edit
 * before sending. `placeholder` is what the input bar suggests they refine to.
 */
export const INTENT_TEMPLATES = {
  explain: {
    title: 'Explain this number',
    desc: "Why is the current value what it is? What's driving the change?",
    icon: <InsightsIcon />,
    seed: 'Explain the current KPI: what drives it, and what changed since the previous period?',
    placeholder: 'Ask a follow-up about the explanation…',
  },
  build: {
    title: 'Build a report',
    desc: 'Describe what you want — top customers, sales by region, etc.',
    icon: <ReceiptLongIcon />,
    seed: 'Show me the top 10 customers by revenue last quarter.',
    placeholder: 'Describe the report you want…',
  },
  anomaly: {
    title: 'Find anomalies',
    desc: 'What changed unexpectedly versus last period?',
    icon: <CompareArrowsIcon />,
    seed: 'Find unusual changes versus last month and rank them by impact.',
    placeholder: 'What time window or dimension to inspect?',
  },
  compare: {
    title: 'Compare periods',
    desc: 'Side-by-side comparison across two time windows.',
    icon: <TimelineIcon />,
    seed: 'Compare this quarter vs the same quarter last year, by region.',
    placeholder: 'Which two periods, and across what dimension?',
  },
  reconcile: {
    title: 'Reconcile / investigate',
    desc: 'Trace a number to the underlying rows.',
    icon: <RuleIcon />,
    seed: 'Show me the rows that make up the current AR balance, sorted by amount.',
    placeholder: 'What number do you want to trace?',
  },
};

const TILES = ['explain', 'anomaly', 'compare', 'reconcile'];

export default function AIIntentChooser({ onPick, onFree }) {
  const [draft, setDraft] = useState(null); // { intent, prompt }

  if (draft) {
    const t = INTENT_TEMPLATES[draft.intent];
    return (
      <Box>
        <Typography variant="caption" color="text.secondary">
          {t?.title} — review and edit the prompt
        </Typography>
        <TextField
          multiline minRows={3} fullWidth size="small" sx={{ mt: 1 }}
          value={draft.prompt}
          onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
        />
        <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
          <Button size="small" onClick={() => setDraft(null)}>← Back</Button>
          <Box sx={{ flex: 1 }} />
          <Button size="small" variant="contained" onClick={() => onPick(draft)} disabled={!draft.prompt.trim()}>
            Generate plan
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Pick a starting point — Ask Insight grounds answers in your Datasets and KPIs.
      </Typography>
      <Grid container spacing={1}>
        {TILES.map((key) => {
          const t = INTENT_TEMPLATES[key];
          return (
            <Grid size={12} key={key}>
              <Card variant="outlined">
                <CardActionArea onClick={() => setDraft({ intent: key, prompt: t.seed })}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25 }}>
                    <Box sx={{ color: 'primary.main', display: 'flex' }}>{t.icon}</Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle2">{t.title}</Typography>
                      <Typography variant="caption" color="text.secondary">{t.desc}</Typography>
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          );
        })}
        <Grid size={12}>
          <Card variant="outlined" sx={{ borderStyle: 'dashed' }}>
            <CardActionArea onClick={onFree}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25 }}>
                <Box sx={{ color: 'text.secondary', display: 'flex' }}><ChatIcon /></Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle2">Free chat</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Ask anything; streamed responses, no structured plan.
                  </Typography>
                </Box>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
