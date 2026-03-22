import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { initDatabase } from './db/database.js';
import { initRedis } from './db/redis.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';
import { scanMangaFolders } from './services/mangaScanner.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Static files for manga images
app.use('/storage', express.static(join(__dirname, '../storage/manga')));
app.use('/manga/library', express.static('/manga/library', { 
  maxAge: '1d', 
  etag: false,
  setHeaders: (res, path) => {
    res.set('Access-Control-Allow-Origin', '*');
  }
}));


// API Routes
app.use('/api/v1', routes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize services and start server

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

async function startServer() {
  try {
    // Initialize database
    await initDatabase();
    console.log('✓ Database connected');

    // Initialize Redis
    await initRedis();
    console.log('✓ Redis connected');

    // Scan manga folders on startup (in background)
    if (process.env.AUTO_SCAN_ON_STARTUP === 'true') {
      console.log('Scanning manga folders...');
      scanMangaFolders().catch(err => 
        console.error('Manga folder scan failed:', err)
      );
    }

// Auto scraper
    import('./services/autoScraper.js').then(({ default: autoScraper }) => {
      autoScraper.start();
    }).catch(console.error);

// Start server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 MangaVault API running on port ${PORT}`);
      console.log(`📚 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('🤖 Auto-scraping habilitado - Nuevo contenido diario!');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

startServer();

export default app;