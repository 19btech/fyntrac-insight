import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import { ThemeProvider, CssBaseline } from '@mui/material';
import App from './App';
import { buildMetabaseTheme } from './theme/metabaseTheme';

// Global error handlers
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error?.message);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled rejection:', event.reason);
});

// ── Token Bootstrap ─────────────────────────────────────────────────────────
// Strategy to obtain OIDC ID token for SSO:
// 1. Check URL parameter ?token=<jwt> (from gateway redirect)
// 2. Check sessionStorage (persists across page refreshes)
// 3. Fetch from gateway's /auth/token endpoint if session is active
// 4. If all fail, user is not authenticated — app will handle unauthorized responses
(function bootstrapToken() {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  const urlTenant = params.get('tenant');
  const urlFirstName = params.get('firstName');
  
  let modified = false;
  if (urlToken) {
    sessionStorage.setItem('insight_auth_token', urlToken);
    console.info('[Fyntrac Insight] Auth token received from URL and stored.');
    params.delete('token');
    modified = true;
  }
  if (urlTenant) {
    sessionStorage.setItem('insight_tenant', urlTenant);
    console.info('[Fyntrac Insight] Tenant received from URL and stored:', urlTenant);
    params.delete('tenant');
    modified = true;
  }
  if (urlFirstName) {
    sessionStorage.setItem('insight_firstName', urlFirstName);
    console.info('[Fyntrac Insight] First name received from URL and stored.');
    params.delete('firstName');
    modified = true;
  }
  
  if (modified) {
    const cleanUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    window.history.replaceState({}, document.title, cleanUrl);
  }

  // If token not in URL or sessionStorage, try to fetch from gateway session
  const existingToken = sessionStorage.getItem('insight_auth_token');
  if (!existingToken && !urlToken) {
    console.info('[Fyntrac Insight] No token in URL or sessionStorage. Attempting to fetch from gateway...');
    fetch('/auth/token', {
      method: 'GET',
      credentials: 'include', // Include cookies to authenticate with gateway
    })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(data => {
        if (data.token) {
          sessionStorage.setItem('insight_auth_token', data.token);
          console.info('[Fyntrac Insight] Auth token fetched from gateway and stored.');
        }
        if (data.tenant && !sessionStorage.getItem('insight_tenant')) {
          sessionStorage.setItem('insight_tenant', data.tenant);
          console.info('[Fyntrac Insight] Tenant fetched from gateway and stored.');
        }
      })
      .catch(err => {
        console.warn('[Fyntrac Insight] Could not fetch token from gateway:', err);
      });
  }
})();

// ── Axios defaults ──────────────────────────────────────────────────────────
// Inject the Bearer token into every request if available in sessionStorage.
axios.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('insight_auth_token');
  const tenant = sessionStorage.getItem('insight_tenant');
  
  config.headers = config.headers || {};
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  if (tenant) {
    config.headers['X-Tenant'] = tenant;
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
