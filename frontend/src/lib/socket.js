import { io } from 'socket.io-client';

let socket = null;

function resolveSocketUrl() {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/api\/v1\/?$/, '');
  }
  if (typeof window !== 'undefined') return window.location.origin;
  return undefined;
}

function resolveAuthToken() {
  if (typeof window === 'undefined') return null;

  try {
    const persisted = window.localStorage.getItem('mangavault-auth');
    if (!persisted) return null;

    const parsed = JSON.parse(persisted);
    return parsed?.state?.token || null;
  } catch {
    return null;
  }
}

export function getSocket() {
  const token = resolveAuthToken();

  if (!socket) {
    socket = io(resolveSocketUrl(), {
      transports: ['websocket', 'polling'],
      auth: {
        token,
      },
    });
  } else {
    const currentToken = socket.auth?.token || null;
    if (currentToken !== token) {
      socket.auth = { ...socket.auth, token };
      if (socket.connected) {
        socket.disconnect().connect();
      }
    }
  }

  return socket;
}