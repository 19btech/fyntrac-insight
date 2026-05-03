// Global error handlers
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error?.message);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled rejection:', event.reason);
});

import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import { ThemeProvider, CssBaseline } from '@mui/material';
import App from './App';
import { buildMetabaseTheme } from './theme/metabaseTheme';

// ── Token Bootstrap ─────────────────────────────────────────────────────────
// When fyntrac-insight is opened from fyntrac-web, the ZITADEL ID token is
// passed as a ?token=<jwt> URL parameter. Read it once, store it in
// sessionStorage (survives page refreshes within this tab), then strip it
// from the URL so it doesn't leak in browser history.
(function bootstrapToken() {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  if (urlToken) {
    sessionStorage.setItem('insight_auth_token', urlToken);
    console.info('[Fyntrac Insight] Auth token received and stored.');
    params.delete('token');
    const cleanUrl =
      window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    window.history.replaceState({}, document.title, cleanUrl);
  }
})();

// ── Axios defaults ──────────────────────────────────────────────────────────
// Inject the Bearer token into every request if available in sessionStorage.
axios.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('insight_auth_token');
  if (token) {
    config.headers = config.headers || {};
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: log detailed error info for debugging
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('[Fyntrac Insight] Axios Error:', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    });
    return Promise.reject(error);
  }
);

// ── Render ───────────────────────────────────────────────────────────────────
const theme = buildMetabaseTheme('light');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found!');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
