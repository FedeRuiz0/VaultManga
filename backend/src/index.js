import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import imageRoutes from './routes/imageRoutes.js';
import http from 'http';

import { initDatabase } from './db/database.js';
import { initRedis } from './db/redis.js';

// Routes
import mangaRoutes from './routes/mangaRoutes.js';
import chapterRoutes from './routes/chapterRoutes.js';
import pageRoutes from './routes/pageRoutes.js';
import libraryRoutes from './routes/libraryRoutes.js';
import authRoutes from './routes/authRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import recommendationRoutes from './routes/recommendationRoutes.js';

// Bots
import runLibrarySeedBot from './bots/librarySeedbot.js';
import runGenreSeedBot from './bots/genreSeedbot.js';

import { initSocket } from './realtime/socket.js';

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT) || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

function getAllowedOrigins() {
  const envOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (NODE_ENV === 'production') {
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

const allowedOrigins = getAllowedOrigins();

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

const io = initSocket(server, allowedOrigins);

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'MangaVault API',
    environment: NODE_ENV,
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

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'MangaVault API',
    socket: Boolean(io),
    timestamp: new Date().toISOString(),
  });
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err);

  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

async function startServer() {
  try {
    console.log('🔌 Connecting to database...');
    await initDatabase();
    console.log('✅ Database connected');

    console.log('🔌 Connecting to Redis...');
    await initRedis();
    console.log('✅ Redis connected');

    server.listen(PORT, () => {
      console.log(`🚀 MangaVault API running on port ${PORT}`);
      console.log(`📚 Environment: ${NODE_ENV}`);
      console.log(`🌍 Allowed CORS origins: ${allowedOrigins.join(', ')}`);
    });

    if (process.env.ENABLE_STARTUP_BOTS === 'true') {
      console.log('🤖 Starting startup bots...');

      runLibrarySeedBot({
        limit: Number(process.env.SEED_POPULAR_LIMIT || 30),
        importChapters: process.env.SEED_IMPORT_CHAPTERS !== 'false',
        delayMs: Number(process.env.SEED_REQUEST_DELAY_MS || 400),
      }).catch((err) => {
        console.error('[library-seed-bot] failed:', err.message);
      });

      const genres = (process.env.STARTUP_GENRES || '')
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean);

      for (const genre of genres) {
        runGenreSeedBot(genre, {
          limit: Number(process.env.SEED_GENRE_LIMIT || 20),
          importChapters: process.env.SEED_IMPORT_CHAPTERS !== 'false',
          delayMs: Number(process.env.SEED_REQUEST_DELAY_MS || 400),
        }).catch((err) => {
          console.error(`[genre-seed-bot:${genre}] failed:`, err.message);
        });
      }
    } else {
      console.log('⚠️ Startup bots disabled');
    }
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();