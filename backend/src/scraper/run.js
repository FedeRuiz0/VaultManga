import * as mangadex from './sources/mangadex.js';
import { scrapeAndSyncManga } from './scraper.service.js';

const INTERVAL_MS = 1000 * 60 * 10; // cada 10 min

async function discoverNewManga() {
  console.log('🔍 Discovering new manga...');

  const latest = await mangadex.getLatestManga(20);

  for (const manga of latest) {
    try {
      console.log(`🆕 New manga: ${manga.title}`);
      await scrapeAndSyncManga(manga.title);
    } catch (e) {
      console.log(`⚠️ Failed: ${manga.title}`);
    }
  }
}

async function updateExistingManga() {
  console.log('🔄 Checking updates...');
  
  const updated = await mangadex.getRecentlyUpdatedManga(20);

  for (const manga of updated) {
    try {
      console.log(`🔄 Updating: ${manga.title}`);
      await scrapeAndSyncManga(manga.title, { resume: true });
    } catch (e) {
      console.log(`⚠️ Update failed: ${manga.title}`);
    }
  }
}

async function run() {
  while (true) {
    try {
      await discoverNewManga();
      await updateExistingManga();
    } catch (err) {
      console.error('💥 Loop error:', err.message);
    }

    console.log(`⏳ Waiting ${INTERVAL_MS / 1000}s...`);
    await new Promise(r => setTimeout(r, INTERVAL_MS));
  }
}

run();