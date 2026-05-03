import React from 'react';
import { Box, Typography, TextField, Paper } from '@mui/material';

export default function VariablePanel({ variables, values, onChange }) {
  const handleChange = (key, value) => {
    onChange({ ...values, [key]: value });
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
      <Typography variant="body2" fontWeight={700} mb={1} color="text.secondary">
        TEMPLATE VARIABLES ({variables.length})
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        {variables.map((v) => (
          <TextField
            key={v}
            size="small"
            label={`{{${v}}}`}
            value={values[v] ?? ''}
            onChange={(e) => handleChange(v, e.target.value)}
            sx={{ minWidth: 150 }}
          />
        ))}
      </Box>
    </Paper>
  );
}
