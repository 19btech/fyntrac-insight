import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000/api';

const api = axios.create({ baseURL: BASE_URL });

// Attach JWT from sessionStorage to every request
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('fyntrac_jwt');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
