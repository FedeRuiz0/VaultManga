import * as mangadex from './sources/mangadex.js';
import { matchManga } from './matcher.service.js';

import {
  upsertManga,
  upsertChapters,
  getScrapeProgress,
  setScrapeProgress,
  clearScrapeProgress
} from './sync.service.js';

const SOURCE = mangadex;
const BATCH_SIZE = Number(process.env.SCRAPER_BATCH_SIZE || 10);
const BATCH_DELAY_MS = Number(process.env.SCRAPER_BATCH_DELAY_MS || 500);

// ======================
// 🔧 HELPERS
// ======================
function parseChapterNumber(value) {
  const parsed = Number.parseFloat(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function sortChaptersAscending(chapters) {
  return [...chapters].sort((a, b) => {
    const aNum = parseChapterNumber(a.chapter_number);
    const bNum = parseChapterNumber(b.chapter_number);

    if (aNum !== bNum) return aNum - bNum;

    return String(a.chapter_number).localeCompare(
      String(b.chapter_number),
      undefined,
      { numeric: true }
    );
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ======================
// 🚀 MAIN SCRAPER
// ======================
export async function scrapeAndSyncManga(searchTitle, options = {}) {
  const { resume = false } = options;

  console.log(`[scraper] start title="${searchTitle}"`);

  const results = await SOURCE.searchManga(searchTitle, 5);

  if (!results?.length) {
    throw new Error(`No manga found: ${searchTitle}`);
  }

  let scrapedManga = null;
  let chapterList = [];

  for (const candidate of results) {
    try {
      console.log(`[scraper] trying: ${candidate.title}`);

      // extraemos solo la ID
      const mangaId = candidate.id;

      const [manga, chapters] = await Promise.all([
        SOURCE.scrapeMangaDetails(mangaId),
        SOURCE.scrapeChapterList(mangaId)
      ]);

      console.log(`👉 Chapters found: ${chapters.length}`);

      // 🔥 ACEPTAR manga aunque tenga pocos capítulos (para debug real)
      if (manga) {
        scrapedManga = manga;
        chapterList = chapters || [];
        break;
      }

    } catch (error) {
      console.warn(`[scraper] candidate failed: ${error.message}`);
    }
  }

  if (!scrapedManga) {
    throw new Error(`No valid manga data for: ${searchTitle}`);
  }

  if (!chapterList.length) {
    console.warn("⚠️ WARNING: No chapters found (posible problema de idioma o API)");
  }

  const sortedChapters = sortChaptersAscending(chapterList);

  console.log(`📚 Total chapters: ${sortedChapters.length}`);

  await matchManga(scrapedManga);

  const mangaRecord = await upsertManga(scrapedManga);
  const mangaId = mangaRecord.id;

  let progress = 0;

  if (resume) {
    progress = Number(await getScrapeProgress(mangaId)) || 0;
  } else {
    await clearScrapeProgress(mangaId);
  }

  console.log(`[scraper] starting at ${progress}/${sortedChapters.length}`);

  // ======================
  // 📦 BATCH SYSTEM
  // ======================
  while (progress < sortedChapters.length) {
    const batchEnd = Math.min(progress + BATCH_SIZE, sortedChapters.length);
    const batch = sortedChapters.slice(progress, batchEnd);

    console.log(`📦 Processing ${progress + 1} → ${batchEnd}`);

    await upsertChapters(mangaId, batch, {
      scrapeChapterPages: SOURCE.scrapeChapterPages
    });

    progress = batchEnd;
    await setScrapeProgress(mangaId, progress);

    if (progress < sortedChapters.length && BATCH_DELAY_MS > 0) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(`🎉 SCRAPE COMPLETED`);

  return {
    mangaId,
    source: 'mangadex',
    totalChapters: sortedChapters.length
  };
}

export default {
  scrapeAndSyncManga
};