import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { loadFlags } from './lib/flags';
import { initAnalytics } from './lib/analytics';
import './styles/base.css';

initAnalytics(import.meta.env.VITE_POSTHOG_KEY);

loadFlags().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
});
