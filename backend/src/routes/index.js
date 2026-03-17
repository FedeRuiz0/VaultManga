import express from 'express';
import mangaRoutes from './mangaRoutes.js';
import chapterRoutes from './chapterRoutes.js';
import pageRoutes from './pageRoutes.js';
import libraryRoutes from './libraryRoutes.js';
import statsRoutes from './statsRoutes.js';
import authRoutes from './authRoutes.js';
import settingsRoutes from './settingsRoutes.js';
import scraperRoutes from './scraperRoutes.js';

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
router.use('/manga', mangaRoutes);
router.use('/chapters', chapterRoutes);
router.use('/pages', pageRoutes);
router.use('/library', libraryRoutes);
router.use('/stats', statsRoutes);
router.use('/auth', authRoutes);
router.use('/settings', settingsRoutes);

// API Routes
router.use('/manga', mangaRoutes);
router.use('/chapters', chapterRoutes);
router.use('/pages', pageRoutes);
router.use('/library', libraryRoutes);
router.use('/stats', statsRoutes);
router.use('/auth', authRoutes);
router.use('/settings', settingsRoutes);
router.use('/scraper', scraperRoutes);

// Scan manga folders
router.post('/scan', async (req, res, next) => {
  try {
    const { scanMangaFolders } = await import('../services/mangaScanner.js');
    const result = await scanMangaFolders();
    res.json({ success: true, result });
  } catch (error) {
    next(error);
  }
});

// Get scan status
router.get('/scan/status', async (req, res, next) => {
  try {
    const { getScanStatus } = await import('../services/mangaScanner.js');
    const status = await getScanStatus();
    res.json(status);
  } catch (error) {
    next(error);
  }
});

export default router;

