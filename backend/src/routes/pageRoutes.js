import express from 'express';
import { query, queryOne, queryAll } from '../db/database.js';
import { mangaCache, getRedis } from '../db/redis.js';

const router = express.Router();

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function extractMangaDexId(sourcePath) {
  if (!sourcePath) return null;
  const match = sourcePath.match(/[0-9a-f-]{36}/i);
  return match ? match[0] : null;
}

function extractMangaDexChapterId(sourcePath) {
  if (!sourcePath || typeof sourcePath !== 'string') return null;

  const trimmed = sourcePath.trim();
  const uuidMatch = trimmed.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  const extracted = uuidMatch?.[0] || null;

  if (!extracted || !UUID_V4_REGEX.test(extracted)) {
    return null;
  }

  return extracted;
}

async function ensureChapterPages(chapter) {
  const { id } = chapter;

  if (!chapter.source_path?.includes('mangadex')) return;

  const extractedId = extractMangaDexId(chapter.source_path);
  console.log('📌 RAW source_path:', chapter.source_path);
  console.log('📌 Extracted chapterId:', extractedId);

  if (!extractedId) {
    console.warn(`⚠️ Invalid MangaDex source_path for chapter ${id}: ${chapter.source_path}`);
    return;
  }
  

  const redis = getRedis();
  const lockKey = `lock:chapter:scrape:chapter:${id}`;
  const lock = await redis.set(lockKey, '1', { NX: true, EX: 120 });

  if (lock) {
    try {
      const { default: pageScraper } = await import('../services/pageScraper.js');
      await pageScraper.importPages(chapter.id, extractedId);
    } finally {
      await redis.del(lockKey);
    }
    return;
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(500);
    const exists = await queryOne('SELECT 1 FROM pages WHERE chapter_id = $1 LIMIT 1', [chapter.id]);
    if (exists) return;
  }
}

// Get pages for a chapter
router.get('/chapter/:chapterId', async (req, res, next) => {
  try {
    const { chapterId } = req.params;

    const chapter = await queryOne('SELECT * FROM chapters WHERE id = $1', [chapterId]);

    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    const cached = await mangaCache.getPages(chapterId);
    if (cached) {
      return res.json(cached);
    }

    let pages = await queryAll(`
      SELECT 
        p.*,
        CASE
          WHEN p.is_cached THEN CONCAT('/storage/cached/', p.chapter_id, '/', p.page_number, '.webp')
          ELSE p.image_path
        END as display_path
      FROM pages p
      WHERE p.chapter_id = $1
      ORDER BY p.page_number ASC
    `, [chapterId]);

    console.log('📚 Before scrape:', pages.length);

    if (pages.length === 0) {
      console.log('🚀 Triggering scrape...');
      await ensureChapterPages(chapter);

      pages = await queryAll(`
        SELECT 
          p.*,
          CASE 
            WHEN p.is_cached THEN CONCAT('/storage/cached/', p.chapter_id, '/', p.page_number, '.webp')
            ELSE p.image_path
          END as display_path
        FROM pages p
        WHERE p.chapter_id = $1
        ORDER BY p.page_number ASC
      `, [chapterId]);
    }

    console.log('📚 After scrape:', pages.length);

    if (pages.length > 0) {
      await mangaCache.setPages(chapterId, pages);
    }

    res.json(pages);
  } catch (error) {
    next(error);
  }
});

// Get single page
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const page = await queryOne(`
      SELECT * FROM pages WHERE id = $1
    `, [id]);

    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    res.json(page);
  } catch (error) {
    next(error);
  }
});

// Create page
router.post('/', async (req, res, next) => {
  try {
    const { 
      chapter_id, 
      page_number, 
      image_path,
      width,
      height,
      file_size
    } = req.body;

    if (!chapter_id || !page_number || !image_path) {
      return res.status(400).json({ error: 'Chapter ID, page number, and image path are required' });
    }

    const page = await queryOne(`
      INSERT INTO pages (
        chapter_id, page_number, image_path, width, height, file_size
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (chapter_id, page_number) 
      DO UPDATE SET image_path = $3, width = $4, height = $5, file_size = $6
      RETURNING *
    `, [chapter_id, page_number, image_path, width, height, file_size]);

    // Invalidate pages cache
    await mangaCache.cacheDelete(`pages:${chapter_id}`);

    res.status(201).json(page);
  } catch (error) {
    next(error);
  }
});

// Bulk create pages
router.post('/bulk', async (req, res, next) => {
  try {
    const { chapter_id, pages } = req.body;

    if (!chapter_id || !pages || !Array.isArray(pages)) {
      return res.status(400).json({ error: 'Chapter ID and pages array are required' });
    }

    const values = pages.map((p, idx) => 
      `($1, ${p.page_number}, $${idx + 2}, ${p.width || 'NULL'}, ${p.height || 'NULL'}, ${p.file_size || 'NULL'})`
    ).join(', ');

    const params = [chapter_id, ...pages.map(p => p.image_path)];

    const result = await query(`
      INSERT INTO pages (chapter_id, page_number, image_path, width, height, file_size)
      VALUES ${values}
      ON CONFLICT (chapter_id, page_number) 
      DO UPDATE SET image_path = EXCLUDED.image_path, 
                    width = EXCLUDED.width, 
                    height = EXCLUDED.height, 
                    file_size = EXCLUDED.file_size
    `, params);

    // Update chapter page count
    await query(`
      UPDATE chapters SET 
        page_count = (SELECT COUNT(*) FROM pages WHERE chapter_id = $1),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [chapter_id]);

    // Invalidate cache
    await mangaCache.cacheDelete(`pages:${chapter_id}`);

    res.status(201).json({ success: true, count: pages.length });
  } catch (error) {
    next(error);
  }
});

// Cache page (prefetch)
router.post('/:id/cache', async (req, res, next) => {
  try {
    const { id } = req.params;

    const page = await queryOne('SELECT * FROM pages WHERE id = $1', [id]);
    
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Mark as cached
    await query(`
      UPDATE pages SET 
        is_cached = true,
        cached_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id]);

    res.json({ success: true, message: 'Page cached successfully' });
  } catch (error) {
    next(error);
  }
});

// Get prefetched pages (for next chapter preloading)
router.get('/prefetch/:chapterId', async (req, res, next) => {
  try {
    const { chapterId } = req.params;
    const { count = 5 } = req.query;

    const redis = getRedis();
    const keys = await redis.keys(`prefetch:${chapterId}:*`);
    
    const prefetched = [];
    for (const key of keys.slice(0, parseInt(count))) {
      const data = await redis.get(key);
      if (data) {
        prefetched.push(JSON.parse(data));
      }
    }

    res.json(prefetched);
  } catch (error) {
    next(error);
  }
});

// Prefetch pages for a chapter
router.post('/prefetch/:chapterId', async (req, res, next) => {
  try {
    const { chapterId } = req.params;
    const { pages = [] } = req.body;

    const redis = getRedis();
    const pipeline = redis.multi();

    for (const page of pages) {
      const key = `prefetch:${chapterId}:${page.page_number}`;
      pipeline.setEx(key, 300, JSON.stringify(page)); // 5 min TTL
    }

    await pipeline.exec();

    res.json({ success: true, count: pages.length });
  } catch (error) {
    next(error);
  }
});

// Delete page
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const page = await queryOne('SELECT chapter_id FROM pages WHERE id = $1', [id]);
    
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    await query('DELETE FROM pages WHERE id = $1', [id]);

    // Invalidate cache
    await mangaCache.cacheDelete(`pages:${page.chapter_id}`);

    res.json({ success: true, message: 'Page deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;