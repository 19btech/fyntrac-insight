import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Stack, TextField, Button, Chip,
  Card, CardContent, CardActionArea, Alert, CircularProgress,
  IconButton, InputAdornment, Snackbar, Stepper, Step, StepLabel,
  Tooltip,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CheckCircleIcon from '@mui/icons-material/Check';
import HighlightOffOutlinedIcon from '@mui/icons-material/HighlightOffOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import api from '../hooks/useQuery';
import AppToast from '../components/shared/AppToast';

// ── Inline SVG provider logos ─────────────────────────────────────────────
const GeminiLogo = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M12 2C12 2 14.5 6.5 18 8.5C14.5 10.5 12 15 12 15C12 15 9.5 10.5 6 8.5C9.5 6.5 12 2 12 2Z" fill="#4285F4"/>
    <path d="M12 9C12 9 13.5 12 16 13.5C13.5 15 12 18 12 18C12 18 10.5 15 8 13.5C10.5 12 12 9 12 9Z" fill="#34A853"/>
    <path d="M12 15C12 15 12.8 17 14.5 18C12.8 19 12 21 12 21C12 21 11.2 19 9.5 18C11.2 17 12 15 12 15Z" fill="#FBBC05"/>
  </svg>
);

const OpenAILogo = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" fill="#10A37F"/>
  </svg>
);

const AnthropicLogo = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.767L16.906 20.48h-3.674l-1.587-4.227H5.246l-1.579 4.227H0L6.569 3.52zm1.04 3.845L5.2 13.298h4.818L7.609 7.365z" fill="#D97757"/>
  </svg>
);

const PROVIDER_LOGOS = { gemini: GeminiLogo, openai: OpenAILogo, anthropic: AnthropicLogo };

const PROVIDERS = {
  anthropic: {
    label: 'Anthropic (Claude)',
    description: 'Claude 3.5 Sonnet, Claude 3 Opus, and more',
    placeholder: 'sk-ant-…',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    color: '#D97757',
  },
  openai: {
    label: 'OpenAI (ChatGPT)',
    description: 'GPT-4o, GPT-4, and more',
    placeholder: 'sk-…',
    keyUrl: 'https://platform.openai.com/api-keys',
    color: '#10A37F',
  },
  gemini: {
    label: 'Google Gemini',
    description: "Google's multimodal AI models",
    placeholder: 'AIza…',
    keyUrl: 'https://aistudio.google.com/apikey',
    color: '#4285F4',
  },
};

const STEPS = ['Select Platform', 'Enter API Key', 'Test Connection', 'Save'];

const TOAST_OK = { bgcolor: '#dcfce7', color: '#166534', fontWeight: 600, border: '1px solid #bbf7d0', '& .MuiAlert-action': { color: '#166534' } };
const TOAST_ERR = { bgcolor: '#fee2e2', color: '#991b1b', fontWeight: 600, border: '1px solid #fecaca', '& .MuiAlert-action': { color: '#991b1b' } };

function ProviderLogo({ provider }) {
  const Logo = PROVIDER_LOGOS[provider];
  return Logo ? <Logo /> : null;
}

