import { io } from 'socket.io-client';

let socket = null;

function resolveSocketUrl() {
  return import.meta.env.VITE_SOCKET_URL || 'https://vaultmanga-production.up.railway.app';
}

export function getSocket() {
  if (!socket) {
    socket = io(resolveSocketUrl(), {
      transports: ['websocket', 'polling'],
    });
  }

  return socket;
}