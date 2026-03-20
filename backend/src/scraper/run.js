import * as mangadex from './sources/mangadex.js';
import { scrapeAndSyncManga } from './scraper.service.js';
import { mangaExistsBySource, getAllManga } from './sync.service.js';
import { initRedis } from '../db/redis.js';

const DISCOVERY_LIMIT = Number(process.env.SCRAPER_DISCOVERY_LIMIT || 20);
const UPDATE_BATCH_LIMIT = Number(process.env.SCRAPER_UPDATE_LIMIT || 200);
const INTERVAL_MINUTES = Number(process.env.SCRAPER_INTERVAL_MINUTES || 10);
const INTERVAL_MS = Math.max(1, INTERVAL_MINUTES) * 60 * 1000;
const REQUEST_DELAY_MS = Number(process.env.SCRAPER_REQUEST_DELAY_MS || 300);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function discoverNewManga() {
  console.log('🔍 Discovering new manga...');

  try {
    const latest = await mangadex.getLatestManga(DISCOVERY_LIMIT, 0);
    console.log(`[bot] discovery candidates=${latest.length}`);

    for (const manga of latest) {
      const sourcePath = `mangadex:${manga.id}`;

      try {
        const exists = await mangaExistsBySource(sourcePath);

        if (exists) {
          console.log(`[bot] skip existing ${sourcePath} (${manga.title})`);
          continue;
        }

        console.log(`[bot] scraping new manga: ${manga.title} (${sourcePath})`);
        await scrapeAndSyncManga(manga.title);
      } catch (error) {
        console.error(`[bot] discover failed for ${manga.title}: ${error.message}`);
      }

      if (REQUEST_DELAY_MS > 0) {
        await sleep(REQUEST_DELAY_MS);
      }
    }
  } catch (error) {
    console.error(`[bot] discoverNewManga error: ${error.message}`);
  }
}

async function updateExistingManga() {
  console.log('🔄 Checking existing manga for new chapters...');

  try {
    const allManga = await getAllManga();
    const targets = allManga.slice(0, UPDATE_BATCH_LIMIT);
    console.log(`[bot] update targets=${targets.length}`);

    for (const manga of targets) {
      try {
        console.log(`[bot] updating manga: ${manga.title} (${manga.source_path})`);
        await scrapeAndSyncManga(manga.title, { resume: true });
      } catch (error) {
        console.error(`[bot] update failed for ${manga.title}: ${error.message}`);
      }

      if (REQUEST_DELAY_MS > 0) {
        await sleep(REQUEST_DELAY_MS);
      }
    }
  } catch (error) {
    console.error(`[bot] updateExistingManga error: ${error.message}`);
  }
}

async function run() {
  console.log(`[bot] started interval=${INTERVAL_MINUTES}m (${INTERVAL_MS}ms)`);

  while (true) {
    const startedAt = Date.now();

    try {
      await initRedis();
      await discoverNewManga();
      await updateExistingManga();
    } catch (error) {
      console.error(`[bot] loop error: ${error.message}`);
    }

    const elapsed = Date.now() - startedAt;
    console.log(`[bot] cycle finished in ${elapsed}ms`);
    console.log(`[bot] sleeping ${INTERVAL_MS}ms`);

    await sleep(INTERVAL_MS);
  }
}

run().catch((error) => {
  console.error(`[bot] fatal error: ${error.message}`);
  process.exitCode = 1;
});