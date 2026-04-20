import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';

let ioInstance = null;

function resolveSocketToken(socket) {
  const authToken = socket.handshake?.auth?.token;
  if (authToken) return authToken;

  const authHeader = socket.handshake?.headers?.authorization;
  if (!authHeader) return null;

  const [scheme, value] = authHeader.split(' ');
  if (scheme?.toLowerCase() === 'bearer' && value) return value;

  return null;
}

function resolveUserIdFromSocket(socket) {
  const token = resolveSocketToken(socket);
  const secret = process.env.JWT_SECRET;

  if (!token || !secret) return null;

  try {
    const payload = jwt.verify(token, secret);
    return payload?.id || null;
  } catch {
    return null;
  }
}

function getUserRoom(userId) {
  if (!userId) return null;
  return `user:${userId}`;
}

export function initSocket(server, allowedOrigins = ['*']) {
  ioInstance = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      credentials: true,
    },
  });

  ioInstance.on('connection', (socket) => {
    const userId = resolveUserIdFromSocket(socket);
    const userRoom = getUserRoom(userId);

    if (userRoom) {
      socket.join(userRoom);
    }

    console.log(`[socket] client connected: ${socket.id}`, userId ? `(user:${userId})` : '');

    socket.on('library:subscribe', () => {
      socket.join('library');
      if (userRoom) {
        socket.join(userRoom);
      }
    });

    socket.on('recommendations:subscribe', () => {
      socket.join('recommendations');
      if (userRoom) {
        socket.join(userRoom);
      }
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

function emitToLibraryScope(eventName, payload = {}) {
  if (!ioInstance) return;

  const userRoom = getUserRoom(payload?.user_id);
  if (userRoom) {
    ioInstance.to(userRoom).emit(eventName, payload);
    return;
  }

  ioInstance.to('library').emit(eventName, payload);
}

function emitToRecommendationScope(eventName, payload = {}) {
  if (!ioInstance) return;

  const userRoom = getUserRoom(payload?.user_id);
  if (userRoom) {
    ioInstance.to(userRoom).emit(eventName, payload);
    return;
  }

  ioInstance.to('recommendations').emit(eventName, payload);
}

export function emitLibraryUpdated(payload = {}) {
  emitToLibraryScope('library:updated', payload);
}

export function emitReadingUpdated(payload = {}) {
  emitToLibraryScope('reading:updated', payload);
}

export function emitRecommendationsUpdated(payload = {}) {
  emitToRecommendationScope('recommendations:updated', payload);
}