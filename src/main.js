import { createApp } from 'vue';
import App from './App.vue';
import router from './router/index.js';
import './index.css';
import axios from 'axios';
import { markApiSuccess, markApiFailure } from './composables/useSyncStatus.js';
import { getAuthToken, setAuthToken, AUTH_STORAGE_KEY } from './services/authFetch.js';

// Attach the session token to every same-origin API call
const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || '';
  if (url.startsWith('/api/') && !url.startsWith('/api/auth/login')) {
    const token = getAuthToken();
    const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    return nativeFetch(input, { ...init, headers }).then((res) => {
      if (res.status === 401 && token && !url.startsWith('/api/auth/')) {
        setAuthToken('');
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
        if (location.pathname !== '/login') location.replace('/login');
      }
      if (res.ok) markApiSuccess();
      return res;
    }, (err) => { markApiFailure(); throw err; });
  }
  return nativeFetch(input, init);
};

axios.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token && String(config.url || '').startsWith('/api/')) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
axios.interceptors.response.use((r) => r, (err) => {
  if (err?.response?.status === 401 && getAuthToken()) {
    setAuthToken('');
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    if (location.pathname !== '/login') location.replace('/login');
  }
  return Promise.reject(err);
});

const app = createApp(App);
app.use(router);
app.mount('#root');

// PWA Service Worker Registration
if ('serviceWorker' in navigator && process.env.NODE_ENV !== 'test') {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('[PWA] Service Worker registered with scope:', reg.scope);
      })
      .catch((err) => {
        console.warn('[PWA] Service Worker registration failed:', err);
      });
  });
}
