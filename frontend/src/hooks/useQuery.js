import axios from 'axios';

// ── API base URL ─────────────────────────────────────────────────────────────
// Dev   (CRA proxy):  falls back to direct backend at http://localhost:4000/api
//                     (setupProxy.js forwards /api/* → localhost:4000)
// Prod  (Docker/nginx): nginx proxies /api/insight/** → gateway → backend
//                       Set REACT_APP_API_BASE_URL=/api/insight at build time
//                       via the frontend Dockerfile or docker-compose build-args.
const BASE_URL = process.env.REACT_APP_API_BASE_URL || '/api';

const api = axios.create({ baseURL: BASE_URL });

// Attach JWT from sessionStorage to every request (set by index.js bootstrap)
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('insight_auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
