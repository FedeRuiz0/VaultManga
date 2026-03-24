import express from 'express';
import mangaRoutes from './mangaRoutes.js';
import chapterRoutes from './chapterRoutes.js';
import pageRoutes from './pageRoutes.js';
import libraryRoutes from './libraryRoutes.js';
import statsRoutes from './statsRoutes.js';
import authRoutes from './authRoutes.js';
import settingsRoutes from './settingsRoutes.js';

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/manga', mangaRoutes);
router.use('/chapters', chapterRoutes);
router.use('/pages', pageRoutes);
router.use('/library', libraryRoutes);
router.use('/stats', statsRoutes);
router.use('/auth', authRoutes);
router.use('/settings', settingsRoutes);

export default router;