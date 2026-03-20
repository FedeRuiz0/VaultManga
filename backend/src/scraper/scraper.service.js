import manganato from './sources/manganato.js';
import { matchManga } from './matcher.service.js';
import * as mangadex from './sources/mangadex.js';

import {
  upsertManga,
  upsertChapters,
  getScrapeProgress,
  setScrapeProgress,
  clearScrapeProgress
} from './sync.service.js';

const SOURCES = [mangadex, manganato];

// ======================
// 🚀 MAIN SCRAPER
// ======================
export async function scrapeAndSyncManga(searchTitle, options = { resume: false }) {
  console.log('🚀 Starting scrapeAndSyncManga:', searchTitle);

  try {
    let scrapedManga = null;
    let scrapedChapters = [];

    // 🔎 Buscar en fuentes
    for (const source of SOURCES) {
      try {
        console.log('🔎 Trying source...');

        const results = await source.searchManga(searchTitle, 1);

        if (!results || results.length === 0) {
          console.log('⚠️ No results');
          continue;
        }

        const top = results[0];

        scrapedManga = await source.scrapeMangaDetails(top.url);
        scrapedChapters = await source.scrapeChapterList(top.url);

        if (!scrapedManga || scrapedChapters.length === 0) {
          console.log('⚠️ No data from source');
          continue;
        }

        // ✅ IMPORTANT: ordenar capítulos (cap 1 → último)
        scrapedChapters.sort(
          (a, b) => parseFloat(a.chapter_number) - parseFloat(b.chapter_number)
        );

        console.log(`✅ Source success: ${scrapedManga.title}`);
        break;

      } catch (err) {
        console.log('⚠️ Source failed:', err.message);
      }
    }

    if (!scrapedManga || scrapedChapters.length === 0) {
      throw new Error('No data scraped from any source');
    }

    console.log(`📚 Chapters found: ${scrapedChapters.length}`);

    // 🔗 matcher (opcional)
    await matchManga(scrapedManga);

    // 💾 guardar manga
    const mangaRecord = await upsertManga(scrapedManga);
    const mangaId = mangaRecord.id;

    // 🧹 FORZAR SCRAPE COMPLETO (opción 2)
    await clearScrapeProgress(mangaId);
    let progress = 0;

    console.log(`📊 Starting from 0/${scrapedChapters.length}`);

    // ======================
    // 📦 BATCH SYSTEM
    // ======================
    while (progress < scrapedChapters.length) {
      const batchEnd = Math.min(progress + 10, scrapedChapters.length);

      console.log(`📦 Processing ${progress + 1} → ${batchEnd}`);

      const batch = scrapedChapters.slice(progress, batchEnd);

      // 💾 Guardar capítulos
      await upsertChapters(mangaId, batch);

      // 🖼️ SCRAPEAR PÁGINAS (LO QUE TE FALTABA)
      for (const ch of batch) {
        try {
          console.log(`🖼️ Scraping pages: ${ch.chapter_number}`);

          const pages = await mangadex.scrapeChapterPages(ch.url);

          console.log(`📄 Pages: ${pages.length}`);

          // 👉 acá después podés insertar en DB (si tenés tabla pages)
          // await insertPages(chapterId, pages)

        } catch (err) {
          console.log('⚠️ Pages failed:', err.message);
        }
      }

      progress = batchEnd;
      await setScrapeProgress(mangaId, progress);

      if (progress < scrapedChapters.length) {
        console.log('⏳ Waiting 10s...');
        await new Promise(r => setTimeout(r, 10000));
      }
    }

    console.log('🎉 SCRAPE COMPLETED');

    return {
      mangaId,
      totalChapters: scrapedChapters.length
    };

  } catch (error) {
    console.error('💥 Full scrape failed:', error.message);
    throw error;
  }
}

export default { scrapeAndSyncManga };