export default function Settings({ open, onClose }) {
  // mode: "loading" | "status" | "setup"
  const [mode, setMode] = useState('loading');
  const [currentConfig, setCurrentConfig] = useState(null); // { provider, model, keyHint }
  const [step, setStep] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, error? }
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [toast, setToast] = useState({ open: false, msg: '', ok: true });

  const showToast = (msg, ok = true) => {
    setToast({ open: true, msg, ok });
    setTimeout(() => setToast((t) => ({ ...t, open: false })), 3000);
  };

  // ── Load current status whenever dialog opens ─────────────────────────
  useEffect(() => {
    if (!open) return;
    setStep(0); setSelectedProvider(''); setApiKey(''); setShowKey(false);
    setTesting(false); setTestResult(null); setSaving(false);
    setSelectedModel(''); setModels([]); setDisconnecting(false);
    setMode('loading');
    api.get('/ai-settings')
      .then(({ data }) => {
        const ap = data.activeProvider;
        const hasKey = data.providers?.[ap]?.hasKey;
        if (hasKey) {
          setCurrentConfig({
            provider: ap,
            model: data.providers[ap]?.model || data.activeModel || '',
            keyHint: data.providers[ap]?.keyHint || '',
          });
          setMode('status');
        } else {
          setCurrentConfig(null);
          setMode('setup');
        }
      })
      .catch(() => { setCurrentConfig(null); setMode('setup'); });
  }, [open]);

  // ── Disconnect (clear active provider key) ────────────────────────────
  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await api.put('/ai-settings/key', { provider: currentConfig.provider, apiKey: '' });
      showToast('AI provider disconnected');
      setCurrentConfig(null);
      setMode('setup');
    } catch {
      showToast('Failed to disconnect provider', false);
    } finally { setDisconnecting(false); }
  };

  // ── Test key + load models ────────────────────────────────────────────
  const handleTestConnection = async () => {
    setTesting(true); setTestResult(null); setModels([]);
    try {
      const { data: testData } = await api.post('/ai-settings/test', { provider: selectedProvider, apiKey });
      setTestResult(testData);
      if (testData.ok) {
        const { data: modelData } = await api.get('/ai-settings/models', {
          params: { provider: selectedProvider, apiKey },
        });
        const list = modelData.models || [];
        setModels(list);
        if (list.length > 0) setSelectedModel(list[0].id || list[0]);
      }
    } catch (err) {
      setTestResult({ ok: false, error: err.response?.data?.error || 'Unable to reach the server.' });
    } finally { setTesting(false); }
  };

  // ── Save (store key + set active) ────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/ai-settings/key', { provider: selectedProvider, apiKey });
      await api.put('/ai-settings/active', { activeProvider: selectedProvider, activeModel: selectedModel });
      showToast('AI provider configured successfully');
      onClose?.();
    } catch {
      showToast('Failed to save configuration', false);
    } finally { setSaving(false); }
  };

  const canProceed = () => {
    if (step === 0) return !!selectedProvider;
    if (step === 1) return apiKey.trim().length > 0;
    if (step === 2) return testResult?.ok && !!selectedModel;
    return true;
  };

  // ── Status view ───────────────────────────────────────────────────────
  const renderStatus = () => {
    if (!currentConfig) return null;
    const prov = PROVIDERS[currentConfig.provider] || {};
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
        <Alert severity="success" icon={<CheckCircleIcon fontSize="small" />}>
          AI provider is connected and ready to use.
        </Alert>

        <Card variant="outlined" sx={{ borderColor: prov.color, borderWidth: 2 }}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ width: 48, height: 48, borderRadius: 2, bgcolor: '#F8F9FA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ProviderLogo provider={currentConfig.provider} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" fontWeight={600}>{prov.label || currentConfig.provider}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                <Chip label={currentConfig.model} size="small" sx={{ bgcolor: '#EEF0FE', color: '#5B5FED', fontWeight: 500 }} />
                <Chip label="Connected" size="small" color="success" variant="outlined" />
                {currentConfig.keyHint && (
                  <Typography variant="caption" color="text.secondary">Key: {currentConfig.keyHint}</Typography>
                )}
              </Box>
            </Box>
          </CardContent>
        </Card>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button variant="outlined" startIcon={<RefreshIcon fontSize="small" />} onClick={() => setMode('setup')} sx={{ flex: 1 }}>
            Change Provider
          </Button>
          <Button
            variant="outlined" color="error"
            startIcon={disconnecting ? <CircularProgress size={16} color="inherit" /> : <LinkOffIcon fontSize="small" />}
            onClick={handleDisconnect} disabled={disconnecting} sx={{ flex: 1 }}
          >
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </Button>
        </Box>
      </Box>
    );
  };

  // ── Wizard steps ──────────────────────────────────────────────────────
  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 2 }}>
            <Typography variant="body2" color="text.secondary">Choose your AI provider. You can change this later.</Typography>
            {Object.entries(PROVIDERS).map(([key, p]) => (
              <Card
                key={key}
                variant={selectedProvider === key ? 'outlined' : 'elevation'}
                sx={{
                  borderColor: selectedProvider === key ? p.color : 'transparent',
                  borderWidth: 2, borderStyle: 'solid',
                  boxShadow: selectedProvider === key ? `0 0 0 1px ${p.color}` : 1,
                }}
              >
                <CardActionArea onClick={() => setSelectedProvider(key)} sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: '#F8F9FA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ProviderLogo provider={key} />
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle1" fontWeight={600}>{p.label}</Typography>
                      <Typography variant="body2" color="text.secondary">{p.description}</Typography>
                    </Box>
                    {selectedProvider === key && <CheckCircleIcon sx={{ color: p.color, fontSize: 20 }} />}
                  </Box>
                </CardActionArea>
              </Card>
            ))}
          </Box>
        );

      case 1: {
        const p = PROVIDERS[selectedProvider];
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Enter your personal API key for <strong>{p?.label}</strong>.
            </Typography>
            <TextField
              fullWidth label="API Key"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoFocus
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
            <Button
              size="small" variant="text" component="a"
              href={p?.keyUrl} target="_blank" rel="noopener noreferrer"
              startIcon={<OpenInNewIcon fontSize="small" />}
              sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
            >
              Where do I get my API key?
            </Button>
          </Box>
        );
      }

      case 2:
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Verify your API key and choose a model.
            </Typography>
            <Button
              variant="contained" onClick={handleTestConnection} disabled={testing}
              startIcon={testing ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {testing ? 'Testing…' : 'Test Connection'}
            </Button>
            {testResult && (
              testResult.ok ? (
                <Alert severity="success" icon={<CheckCircleIcon fontSize="small" />}>
                  Connected! {models.length} model{models.length !== 1 ? 's' : ''} available.
                </Alert>
              ) : (
                <Alert severity="error" icon={<WarningAmberIcon fontSize="small" />}>
                  {testResult.error || 'Connection failed.'}
                </Alert>
              )
            )}
            {testResult?.ok && models.length > 0 && (
              <Box>
                <Typography variant="body2" fontWeight={600} mb={1}>Select a default model:</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {models.map((m) => {
                    const id = m.id || m;
                    const name = m.name || m.id || m;
                    const color = PROVIDERS[selectedProvider]?.color;
                    return (
                      <Card
                        key={id}
                        variant={selectedModel === id ? 'outlined' : 'elevation'}
                        sx={{ borderColor: selectedModel === id ? color : 'transparent', borderWidth: 2, borderStyle: 'solid', cursor: 'pointer' }}
                        onClick={() => setSelectedModel(id)}
                      >
                        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography variant="body2" fontWeight={500}>{name}</Typography>
                            {selectedModel === id && <CheckCircleIcon sx={{ color, fontSize: 16 }} />}
                          </Box>
                        </CardContent>
                      </Card>
                    );
                  })}
                </Box>
              </Box>
            )}
          </Box>
        );

      case 3:
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <Alert severity="info">Ready to save your configuration.</Alert>
            <Box sx={{ bgcolor: '#F8F9FA', borderRadius: 2, p: 2 }}>
              <Typography variant="body2" fontWeight={600} mb={1}>Summary</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <ProviderLogo provider={selectedProvider} />
                <Typography variant="body2">{PROVIDERS[selectedProvider]?.label}</Typography>
              </Box>
              <Typography variant="body2">
                Model: {models.find((m) => (m.id || m) === selectedModel)?.name || selectedModel}
              </Typography>
              <Typography variant="body2">API Key: ••••{apiKey.slice(-4)}</Typography>
            </Box>
          </Box>
        );

      default: return null;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
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
      {/* ── Branded header ── */}
      <DialogTitle sx={{ p: 0 }}>
        <Box
          sx={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            px: 3, pt: 3, pb: 2.5,
            background: 'linear-gradient(135deg, rgba(30,64,175,0.05) 0%, rgba(99,102,241,0.04) 100%)',
            borderBottom: '1px solid', borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <img src="/fyntrac9.png" alt="Fyntrac" style={{ width: 72, height: 'auto' }} />
            <Box>
              <Chip
                label="AI SETUP"
                size="small"
                sx={{
                  height: 20, fontSize: '0.6rem', fontWeight: 700, letterSpacing: 0.8,
                  textTransform: 'uppercase', bgcolor: 'rgba(99, 102, 241, 0.1)',
                  color: '#6366F1', mb: 0.5, borderRadius: '8px',
                }}
              />
              <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2, color: 'text.primary' }}>
                AI Agent Setup
              </Typography>
            </Box>
          </Box>
          <Tooltip title="Close" placement="left">
            <IconButton
              onClick={onClose} size="small"
              sx={{ color: 'text.secondary', bgcolor: 'action.hover', borderRadius: 2, '&:hover': { bgcolor: 'error.50', color: 'error.main' } }}
            >
              <HighlightOffOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </DialogTitle>

      <DialogContent>
        {mode === 'loading' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}
        {mode === 'status' && renderStatus()}
        {mode === 'setup' && (
          <>
            <Stepper activeStep={step} alternativeLabel sx={{ mt: 2, mb: 1 }}>
              {STEPS.map((label) => (
                <Step key={label}><StepLabel>{label}</StepLabel></Step>
              ))}
            </Stepper>
            {renderStep()}
          </>
        )}
      </DialogContent>

      {mode === 'setup' && (
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          {step > 0 && (
            <Button onClick={() => setStep((s) => s - 1)} disabled={saving}>Back</Button>
          )}
          <Box sx={{ flex: 1 }} />
          {step < 3 ? (
            <Button variant="contained" onClick={() => setStep((s) => s + 1)} disabled={!canProceed()}>
              Next
            </Button>
          ) : (
            <Button
              variant="contained" onClick={handleSave} disabled={saving}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {saving ? 'Saving…' : 'Save Configuration'}
            </Button>
          )}
        </DialogActions>
      )}

      {mode === 'status' && (
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      )}

      <AppToast open={toast.open} onClose={() => setToast((t) => ({ ...t, open: false }))} message={toast.msg} severity={toast.ok ? 'success' : 'error'} modal />
    </Dialog>
  );
}
