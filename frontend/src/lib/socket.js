import { io } from 'socket.io-client';

let socket = null;

function resolveSocketUrl() {
  const explicitSocketUrl = import.meta.env.VITE_SOCKET_URL;
  if (explicitSocketUrl) return explicitSocketUrl;

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  if (apiBaseUrl) {
    try {
      return new URL(apiBaseUrl, window.location.origin).origin;
    } catch {
      return window.location.origin;
    }
  }

  return window.location.origin.replace(':5173', ':3001');
}

export function getSocket() {
  if (!socket) {
    socket = io(resolveSocketUrl(), {
      transports: ['websocket', 'polling'],
    });
  }

  return socket;
}