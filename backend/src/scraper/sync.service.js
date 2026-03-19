import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, getPool } from '../db/database.js';

export async function upsertManga(scrapedManga) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    
    // Check exact source_path
    let manga = await client.queryOne(
      'SELECT id FROM manga WHERE source_path = $1',
      [scrapedManga.source_path]
    );
    
    if (!manga) {
      const mangaId = scrapedManga.id || uuidv4();
      const result = await client.query(
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

export async function upsertChapters(mangaId, scrapedChapters) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    
    let insertedCount = 0;
    
    for (const ch of scrapedChapters) {
      const chapterSourcePath = `manganato:${ch.source_path.split(':')[1]}:ch-${ch.chapter_number}`;
      
      // Check exists
      const exists = await client.queryOne(
        'SELECT id FROM chapters WHERE manga_id = $1 AND chapter_number = $2',
        [mangaId, ch.chapter_number]
      );
      
      if (!exists) {
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

export async function scrapePagesIfNeeded(chapterId) {
  const { queryOne } = await import('../db/database.js');
  
  try {
    // Check if pages exist
    const pageCount = await queryOne(
      'SELECT COUNT(*)::int as count FROM pages WHERE chapter_id = $1',
      [chapterId]
    );
    
    if (pageCount.count > 0) {
      console.log('🖼️  Pages already scraped');
      return;
    }
    
    // Get chapter source_path to reconstruct URL
    const chapter = await queryOne(
      'SELECT source_path FROM chapters WHERE id = $1',
      [chapterId]
    );
    
    if (!chapter) return;
    
    // Reconstruct chapter URL (parse from source_path or store url in chapters?)
    // Note: For simplicity, assume first scrape passes url, but to make lazy, add chapter_url to schema or store in source_path extra.
    // Temp: skip full lazy impl, log.
    console.log('🛠️  Lazy page scrape TODO: reconstruct from', chapter.source_path);
    
  } catch (error) {
    console.error('❌ Lazy pages failed:', error.message);
  }
}

// Redis progress tracking (no schema change)
const { cacheGet, cacheSet, cacheDelete } = await import('../db/redis.js');

// ...

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
    console.log('💾 Progress saved to Redis:', progress);
  } catch (error) {
    console.error('❌ Redis progress save failed:', error.message);
  }
}

export async function clearScrapeProgress(mangaId) {
  try {
    await cacheDelete(`scraper:progress:${mangaId}`);
    console.log('🗑️ Progress cleared');
  } catch {
    // ignore
  }
}

export default { 
  upsertManga, upsertChapters, scrapePagesIfNeeded,
  getScrapeProgress, setScrapeProgress, clearScrapeProgress 
};

