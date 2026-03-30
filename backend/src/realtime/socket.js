import { Server } from 'socket.io';

let ioInstance = null;

export function initSocket(server) {
  ioInstance = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    },
  });

  ioInstance.on('connection', (socket) => {
    console.log(`[socket] client connected: ${socket.id}`);

    socket.on('library:subscribe', () => {
      socket.join('library');
    });

    socket.on('recommendations:subscribe', () => {
      socket.join('recommendations');
    });

    socket.on('disconnect', () => {
      console.log(`[socket] client disconnected: ${socket.id}`);
    });
  });

  return ioInstance;
}

export function getSocket() {
  return ioInstance;
}

export function emitLibraryUpdated(payload = {}) {
  if (!ioInstance) return;
  ioInstance.to('library').emit('library:updated', payload);
}

export function emitReadingUpdated(payload = {}) {
  if (!ioInstance) return;
  ioInstance.to('library').emit('reading:updated', payload);
}

export function emitRecommendationsUpdated(payload = {}) {
  if (!ioInstance) return;
  ioInstance.to('recommendations').emit('recommendations:updated', payload);
}