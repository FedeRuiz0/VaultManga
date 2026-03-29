import express from 'express';
import { query, queryOne, queryAll } from '../db/database.js';
import { mangaCache } from '../db/redis.js';
import mangadexService from '../services/mangadex.service.js';
import { extractMangaDexUuid, normalizeMangaDexSourcePath } from '../utils/mangadexSourcePath.js';

const router = express.Router();

// Get chapters for a manga
router.get('/manga/:mangaId', async (req, res, next) => {
  try {
    const { mangaId } = req.params;
    const { sort = 'asc', language } = req.query;

    const order = sort === 'desc' ? 'DESC' : 'ASC';

    const countResult = await queryOne(
      'SELECT COUNT(*) as count FROM chapters WHERE manga_id = $1',
      [mangaId]
    );
    const chapterCount = parseInt(countResult?.count || '0', 10);

    if (chapterCount === 0) {
      console.log(`⚠️ No chapters found for manga ${mangaId}. Checking for auto-import...`);
      const manga = await queryOne('SELECT source_path FROM manga WHERE id = $1', [mangaId]);

      const normalizedMangaSource = normalizeMangaDexSourcePath(manga?.source_path || '');
      const mangaDexId = extractMangaDexUuid(normalizedMangaSource || '');

      if (!mangaDexId) {
        console.warn(`⚠️ Invalid manga source_path for auto-import: ${manga?.source_path || 'null'}`);
      } else {
        console.log(`🚀 Auto-importing chapters from MangaDex ID: ${mangaDexId}`);
        const remoteChapters = await mangadexService.fetchChapters(mangaDexId);

        for (const remoteChapter of remoteChapters) {
          await query(
            `
            INSERT INTO chapters (
              id, manga_id, chapter_number, title, source_path, page_count, pages_fetched, language
            )
            VALUES (uuid_generate_v4(), $1, $2, $3, $4, 0, FALSE, $5)
            ON CONFLICT (manga_id, chapter_number)
            DO UPDATE SET
              source_path = EXCLUDED.source_path,
              title = EXCLUDED.title,
              language = EXCLUDED.language,
              updated_at = CURRENT_TIMESTAMP
            `,
            [
              mangaId,
              remoteChapter.chapterNumber,
              remoteChapter.title,
              remoteChapter.source_path,
              remoteChapter.language || 'unknown',
            ]
          );
        }

        console.log(`✅ Imported or updated ${remoteChapters.length} chapters`);
      }
    }

    const params = [mangaId];
    let languageWhere = '';

    if (language) {
      params.push(String(language).toLowerCase());
      languageWhere = `AND LOWER(c.language) = $2`;
    }

    const chapters = await queryAll(
      `
      SELECT
        c.*,
        COALESCE(p.total_pages, 0) as total_pages,
        COALESCE(p.cached_pages, 0) as cached_pages
      FROM chapters c
      LEFT JOIN (
        SELECT
          chapter_id,
          COUNT(*) as total_pages,
          COUNT(*) FILTER (WHERE is_cached) as cached_pages
        FROM pages
        GROUP BY chapter_id
      ) p ON c.id = p.chapter_id
      WHERE c.manga_id = $1
      ${languageWhere}
      ORDER BY c.chapter_number::numeric ${order}
      `,
      params
    );

    res.json(chapters);
  } catch (error) {
    console.error('Chapters endpoint error:', error);
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const chapter = await queryOne(
      `
      SELECT c.*, m.title as manga_title
      FROM chapters c
      JOIN manga m ON c.manga_id = m.id
      WHERE c.id = $1
      `,
      [id]
    );

    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    res.json(chapter);
  } catch (error) {
    console.error('Chapter get error:', error);
    next(error);
  }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    const { id } = req.params;

    const chapter = await queryOne(
      `
      UPDATE chapters SET
        is_read = true,
        read_count = read_count + 1,
        read_progress = CASE
          WHEN COALESCE(page_count, 0) > 0 THEN page_count
          ELSE read_progress
        END,
        first_read_at = COALESCE(first_read_at, CURRENT_TIMESTAMP),
        last_read_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    await query(
      `
      UPDATE manga SET
        last_read_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [chapter.manga_id]
    );

    await mangaCache.invalidateChapters(chapter.manga_id);
    await mangaCache.invalidateManga(chapter.manga_id);

    res.json(chapter);
  } catch (error) {
    next(error);
  }
});

// Create chapter
router.post('/', async (req, res, next) => {
  try {
    const {
      manga_id,
      chapter_number,
      volume,
      title,
      source_path,
      page_count = 0,
      pages_fetched = false,
      language = 'unknown',
    } = req.body;

    if (!manga_id || !chapter_number || !source_path) {
      return res.status(400).json({ error: 'Manga ID, chapter number, and source path are required' });
    }

    const chapter = await queryOne(
      `
      INSERT INTO chapters (
        manga_id, chapter_number, volume, title, source_path, page_count, pages_fetched, language
      )
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, FALSE), $8)
      ON CONFLICT (manga_id, chapter_number)
      DO UPDATE SET
        source_path = EXCLUDED.source_path,
        page_count = EXCLUDED.page_count,
        pages_fetched = COALESCE(EXCLUDED.pages_fetched, chapters.pages_fetched),
        language = EXCLUDED.language,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
      `,
      [manga_id, chapter_number, volume, title, source_path, page_count, pages_fetched, language]
    );

    await mangaCache.invalidateChapters(manga_id);
    await mangaCache.invalidateManga(manga_id);

    res.status(201).json(chapter);
  } catch (error) {
    next(error);
  }
});

export default router;