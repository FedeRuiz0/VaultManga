import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import { installOfflineSync } from './lib/offlineReader';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('[sw] registration failed', error);
    });
  });
}

installOfflineSync(() => {
  queryClient.invalidateQueries({ queryKey: ['libraryOverview'] });
  queryClient.invalidateQueries({ queryKey: ['libraryManga'] });
  queryClient.invalidateQueries({ queryKey: ['manga'] });
  queryClient.invalidateQueries({ queryKey: ['chapters'] });
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);