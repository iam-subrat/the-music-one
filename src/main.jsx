import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { supabase } from './lib/supabase';
import { loadRemoteFlags } from './lib/flags';
import { ToastProvider } from './components/Toast';
import './styles/base.css';

loadRemoteFlags(supabase).then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
});
