import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  if (!socket) {
    const baseUrl =
      import.meta.env.VITE_SOCKET_URL ||
      window.location.origin.replace(':5173', ':3001');

    socket = io(baseUrl, {
      transports: ['websocket', 'polling'],
    });
  }

  return socket;
}