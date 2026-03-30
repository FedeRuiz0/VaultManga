import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import { installOfflineSync } from './lib/offlineReader';
import RealtimeBridge from './components/RealtimeBridge';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 0,
      gcTime: 0,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

async function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  if (import.meta.env.DEV) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }

    return;
  }

  navigator.serviceWorker.register('/sw.js').catch((error) => {
    console.warn('[sw] registration failed', error);
  });
}

window.addEventListener('load', () => {
  setupServiceWorker().catch((error) => {
    console.warn('[sw] setup failed', error);
  });
});

installOfflineSync(() => {
  queryClient.invalidateQueries({ queryKey: ['libraryOverview'] });
  queryClient.invalidateQueries({ queryKey: ['libraryManga'] });
  queryClient.invalidateQueries({ queryKey: ['manga'] });
  queryClient.invalidateQueries({ queryKey: ['chapters'] });
  queryClient.invalidateQueries({ queryKey: ['recommendations'] });
  queryClient.invalidateQueries({ queryKey: ['recommendationProfile'] });
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <RealtimeBridge />
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);