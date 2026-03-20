import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../db/database.js';
import { cacheGet, cacheSet, cacheDelete } from '../db/redis.js';
import * as mangadex from './sources/mangadex.js';

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
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
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

      for (const page of pages) {
  console.log(`🖼️ Page ${page.page_number}: ${page.image_url}`);
}

      console.log('💾 New manga inserted:', mangaId);
      manga = { id: mangaId };
    } else {
      manga = existing.rows[0];
      console.log('💾 Manga exists:', manga.id);
    }

    await client.query('COMMIT');
    return manga;

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ======================
// 📚 CHAPTERS
// ======================
export async function upsertChapters(mangaId, chapters) {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    for (const ch of chapters) {
      const exists = await client.query(
        'SELECT id FROM chapters WHERE manga_id=$1 AND chapter_number=$2',
        [mangaId, ch.chapter_number]
      );

      let chapterId;

      if (exists.rows.length === 0) {
        chapterId = uuidv4();

        await client.query(
          `INSERT INTO chapters (id,manga_id,chapter_number,title,source_path,page_count)
           VALUES ($1,$2,$3,$4,$5,0)`,
          [
            chapterId,
            mangaId,
            ch.chapter_number,
            ch.title,
            ch.source_path
          ]
        );

        console.log(`💾 New chapter ${ch.chapter_number}`);

      } else {
        chapterId = exists.rows[0].id;
        console.log(`📄 Chapter exists ${ch.chapter_number}`);
      }

      // ======================
      // 🖼️ SCRAPEAR Y GUARDAR PÁGINAS
      // ======================
      const pageCheck = await client.query(
        'SELECT COUNT(*)::int as count FROM pages WHERE chapter_id=$1',
        [chapterId]
      );

      if (pageCheck.rows[0].count > 0) {
        console.log(`🖼️ Pages already exist`);
        continue;
      }

      try {
        console.log(`🖼️ Scraping pages for ${ch.chapter_number}`);

        const pages = await mangadex.scrapeChapterPages(ch.url);

        console.log(`📄 Pages found: ${pages.length}`);

        for (let i = 0; i < pages.length; i++) {
          await client.query(
            `INSERT INTO pages (id, chapter_id, page_number, image_url)
             VALUES ($1, $2, $3, $4)`,
            [
              uuidv4(),
              chapterId,
              i + 1,
              pages[i].image_url
            ]
          );
        }

        await client.query(
          `UPDATE chapters SET page_count = $1 WHERE id = $2`,
          [pages.length, chapterId]
        );

      } catch (err) {
        console.log('⚠️ Page scrape failed:', err.message);
      }
      for (const page of pages) {
  console.log(`🖼️ Page ${page.page_number}: ${page.image_url}`);
}
    }

    await client.query('COMMIT');

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ======================
// 📊 REDIS
// ======================
export async function getScrapeProgress(id) {
  return (await cacheGet(`scraper:progress:${id}`)) || 0;
}

export async function setScrapeProgress(id, value) {
  await cacheSet(`scraper:progress:${id}`, value);
}

export async function clearScrapeProgress(id) {
  await cacheDelete(`scraper:progress:${id}`);
}