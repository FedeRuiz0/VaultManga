import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import { installOfflineSync } from './lib/offlineReader';
import RealtimeBridge from './components/RealtimeBridge';
import { useAuthStore } from './stores/authStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

function AuthQuerySync() {
  const userId = useAuthStore((state) => state.user?.id || null);
  const token = useAuthStore((state) => state.token || null);

  React.useEffect(() => {
    queryClient.clear();
  }, [userId, token]);

  return null;
}

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
  queryClient.invalidateQueries({ queryKey: ['recentReadPage'] });
  queryClient.invalidateQueries({ queryKey: ['history'] });
  queryClient.invalidateQueries({ queryKey: ['recommendations'] });
  queryClient.invalidateQueries({ queryKey: ['recommendationProfile'] });
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthQuerySync />
        <RealtimeBridge />
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);