import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, getPool } from '../db/database.js';

// ======================
// 🧠 MANGA UPSERT
// ======================
export async function upsertManga(scrapedManga) {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT id FROM manga WHERE source_path = $1',
      [scrapedManga.source_path]
    );

    let manga;

    if (existing.rows.length === 0) {
      const mangaId = scrapedManga.id || uuidv4();

      await client.query(
        `INSERT INTO manga (
          id, title, description, cover_image, source_path, author, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          mangaId,
          scrapedManga.title,
          scrapedManga.description,
          scrapedManga.cover_image,
          scrapedManga.source_path,
          scrapedManga.author,
          scrapedManga.status
        ]
      );

      console.log('💾 New manga inserted:', mangaId);
      manga = { id: mangaId };
    } else {
      manga = existing.rows[0];
      console.log('💾 Manga exists:', manga.id);
    }

    await client.query('COMMIT');
    return manga;

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Manga upsert failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// ======================
// 📚 CHAPTERS UPSERT
// ======================
export async function upsertChapters(mangaId, scrapedChapters) {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    let insertedCount = 0;

    for (const ch of scrapedChapters) {
      const chapterSourcePath = `manganato:${ch.source_path.split(':')[1]}:ch-${ch.chapter_number}`;

      
      const exists = await client.query(
        'SELECT id FROM chapters WHERE manga_id = $1 AND chapter_number = $2',
        [mangaId, ch.chapter_number]
      );

      if (exists.rows.length === 0) {
        const chapterId = uuidv4();

        await client.query(
          `INSERT INTO chapters (
            id, manga_id, chapter_number, title, source_path, page_count
          ) VALUES ($1, $2, $3, $4, $5, 0)`,
          [chapterId, mangaId, ch.chapter_number, ch.title, chapterSourcePath]
        );

        console.log(`💾 New chapter: ${ch.chapter_number}`);
        insertedCount++;
      } else {
        console.log(`📄 Chapter exists: ${ch.chapter_number}`);
      }
    }

    console.log(`💾 Inserted ${insertedCount} new chapters`);
    await client.query('COMMIT');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Chapters upsert failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// ======================
// 🖼️ PAGES (lazy)
// ======================
export async function scrapePagesIfNeeded(chapterId) {
  try {
    const pageCount = await queryOne(
      'SELECT COUNT(*)::int as count FROM pages WHERE chapter_id = $1',
      [chapterId]
    );

    if (pageCount?.count > 0) {
      console.log('🖼️ Pages already scraped');
      return;
    }

    const chapter = await queryOne(
      'SELECT source_path FROM chapters WHERE id = $1',
      [chapterId]
    );

    if (!chapter) return;

    console.log('🛠️ Lazy page scrape TODO:', chapter.source_path);

  } catch (error) {
    console.error('❌ Lazy pages failed:', error.message);
  }
}

// ======================
// 📊 REDIS PROGRESS
// ======================
import { cacheGet, cacheSet, cacheDelete } from '../db/redis.js';

export async function getScrapeProgress(mangaId) {
  try {
    const progress = await cacheGet(`scraper:progress:${mangaId}`);
    return progress || 0;
  } catch {
    return 0;
  }
}

export async function setScrapeProgress(mangaId, progress) {
  try {
    await cacheSet(`scraper:progress:${mangaId}`, progress);
    console.log('💾 Progress saved:', progress);
  } catch (error) {
    console.error('❌ Redis error:', error.message);
  }
}

export async function clearScrapeProgress(mangaId) {
  try {
    await cacheDelete(`scraper:progress:${mangaId}`);
    console.log('🗑️ Progress cleared');
  } catch {}
}

export default {
  upsertManga,
  upsertChapters,
  scrapePagesIfNeeded,
  getScrapeProgress,
  setScrapeProgress,
  clearScrapeProgress
};