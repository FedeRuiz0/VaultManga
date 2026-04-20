import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import imageRoutes from './routes/imageRoutes.js';
import mangaRoutes from './routes/mangaRoutes.js';
import chapterRoutes from './routes/chapterRoutes.js';
import pageRoutes from './routes/pageRoutes.js';
import libraryRoutes from './routes/libraryRoutes.js';
import authRoutes from './routes/authRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import recommendationRoutes from './routes/recommendationRoutes.js';

export function getAllowedOrigins(nodeEnv = process.env.NODE_ENV || 'development') {
  const envOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (nodeEnv === 'production') {
    if (envOrigins.length === 0) {
      throw new Error('CORS_ORIGIN is required in production');
    }
    return envOrigins;
  }

  const devOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];

  return [...new Set([...devOrigins, ...envOrigins])];
}

export function createApp({ nodeEnv = process.env.NODE_ENV || 'development' } = {}) {
  const app = express();
  const allowedOrigins = getAllowedOrigins(nodeEnv);

  const corsOptions = {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  };

  app.use(cors(corsOptions));
  app.use(express.json({ limit: '10mb' }));
  app.use(morgan('dev'));

  app.get('/', (req, res) => {
    res.json({
      status: 'ok',
      service: 'MangaVault API',
      environment: nodeEnv,
    });
  });

  app.use('/api/v1/manga', mangaRoutes);
  app.use('/api/v1/images', imageRoutes);
  app.use('/api/v1/chapters', chapterRoutes);
  app.use('/api/v1/pages', pageRoutes);
  app.use('/api/v1/library', libraryRoutes);
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/settings', settingsRoutes);
  app.use('/api/v1/stats', statsRoutes);
  app.use('/api/v1/recommendations', recommendationRoutes);

  app.use((err, req, res, next) => {
    console.error('[ERROR]', err);

    res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error',
    });
  });

  return { app, allowedOrigins };
}