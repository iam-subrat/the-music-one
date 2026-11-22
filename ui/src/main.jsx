import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { loadFlags } from './lib/flags';
import { TuiProvider } from './tui/TuiContext';
import './styles/base.css';

loadFlags().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter>
        <TuiProvider>
          <App />
        </TuiProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
});
