import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Service worker: register only in production. In development the dev-server
// bundle has a stable filename, so the SW's cache-first strategy would serve a
// stale bundle forever (old UI "falls back" every reload). In dev we instead
// actively unregister any existing SW and clear its caches.
if ('serviceWorker' in navigator) {
  if (process.env.NODE_ENV === 'production') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    });
  } else {
    navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
    if (window.caches) {
      caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
    }
  }
}

reportWebVitals();
