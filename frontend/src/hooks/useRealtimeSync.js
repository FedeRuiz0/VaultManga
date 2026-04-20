import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../lib/socket';
import { useAuthStore } from '../stores/authStore';

export function useRealtimeSync() {
  const queryClient = useQueryClient();
  const token = useAuthStore((state) => state.token);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated || !token) return undefined;

    const socket = getSocket();

    socket.emit('library:subscribe', { token });
    socket.emit('recommendations:subscribe', { token });

    const refreshLibrary = () => {
      queryClient.invalidateQueries({ queryKey: ['libraryOverview'] });
      queryClient.invalidateQueries({ queryKey: ['libraryManga'] });
      queryClient.invalidateQueries({ queryKey: ['recentReadPage'] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey?.[0] === 'chapter',
      });
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey?.[0] === 'chapters',
      });
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey?.[0] === 'manga',
      });
    };

    const refreshRecommendations = () => {
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['recommendationProfile'] });
    };

    socket.on('library:updated', refreshLibrary);
    socket.on('reading:updated', refreshLibrary);
    socket.on('recommendations:updated', refreshRecommendations);

    return () => {
      socket.off('library:updated', refreshLibrary);
      socket.off('reading:updated', refreshLibrary);
      socket.off('recommendations:updated', refreshRecommendations);
    };
  }, [isAuthenticated, queryClient, token]);
}