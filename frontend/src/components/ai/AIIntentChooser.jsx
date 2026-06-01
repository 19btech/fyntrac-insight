import React, { useState } from 'react';
import { Box, Typography, Card, CardActionArea, CardContent, Grid, TextField, Button, Chip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import InsightsIcon from '@mui/icons-material/Insights';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import TimelineIcon from '@mui/icons-material/Timeline';
import RuleIcon from '@mui/icons-material/Rule';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import EditNoteIcon from '@mui/icons-material/EditNote';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import SendRoundedIcon from '@mui/icons-material/SendRounded';

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

const TILE_COLORS = {
  explain:    { bg: alpha('#6366f1', 0.07), color: '#4f46e5', border: alpha('#6366f1', 0.2) },
  build:      { bg: alpha('#10b981', 0.07), color: '#059669', border: alpha('#10b981', 0.2) },
  anomaly:    { bg: alpha('#f59e0b', 0.07), color: '#d97706', border: alpha('#f59e0b', 0.2) },
  compare:    { bg: alpha('#3b82f6', 0.07), color: '#2563eb', border: alpha('#3b82f6', 0.2) },
  reconcile:  { bg: alpha('#8b5cf6', 0.07), color: '#7c3aed', border: alpha('#8b5cf6', 0.2) },
};

const TILES = ['explain', 'build', 'anomaly', 'compare', 'reconcile'];

export default function AIIntentChooser({ onPick, onFree }) {
  const [draft, setDraft] = useState(null);

  if (draft) {
    const t = INTENT_TEMPLATES[draft.intent];
    const clr = TILE_COLORS[draft.intent] || TILE_COLORS.explain;
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Box sx={{ width: 32, height: 32, borderRadius: 2, bgcolor: clr.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: clr.color }}>
            {t?.icon}
          </Box>
          <Box>
            <Typography variant="subtitle2" fontWeight={700}>{t?.title}</Typography>
            <Typography variant="caption" color="text.secondary">Review and edit the prompt before sending</Typography>
          </Box>
        </Box>
        <TextField
          multiline minRows={4} fullWidth size="small"
          value={draft.prompt}
          onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2.5, bgcolor: '#fff', fontSize: '0.875rem',
              '& fieldset': { borderColor: clr.border },
              '&:hover fieldset': { borderColor: clr.color },
              '&.Mui-focused fieldset': { borderColor: clr.color },
            },
          }}
        />
        <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
          <Button
            size="small"
            startIcon={<KeyboardArrowLeftIcon fontSize="small" />}
            onClick={() => setDraft(null)}
            sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 500 }}
          >
            Back
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button
            size="small" variant="contained"
            endIcon={<SendRoundedIcon sx={{ fontSize: 15 }} />}
            onClick={() => onPick(draft)}
            disabled={!draft.prompt.trim()}
            sx={{
              borderRadius: 2, fontWeight: 600, textTransform: 'none',
              background: `linear-gradient(135deg, ${clr.color} 0%, ${clr.color}cc 100%)`,
              boxShadow: `0 2px 8px ${clr.border}`,
            }}
          >
            Generate plan
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      {/* Welcome banner */}
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 1.5, p: 2, mb: 2,
          borderRadius: 3,
          background: 'linear-gradient(135deg, rgba(79,70,229,0.06) 0%, rgba(124,58,237,0.06) 100%)',
          border: '1px solid',
          borderColor: alpha('#6366f1', 0.15),
        }}
      >
        <Box
          sx={{
            width: 40, height: 40, borderRadius: 2.5, flexShrink: 0,
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
          }}
        >
          <AutoAwesomeIcon sx={{ fontSize: 20, color: '#fff' }} />
        </Box>
        <Box>
          <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.2 }}>
            What would you like to explore?
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Insight grounds answers in your Datasets and KPIs.
          </Typography>
        </Box>
      </Box>

      {/* Intent tiles */}
      <Grid container spacing={1} sx={{ mb: 1 }}>
        {TILES.map((key) => {
          const t = INTENT_TEMPLATES[key];
          const clr = TILE_COLORS[key];
          return (
            <Grid size={12} key={key}>
              <Card
                variant="outlined"
                sx={{
                  borderColor: alpha(clr.color, 0.18),
                  transition: 'box-shadow 0.15s, border-color 0.15s',
                  '&:hover': { borderColor: clr.color, boxShadow: `0 0 0 1px ${clr.color}` },
                }}
              >
                <CardActionArea onClick={() => setDraft({ intent: key, prompt: t.seed })}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, '&:last-child': { pb: 1.25 } }}>
                    <Box
                      sx={{
                        width: 36, height: 36, borderRadius: 2, flexShrink: 0,
                        bgcolor: clr.bg, color: clr.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {t.icon}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2" fontWeight={600} sx={{ lineHeight: 1.3 }}>{t.title}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>{t.desc}</Typography>
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Free chat option */}
      <Card
        variant="outlined"
        sx={{
          borderStyle: 'dashed', borderColor: alpha('#6366f1', 0.25),
          '&:hover': { borderColor: '#6366f1', borderStyle: 'solid' },
          transition: 'all 0.15s',
        }}
      >
        <CardActionArea onClick={onFree}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, '&:last-child': { pb: 1.25 } }}>
            <Box
              sx={{
                width: 36, height: 36, borderRadius: 2, flexShrink: 0,
                bgcolor: alpha('#6366f1', 0.06), color: '#6366f1',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <ChatBubbleOutlineIcon fontSize="small" />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ lineHeight: 1.3 }}>Free chat</Typography>
              <Typography variant="caption" color="text.secondary">Ask anything — streamed free-form answers.</Typography>
            </Box>
          </CardContent>
        </CardActionArea>
      </Card>
    </Box>
  );
}
