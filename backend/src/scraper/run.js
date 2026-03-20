import { initRedis } from '../db/redis.js';
import { scrapeAndSyncManga } from './scraper.service.js';

async function run() {
  console.log('🚀 Initializing Redis...');
  await initRedis(); 

  console.log('🚀 Running scraper...');
  await scrapeAndSyncManga('Sousou no Frieren');
}

run().catch(console.error);