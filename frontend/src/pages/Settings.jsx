import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Tabs, Tab, Stack, TextField, Button, Chip,
  Select, MenuItem, FormControl, InputLabel, Alert, CircularProgress,
  IconButton, InputAdornment, Divider, Switch, FormControlLabel,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import api from '../hooks/useQuery';

const PROVIDERS = [
  { key: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-…', help: 'Get a key at console.anthropic.com' },
  { key: 'openai',    label: 'OpenAI',    placeholder: 'sk-…',     help: 'Get a key at platform.openai.com' },
  { key: 'gemini',    label: 'Google Gemini', placeholder: 'AIza…', help: 'Get a key at aistudio.google.com' },
];

function AISettingsPanel() {
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

  const loadSettings = async () => {
    try {
      const { data } = await api.get('/ai-settings');
      setSettings(data);
    } catch (err) {
      setTestResult({ ok: false, error: err.message });
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

  useEffect(() => { loadSettings(); }, []);

  useEffect(() => {
    if (!settings) return;
    setKeyInput('');
    setShowKey(false);
    setTestResult(null);
    setModel(settings.providers[provider]?.model || '');
    if (settings.providers[provider]?.hasKey) loadModels(provider);
    else setModels([]);
  }, [tab, settings]);

  if (!settings) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  const cfg = settings.providers[provider] || {};
  const activeProvider = settings.activeProvider;

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const { data } = await api.post('/ai-settings/test', { provider, apiKey: keyInput || undefined });
      setTestResult(data);
      // Load models immediately on success so the user can pick one right away.
      if (data.ok) await loadModels(provider, keyInput || undefined);
    } catch (err) {
      setTestResult({ ok: false, error: err.response?.data?.error || err.message });
    } finally { setTesting(false); }
  };

  const friendlyError = (raw) => {
    if (!raw) return 'Unknown error';
    if (/quota|429|rate.?limit/i.test(raw)) return 'Quota exceeded — this key has reached its usage limit.';
    if (/auth|invalid.*key|api.?key|401|403/i.test(raw)) return 'Invalid API key — please double-check and try again.';
    if (/network|timeout/i.test(raw)) return 'Could not reach the provider — check your connection.';
    // Strip raw JSON noise: only show up to the first sentence
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
    } finally { setSaving(false); }
  };

  const handleModelChange = async (e) => {
    const newModel = e.target.value;
    setModel(newModel);
    if (activeProvider === provider && cfg.hasKey) {
      await api.put('/ai-settings/active', { activeProvider: provider, activeModel: newModel });
      await loadSettings();
    }
  };

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        {PROVIDERS.map((p) => (
          <Tab
            key={p.key}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                {p.label}
                {settings.providers[p.key]?.hasKey && (
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
          <Typography variant="body2" color="text.secondary" mb={0.5}>{PROVIDERS[tab].help}</Typography>
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
              <Button size="small" color="error" onClick={handleClearKey} disabled={saving}>Remove</Button>
            </Box>
          ) : (
            <TextField
              fullWidth size="small"
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
          <Button variant="outlined" onClick={handleTest} disabled={testing || (!keyInput && !cfg.hasKey)}
            startIcon={testing ? <CircularProgress size={14} /> : null}>
            Test Key
          </Button>
          {keyInput && (
            <Button variant="contained" color="secondary" onClick={handleSaveKey} disabled={saving}>
              Save Key
            </Button>
          )}
        </Box>

        {testResult && (
          <Alert severity={testResult.ok ? 'success' : 'error'}>
            {testResult.ok
              ? `Key is valid — ${models.length} model${models.length !== 1 ? 's' : ''} available. Pick one below.`
              : friendlyError(testResult.error)}
          </Alert>
        )}

        {cfg.hasKey && (
          <FormControl fullWidth size="small">
            <InputLabel>Model</InputLabel>
            <Select
              label="Model"
              value={model}
              onChange={handleModelChange}
              disabled={loadingModels}
            >
              {(models.length ? models : (model ? [{ id: model }] : [])).map((m) => (
                <MenuItem key={m.id || m} value={m.id || m}>{m.id || m}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {cfg.hasKey && activeProvider !== provider && (
          <Button variant="contained" onClick={handleSetActive} disabled={saving}>
            Make {PROVIDERS[tab].label} the active provider
          </Button>
        )}
      </Stack>
    </Box>
  );
}

function AccountPanel() {
  const token = sessionStorage.getItem('fyntrac_jwt') || '';
  let claims = null;
  try {
    if (token) claims = JSON.parse(atob(token.split('.')[1]));
  } catch { /* noop */ }
  return (
    <Stack spacing={1.5}>
      <Box>
        <Typography variant="body2" color="text.secondary">Tenant</Typography>
        <Typography variant="body1" fontWeight={600}>{claims?.tenantId || 'dev-tenant'}</Typography>
      </Box>
      <Box>
        <Typography variant="body2" color="text.secondary">User</Typography>
        <Typography variant="body1" fontWeight={600}>{claims?.userId || claims?.sub || 'dev-user'}</Typography>
      </Box>
      <Box>
        <Typography variant="body2" color="text.secondary">Role</Typography>
        <Typography variant="body1" fontWeight={600}>{claims?.role || 'admin'}</Typography>
      </Box>
    </Stack>
  );
}

export default function Settings() {
  const [section, setSection] = useState(0);
  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h2" mb={2}>Settings</Typography>

      <Paper variant="outlined">
        <Tabs value={section} onChange={(_, v) => setSection(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="AI Providers" />
          <Tab label="Account" />
        </Tabs>
        <Box sx={{ p: 3 }}>
          {section === 0 && <AISettingsPanel />}
          {section === 1 && <AccountPanel />}
        </Box>
      </Paper>
    </Box>
  );
}
