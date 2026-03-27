import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

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

// Bots
import runLibrarySeedBot from './bots/librarySeedbot.js';
import runGenreSeedBot from './bots/genreSeedbot.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ==============================
// 🧠 Middleware
// ==============================

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// ==============================
// 📡 Routes
// ==============================

app.use('/api/v1/manga', mangaRoutes);
app.use('/api/v1/chapters', chapterRoutes);
app.use('/api/v1/pages', pageRoutes);
app.use('/api/v1/library', libraryRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/stats', statsRoutes);

// ==============================
// ❤️ Health Check
// ==============================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'MangaVault API',
    timestamp: new Date().toISOString(),
  });
});

// ==============================
// ❌ Error Handler
// ==============================

app.use((err, req, res, next) => {
  console.error('[ERROR]', err);

  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

// ==============================
// 🚀 START SERVER
// ==============================

async function startServer() {
  try {
    console.log('🔌 Connecting to database...');
    await initDatabase();
    console.log('✅ Database connected');

    console.log('🔌 Connecting to Redis...');
    await initRedis();
    console.log('✅ Redis connected');

    app.listen(PORT, () => {
      console.log(`🚀 MangaVault API running on port ${PORT}`);
      console.log(`📚 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    console.log('ENABLE_STARTUP_BOTS =', process.env.ENABLE_STARTUP_BOTS);
    console.log('STARTUP_GENRES =', process.env.STARTUP_GENRES);

    // ==============================
    // 🤖 STARTUP BOTS
    // ==============================

    if (process.env.ENABLE_STARTUP_BOTS === 'true') {
      console.log('🤖 Starting startup bots...');

      // 🔹 Bot 1: Popular seed
      runLibrarySeedBot({
        limit: Number(process.env.SEED_POPULAR_LIMIT || 30),
        importChapters: process.env.SEED_IMPORT_CHAPTERS !== 'false',
        delayMs: Number(process.env.SEED_REQUEST_DELAY_MS || 400),
      }).catch((err) => {
        console.error('[library-seed-bot] failed:', err.message);
      });

      // 🔹 Bot 2: Genres
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