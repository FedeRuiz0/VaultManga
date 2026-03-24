import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../db/database.js';
import { cacheGet, cacheSet, cacheDelete } from '../db/redis.js';
import { extractMangaDexUuid, normalizeMangaDexSourcePath } from '../utils/mangadexSourcePath.js';

function normalizeChapterNumber(value) {
  return String(value ?? '').trim();
}

export async function upsertManga(scrapedManga) {
  if (!scrapedManga?.source_path) {
    throw new Error('scrapedManga.source_path is required');
  }

  const normalizedSourcePath = normalizeMangaDexSourcePath(scrapedManga.source_path);
  if (!normalizedSourcePath) {
    throw new Error(`Invalid MangaDex source path: ${scrapedManga.source_path}`);
  }

  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT id FROM manga WHERE source_path = $1 LIMIT 1',
      [normalizedSourcePath]
    );

    let mangaId;

    if (existing.rows.length > 0) {
      mangaId = existing.rows[0].id;

      await client.query(
        `UPDATE manga
         SET title = $1,
             description = $2,
             cover_image = $3,
             author = $4,
             status = $5,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6`,
        [
          scrapedManga.title || 'Unknown title',
          scrapedManga.description || '',
          scrapedManga.cover_image || null,
          scrapedManga.author || null,
          scrapedManga.status || 'unknown',
          mangaId
        ]
      );

      console.log('[sync] manga updated', { mangaId, source_path: normalizedSourcePath });
    } else {
      mangaId = scrapedManga.id || uuidv4();

      await client.query(
        `INSERT INTO manga (
          id, title, description, cover_image, source_path, author, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          mangaId,
          scrapedManga.title || 'Unknown title',
          scrapedManga.description || '',
          scrapedManga.cover_image || null,
          normalizedSourcePath,
          scrapedManga.author || null,
          scrapedManga.status || 'unknown'
        ]
      );

      console.log('[sync] manga inserted', { mangaId, source_path: normalizedSourcePath });
    }

    await client.query('COMMIT');
    return { id: mangaId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function mangaExistsBySource(sourcePath) {
  const normalized = normalizeMangaDexSourcePath(sourcePath);
  if (!normalized) return false;

  const result = await getPool().query(
    'SELECT 1 FROM manga WHERE source_path = $1 LIMIT 1',
    [normalized]
  );

  return result.rows.length > 0;
}

export async function getAllManga() {
  const result = await getPool().query(
    'SELECT id, title, source_path FROM manga ORDER BY updated_at DESC NULLS LAST, created_at DESC'
  );

  return result.rows;
}

async function upsertSingleChapter(client, mangaId, chapter) {
  const chapterNumber = normalizeChapterNumber(chapter.chapter_number);
  const normalizedSourcePath = normalizeMangaDexSourcePath(chapter.source_path || chapter.url || '');

  if (!chapterNumber) {
    throw new Error('chapter_number is required');
  }

  if (!normalizedSourcePath) {
    console.warn('[sync] invalid chapter source_path; skipping', {
      mangaId,
      chapter_number: chapterNumber,
      source_path: chapter.source_path || chapter.url || ''
    });
    return null;
  }

  const chapterId = extractMangaDexUuid(normalizedSourcePath);
  if (!chapterId) {
    console.warn('[sync] invalid MangaDex UUID; skipping', {
      mangaId,
      chapter_number: chapterNumber,
      source_path: normalizedSourcePath
    });
    return null;
  }

  const result = await client.query(
    `INSERT INTO chapters (id, manga_id, chapter_number, title, source_path, page_count)
     VALUES ($1, $2, $3, $4, $5, 0)
     ON CONFLICT (manga_id, chapter_number)
     DO UPDATE SET
       source_path = EXCLUDED.source_path,
       title = EXCLUDED.title,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [
      uuidv4(),
      mangaId,
      chapterNumber,
      chapter.title || `Chapter ${chapterNumber}`,
      normalizedSourcePath
    ]
  );

  return {
    id: result.rows[0].id,
    chapter_number: chapterNumber
  };
}

export async function upsertChapters(mangaId, chapters) {
  if (!mangaId) throw new Error('mangaId is required');

  const client = await getPool().connect();
  const results = [];

  try {
    await client.query('BEGIN');

    for (const chapter of chapters || []) {
      const chapterRow = await upsertSingleChapter(client, mangaId, chapter);
      if (!chapterRow) {
        continue;
      }

      results.push({
        chapter_id: chapterRow.id,
        chapter_number: chapterRow.chapter_number,
        page_count: 0,
        pages_inserted: 0,
        pages_skipped: true
      });

      console.log('[sync] chapter upserted', {
        mangaId,
        chapter_number: chapterRow.chapter_number
      });
    }

    await client.query('COMMIT');
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getScrapeProgress(id) {
  try {
    return (await cacheGet(`scraper:progress:${id}`)) || 0;
  } catch {
    return 0;
  }
}

export async function setScrapeProgress(id, value) {
  try {
    await cacheSet(`scraper:progress:${id}`, value);
  } catch {
    // optional
  }
}

export async function clearScrapeProgress(id) {
  try {
    await cacheDelete(`scraper:progress:${id}`);
  } catch {
    // optional
  }
}