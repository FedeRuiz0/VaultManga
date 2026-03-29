import express from 'express';
import { query, queryOne } from '../db/database.js';
import { mangaCache, getRedis } from '../db/redis.js';
import mangadexService from '../services/mangadex.service.js';
import { extractMangaDexUuid } from '../utils/mangadexSourcePath.js';

const router = express.Router();

// Get pages for a chapter
router.get('/chapter/:chapterId', async (req, res, next) => {
  try {
    const { chapterId } = req.params;

    const chapter = await queryOne('SELECT * FROM chapters WHERE id = $1', [chapterId]);
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    const mangadexChapterId = extractMangaDexUuid(chapter.source_path);
    if (!mangadexChapterId) {
      console.warn('[pages] invalid MangaDex UUID in source_path', {
        chapterId,
        source_path: chapter.source_path,
      });
      return res.json([]);
    }

    const cached = await mangaCache.getPages(chapterId);
    if (cached) {
      return res.json(cached);
    }

    const pageUrls = await mangadexService.fetchPages(mangadexChapterId);
    if (pageUrls.length === 0) {
      console.log('[pages] no pages from MangaDex', { chapterId, mangadexChapterId });
      return res.json([]);
    }

    const pages = pageUrls.map((imageUrl, index) => ({
      chapter_id: chapterId,
      page_number: index + 1,
      image_url: imageUrl,
      image_path: imageUrl,
      display_path: imageUrl,
      is_cached: false,
    }));

    for (const page of pages) {
      await query(
        `
        INSERT INTO pages (chapter_id, page_number, image_path, image_url, is_cached)
        VALUES ($1, $2, $3, $4, FALSE)
        ON CONFLICT (chapter_id, page_number)
        DO UPDATE SET
          image_path = EXCLUDED.image_path,
          image_url = EXCLUDED.image_url
        `,
        [chapterId, page.page_number, page.image_path, page.image_url]
      );
    }

    await query(
      `
      UPDATE chapters
      SET page_count = $1,
          pages_fetched = TRUE,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      `,
      [pages.length, chapterId]
    );

    await mangaCache.setPages(chapterId, pages);
    res.json(pages);
  } catch (error) {
    next(error);
  }
});

// Get single page
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const page = await queryOne('SELECT * FROM pages WHERE id = $1', [id]);

    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    res.json(page);
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

    for (const p of pages) {
      await query(
        `
        INSERT INTO pages (chapter_id, page_number, image_path, width, height, file_size)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (chapter_id, page_number)
        DO UPDATE SET
          image_path = EXCLUDED.image_path,
          width = EXCLUDED.width,
          height = EXCLUDED.height,
          file_size = EXCLUDED.file_size
        `,
        [chapter_id, p.page_number, p.image_path, p.width || null, p.height || null, p.file_size || null]
      );
    }

    await query(
      `
      UPDATE chapters SET
        page_count = (SELECT COUNT(*) FROM pages WHERE chapter_id = $1),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [chapter_id]
    );

    await mangaCache.cacheDelete(`pages:${chapter_id}`);

    res.status(201).json({ success: true, count: pages.length });
  } catch (error) {
    next(error);
  }
});

// Get prefetched pages
router.get('/prefetch/:chapterId', async (req, res, next) => {
  try {
    const { chapterId } = req.params;
    const { count = 5 } = req.query;

    const redis = getRedis();
    const pages = [];

for await (const key of redis.scanIterator({
  MATCH: `prefetch:${chapterId}:*`,
})) {
  const data = await redis.get(key);
  if (data) pages.push(JSON.parse(data));
}

    const prefetched = [];
    for (const key of keys.slice(0, parseInt(count, 10))) {
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

// Prefetch pages
router.post('/prefetch/:chapterId', async (req, res, next) => {
  try {
    const { chapterId } = req.params;
    const { pages = [] } = req.body;

    const redis = getRedis();
    const pipeline = redis.multi();

    for (const page of pages) {
      const key = `prefetch:${chapterId}:${page.page_number}`;
      pipeline.setEx(key, 300, JSON.stringify(page));
    }

    await pipeline.exec();

    res.json({ success: true, count: pages.length });
  } catch (error) {
    next(error);
  }
});

export default router;