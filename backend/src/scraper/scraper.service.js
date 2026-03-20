import manganato from './sources/manganato.js';
import { matchManga } from './matcher.service.js';
import * as sync from './sync.service.js';

const SOURCES = [manganato];

export async function scrapeAndSyncManga(searchTitle, options = { resume: true }) {
  console.log('🚀 Starting scrapeAndSyncManga:', searchTitle);

  try {
    let scrapedManga = null;
    let scrapedChapters = [];

    // ✅ FIX: loop correcto
    for (const source of SOURCES) {
      try {
        console.log(`🔎 Trying source...`);

        const searchResults = await source.searchManga(searchTitle, 1);

        if (!searchResults || searchResults.length === 0) {
          console.log('⚠️ No results from this source');
          continue;
        }

        const topResult = searchResults[0];

        scrapedManga = await source.scrapeMangaDetails(topResult.url);
        scrapedChapters = await source.scrapeChapterList(topResult.url);

        if (!scrapedManga || scrapedChapters.length === 0) {
          console.log('⚠️ Failed to get details or chapters');
          continue;
        }

        // asignar source_path a capítulos
        scrapedChapters.forEach(ch => {
          ch.source_path = `${scrapedManga.source_path}:ch-${ch.chapter_number}`;
        });

        console.log(`✅ Source success: ${scrapedManga.title}`);
        break;

      } catch (err) {
        console.log('⚠️ Source failed:', err.message);
      }
    }

    // ❌ si nada funcionó
    if (!scrapedManga || scrapedChapters.length === 0) {
      throw new Error('No data scraped from any source');
    }

    console.log(`📚 Total chapters found: ${scrapedChapters.length}`);

    // 🔗 match (opcional)
    await matchManga(scrapedManga);

    // 💾 guardar manga
    const mangaRecord = await sync.upsertManga(scrapedManga);
    const mangaId = mangaRecord.id;

    if (!options.resume) {
      await sync.clearScrapeProgress(mangaId);
    }

    let progress = await sync.getScrapeProgress(mangaId);
    console.log(`📊 Resume: ${progress}/${scrapedChapters.length}`);

    // 📦 BATCH SYSTEM
    while (progress < scrapedChapters.length) {
      const batchEnd = Math.min(progress + 20, scrapedChapters.length);

      console.log(`📦 Processing ${progress + 1} → ${batchEnd}`);

      const batch = scrapedChapters.slice(progress, batchEnd);

      await sync.upsertChapters(mangaId, batch);

      progress = batchEnd;
      await sync.setScrapeProgress(mangaId, progress);

      if (progress < scrapedChapters.length) {
        console.log('⏳ Waiting 60s...');
        await new Promise(r => setTimeout(r, 60000));
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