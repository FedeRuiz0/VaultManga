import 'dotenv/config';
import http from 'http';

import { createApp } from './app.js';
import { initDatabase } from './db/database.js';
import { initRedis } from './db/redis.js';
import runLibrarySeedBot from './bots/librarySeedbot.js';
import runGenreSeedBot from './bots/genreSeedbot.js';
import { initSocket } from './realtime/socket.js';

const PORT = Number(process.env.PORT) || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

const { app, allowedOrigins } = createApp({ nodeEnv: NODE_ENV });
const server = http.createServer(app);
const io = initSocket(server, allowedOrigins);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'MangaVault API',
    socket: Boolean(io),
    timestamp: new Date().toISOString(),
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