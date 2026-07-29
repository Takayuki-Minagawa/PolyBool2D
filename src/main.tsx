import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './i18n';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js`,
      { scope: import.meta.env.BASE_URL },
    );
  });
}
