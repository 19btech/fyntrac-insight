import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Tabs, Tab, TextField,
  Button, Typography, Chip, MenuItem, Select, FormControl, InputLabel, Alert,
  CircularProgress, IconButton, InputAdornment, Stack, Divider, Switch, FormControlLabel,
  Tooltip,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import HighlightOffOutlinedIcon from '@mui/icons-material/HighlightOffOutlined';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import api from '../../hooks/useQuery';

const PROVIDERS = [
  { key: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-…', help: 'Get a key at console.anthropic.com' },
  { key: 'openai', label: 'OpenAI', placeholder: 'sk-…', help: 'Get a key at platform.openai.com' },
  { key: 'gemini', label: 'Google Gemini', placeholder: 'AIza…', help: 'Get a key at aistudio.google.com' },
];

export default function AISettingsDialog({ open, onClose, onSaved }) {
  const [tab, setTab] = useState(0);
  const provider = PROVIDERS[tab].key;

  const [settings, setSettings] = useState(null);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeProvider, setActiveProvider] = useState('anthropic');
  const [conservativeMode, setConservativeMode] = useState(false);

  const loadSettings = async () => {
    const { data } = await api.get('/ai-settings');
    setSettings(data);
    setActiveProvider(data.activeProvider);
    setConservativeMode(!!data.conservativeMode);
  };

  const handleConservativeToggle = async (e) => {
    const next = e.target.checked;
    setConservativeMode(next);
    try {
      await api.put('/ai-settings/conservative', { conservativeMode: next });
      onSaved?.();
    } catch {
      setConservativeMode(!next);
    }
  };

  const loadModels = async (p, keyOverride) => {
    setLoadingModels(true);
    setModels([]);
    try {
      const params = { provider: p };
      if (keyOverride) params.apiKey = keyOverride;
      const { data } = await api.get('/ai-settings/models', { params });
      setModels(data.models || []);
    } catch {
      setModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => { if (open) loadSettings(); }, [open]);

  // When tab/provider changes, hydrate from settings + load models
  useEffect(() => {
    if (!settings) return;
    setKeyInput('');
    setShowKey(false);
    setTestResult(null);
    setModel(settings.providers[provider]?.model || '');
    if (settings.providers[provider]?.hasKey) loadModels(provider);
    else setModels([]);
  }, [tab, settings]);

  const cfg = settings?.providers[provider] || {};

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await api.post('/ai-settings/test', {
        provider,
        apiKey: keyInput || undefined,
      });
      setTestResult(data);
      // Load models immediately on success so the user can pick one right away.
      if (data.ok) await loadModels(provider, keyInput || undefined);
    } catch (err) {
      setTestResult({ ok: false, error: err.response?.data?.error || err.message });
    } finally {
      setTesting(false);
    }
  };

  const friendlyError = (raw) => {
    if (!raw) return 'Unknown error';
    if (/quota|429|rate.?limit/i.test(raw)) return 'Quota exceeded — this key has reached its usage limit.';
    if (/auth|invalid.*key|api.?key|401|403/i.test(raw)) return 'Invalid API key — please double-check and try again.';
    if (/network|timeout/i.test(raw)) return 'Could not reach the provider — check your connection.';
    const clean = raw.replace(/\{[\s\S]*\}/g, '').trim();
    return clean || 'Key test failed. Please check the key and try again.';
  };

  const handleSaveKey = async () => {
    if (!keyInput) return;
    setSaving(true);
    try {
      await api.put('/ai-settings/key', { provider, apiKey: keyInput });
      setKeyInput('');
      await loadSettings();
      await loadModels(provider);
    } finally { setSaving(false); }
  };

  const handleClearKey = async () => {
    setSaving(true);
    try {
      await api.put('/ai-settings/key', { provider, apiKey: '' });
      await loadSettings();
      setModels([]);
    } finally { setSaving(false); }
  };

  const handleSetActive = async () => {
    setSaving(true);
    try {
      await api.put('/ai-settings/active', { activeProvider: provider, activeModel: model });
      await loadSettings();
      onSaved?.();
    } finally { setSaving(false); }
  };

  const handleModelChange = async (e) => {
    const newModel = e.target.value;
    setModel(newModel);
    // If this provider is already active, save immediately for runtime switch
    if (activeProvider === provider && cfg.hasKey) {
      await api.put('/ai-settings/active', { activeProvider: provider, activeModel: newModel });
      onSaved?.();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
      PaperProps={{
        sx: {
          borderRadius: 4,
          boxShadow: '0 32px 64px rgba(0,0,0,0.14)',
          overflow: 'hidden',
          border: '1px solid',
          borderColor: 'divider',
        },
      }}
    >
      <DialogTitle sx={{ p: 0 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            px: 3,
            pt: 3,
            pb: 2.5,
            background: 'linear-gradient(135deg, rgba(30,64,175,0.05) 0%, rgba(99,102,241,0.04) 100%)',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <img src="/fyntrac9.png" alt="Fyntrac" style={{ width: 72, height: 'auto' }} />
            <Box>
              <Chip
                label="AI"
                size="small"
                sx={{
                  height: 18, fontSize: '0.6rem', fontWeight: 700, letterSpacing: 0.8,
                  textTransform: 'uppercase', bgcolor: alpha('#3f51b5', 0.1),
                  color: '#3f51b5', mb: 0.5, borderRadius: 1,
                }}
              />
              <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2, color: 'text.primary' }}>
                AI Provider Settings
              </Typography>
            </Box>
          </Box>
          <Tooltip title="Close" placement="left">
            <IconButton
              onClick={onClose}
              size="small"
              sx={{
                color: 'text.secondary', bgcolor: 'action.hover', borderRadius: 2,
                '&:hover': { bgcolor: 'error.50', color: 'error.main' },
              }}
            >
              <HighlightOffOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ mb: 2, p: 1.5, bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 1.5 }}>
          <FormControlLabel
            control={<Switch checked={conservativeMode} onChange={handleConservativeToggle} size="small" />}
            label={<Typography variant="body2" sx={{ fontWeight: 600 }}>Conservative mode</Typography>}
            sx={{ m: 0 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 0 }}>
            Restrict AI to collections referenced by your Datasets and KPIs.
          </Typography>
        </Box>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          {PROVIDERS.map((p, i) => (
            <Tab
              key={p.key}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  {p.label}
                  {settings?.providers[p.key]?.hasKey && (
                    <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main' }} />
                  )}
                  {activeProvider === p.key && (
                    <Chip label="Active" size="small" color="primary" sx={{ height: 18, fontSize: '0.65rem' }} />
                  )}
                </Box>
              }
            />
          ))}
        </Tabs>

        <Stack spacing={2}>
          <Box>
            <Typography variant="body2" color="text.secondary" mb={0.5}>
              {PROVIDERS[tab].help}
            </Typography>
            {cfg.hasKey && !keyInput ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, bgcolor: '#f1f5f9', borderRadius: 1.5 }}>
                <CheckCircleIcon sx={{ color: 'success.main', fontSize: 18 }} />
                <Typography variant="body2" sx={{ flex: 1 }}>
                  Key stored: <strong>{cfg.keyHint}</strong>
                  {cfg.verifiedAt && (
                    <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                      · verified {new Date(cfg.verifiedAt).toLocaleDateString()}
                    </Typography>
                  )}
                </Typography>
                <Button size="small" color="error" onClick={handleClearKey} disabled={saving}>
                  Remove
                </Button>
              </Box>
            ) : (
              <TextField
                fullWidth
                size="small"
                type={showKey ? 'text' : 'password'}
                placeholder={PROVIDERS[tab].placeholder}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShowKey((v) => !v)}>
                          {showKey ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              onClick={handleTest}
              disabled={testing || (!keyInput && !cfg.hasKey)}
              startIcon={testing ? <CircularProgress size={14} /> : null}
            >
              Test Key
            </Button>
            {keyInput && (
              <Button variant="contained" color="secondary" onClick={handleSaveKey} disabled={saving}>
                Save Key
              </Button>
            )}
          </Box>

          {testResult && (
            <Alert
              severity={testResult.ok ? 'success' : 'error'}
              icon={testResult.ok ? <CheckCircleIcon /> : <ErrorIcon />}
            >
              {testResult.ok
                ? `Connection successful — ${models.length} model${models.length !== 1 ? 's' : ''} available. Pick one below.`
                : friendlyError(testResult.error)}
            </Alert>
          )}

          <Divider />

          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              Model
              {loadingModels && <CircularProgress size={12} sx={{ ml: 1 }} />}
            </Typography>
            <FormControl fullWidth size="small" disabled={!cfg.hasKey || loadingModels}>
              <InputLabel>Select a model</InputLabel>
              <Select value={model} label="Select a model" onChange={handleModelChange}>
                {models.length === 0 && (
                  <MenuItem value="" disabled>
                    {cfg.hasKey ? 'No models available' : 'Add an API key first'}
                  </MenuItem>
                )}
                {models.map((m) => (
                  <MenuItem key={m.id} value={m.id}>{m.name || m.id}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {cfg.hasKey && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: '0.75rem' }}>
                Models are fetched live from your {PROVIDERS[tab].label} account.
              </Typography>
            )}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {activeProvider === provider ? (
              <Chip
                icon={<CheckCircleIcon />}
                label={`${PROVIDERS[tab].label} is your active provider`}
                color="primary"
                size="small"
              />
            ) : (
              <Button
                variant="contained"
                color="secondary"
                startIcon={<RadioButtonUncheckedIcon />}
                onClick={handleSetActive}
                disabled={!cfg.hasKey || !model || saving}
              >
                Make {PROVIDERS[tab].label} active
              </Button>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}
