import express from 'express';
import { query } from '../db/database.js';
import { mangaCache } from '../db/redis.js';
import scraper from '../services/mangadexScraper.js';

const router = express.Router();

// Sanitize title for filesystem
function sanitizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .substring(0, 50) || 'unknown';
}

// Import mangas from MangaDex - FULL BACKGROUND INSERTION
router.post('/import', async (req, res, next) => {
  try {
    const { count = 10, genres = [] } = req.body;
    
    if (!count || count > 100) {
      return res.status(400).json({ error: 'count must be 1-100' });
    }

    res.json({ 
      status: 'started', 
      count: parseInt(count), 
      genres,
      message: `Scraping & importing ${count} mangas to library...` 
    });

    // Background processing with await
    (async () => {
      try {
        const result = await scraper.scrapeBatch({ 
          count: parseInt(count), 
          genres 
        });

        // Insert each scraped manga (if scraper exposes mangas array)
        let inserted = 0;
        if (result.mangas && Array.isArray(result.mangas)) {
          for (const manga of result.mangas) {
            const source_path = `/manga/${sanitizeTitle(manga.title)}`;
            
            await query(`
              INSERT INTO manga (title, source_path, status, description, cover_image, genre)
              VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT DO NOTHING
            `, [
              manga.title,
              source_path,
              manga.status || 'ongoing',
              manga.description || '',
              manga.cover_image || null,
              manga.genre || []
            ]);
            inserted++;
          }
        }

        // Clear cache
        await mangaCache.cacheDeletePattern('manga:*');

        console.log(`✅ LIBRARY UPDATED: ${inserted}/${count} mangas added`);
      } catch (error) {
        console.error('Background scraper failed:', error);
      }
    })();

  } catch (error) {
    next(error);
  }
});

// Status endpoint
router.get('/status', (req, res) => {
  res.json({
    status: 'ready',
    autoDaily: true,
    libraryReady: true
  });
});

// Clear cache
router.delete('/cache', async (req, res, next) => {
  try {
    await mangaCache.cacheDeletePattern('manga:*');
    res.json({ success: true, message: 'Cache cleared' });
  } catch (error) {
    next(error);
  }
});

export default router;

