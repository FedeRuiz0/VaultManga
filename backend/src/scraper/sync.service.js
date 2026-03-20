import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../db/database.js';
import { cacheGet, cacheSet, cacheDelete } from '../db/redis.js';

// ======================
// 🧠 HELPERS
// ======================
function normalizeChapterNumber(value) {
  return String(value ?? '').trim();
}

// ======================
// 📚 MANGA UPSERT
// ======================
export async function upsertManga(scrapedManga) {
  if (!scrapedManga?.source_path) {
    throw new Error('scrapedManga.source_path is required');
  }

  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT id FROM manga WHERE source_path = $1 LIMIT 1',
      [scrapedManga.source_path]
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

      console.log(`[sync] manga updated: ${mangaId}`);
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
          scrapedManga.source_path,
          scrapedManga.author || null,
          scrapedManga.status || 'unknown'
        ]
      );

      console.log(`[sync] manga inserted: ${mangaId}`);
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

// ======================
// 📖 CHAPTER UPSERT
// ======================
async function upsertSingleChapter(client, mangaId, chapter) {
  const chapterNumber = normalizeChapterNumber(chapter.chapter_number);

  if (!chapterNumber) {
    throw new Error('chapter_number is required');
  }

  const result = await client.query(
    `INSERT INTO chapters (id, manga_id, chapter_number, title, source_path, page_count)
     VALUES ($1, $2, $3, $4, $5, 0)
     ON CONFLICT (manga_id, chapter_number)
     DO UPDATE SET
       title = EXCLUDED.title,
       source_path = EXCLUDED.source_path,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [
      uuidv4(),
      mangaId,
      chapterNumber,
      chapter.title || `Chapter ${chapterNumber}`,
      chapter.source_path || chapter.url || ''
    ]
  );

  return {
    id: result.rows[0].id,
    chapter_number: chapterNumber,
    url: chapter.url
  };
}

// ======================
// 🖼️ PAGE SYNC
// ======================
async function syncChapterPages(client, chapterId, chapterUrlOrId, scrapeChapterPages) {
  const existingRes = await client.query(
    'SELECT COUNT(*)::int AS count FROM pages WHERE chapter_id = $1',
    [chapterId]
  );

  const existingCount = existingRes.rows[0].count;

  // Ya existen → no re-scrapear
  if (existingCount > 0) {
    await client.query(
      'UPDATE chapters SET page_count = $1 WHERE id = $2',
      [existingCount, chapterId]
    );

    return { inserted: 0, total: existingCount, skipped: true };
  }

  const scrapedPages = await scrapeChapterPages(chapterUrlOrId);

  if (!Array.isArray(scrapedPages) || scrapedPages.length === 0) {
    await client.query(
      'UPDATE chapters SET page_count = 0 WHERE id = $1',
      [chapterId]
    );

    return { inserted: 0, total: 0, skipped: false };
  }

  const values = [];
  const placeholders = [];

  for (let i = 0; i < scrapedPages.length; i++) {
    const page = scrapedPages[i];
    const pageNumber = Number(page.page_number || i + 1);
    const imageUrl = page.image_url;

    if (!imageUrl) continue;

    const base = values.length;

    values.push(uuidv4(), chapterId, pageNumber, imageUrl, imageUrl);
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`
    );
  }

  if (placeholders.length > 0) {
    await client.query(
      `INSERT INTO pages (id, chapter_id, page_number, image_path, image_url)
       VALUES ${placeholders.join(',')}
       ON CONFLICT (chapter_id, page_number)
       DO UPDATE SET
         image_url = EXCLUDED.image_url,
         image_path = EXCLUDED.image_path`,
      values
    );
  }

  const totalRes = await client.query(
    'SELECT COUNT(*)::int AS count FROM pages WHERE chapter_id = $1',
    [chapterId]
  );

  const total = totalRes.rows[0].count;

  await client.query(
    'UPDATE chapters SET page_count = $1 WHERE id = $2',
    [total, chapterId]
  );

  return {
    inserted: placeholders.length,
    total,
    skipped: false
  };
}

// ======================
// 📚 MAIN CHAPTER UPSERT
// ======================
export async function upsertChapters(mangaId, chapters, options = {}) {
  const { scrapeChapterPages } = options;

  if (!mangaId) throw new Error('mangaId is required');
  if (!Array.isArray(chapters) || chapters.length === 0) return [];

  if (typeof scrapeChapterPages !== 'function') {
    throw new Error('options.scrapeChapterPages function is required');
  }

  const client = await getPool().connect();
  const results = [];

  try {
    await client.query('BEGIN');

    for (const chapter of chapters) {
      const chapterRow = await upsertSingleChapter(client, mangaId, chapter);

      const pageResult = await syncChapterPages(
        client,
        chapterRow.id,
        chapterRow.url,
        scrapeChapterPages
      );

      results.push({
        chapter_id: chapterRow.id,
        chapter_number: chapterRow.chapter_number,
        page_count: pageResult.total,
        pages_inserted: pageResult.inserted,
        pages_skipped: pageResult.skipped
      });

      console.log(
        `[sync] chapter ${chapterRow.chapter_number} pages=${pageResult.total} inserted=${pageResult.inserted} skipped=${pageResult.skipped}`
      );
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

// ======================
// 📊 REDIS PROGRESS
// ======================
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
    // Redis opcional
  }
}

export async function clearScrapeProgress(id) {
  try {
    await cacheDelete(`scraper:progress:${id}`);
  } catch {
    // Redis opcional
  }
}