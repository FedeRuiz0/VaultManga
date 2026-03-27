import runLibrarySeedBot from '../bots/librarySeedBot.js';
import { initDatabase } from '../db/database.js';
import { initRedis } from '../db/redis.js';

const limit = Number(process.argv[2]) || 30;

async function main() {
  try {
    console.log('🔌 Connecting to database...');
    await initDatabase();
    console.log('✅ Database connected');

    console.log('🔌 Connecting to Redis...');
    await initRedis();
    console.log('✅ Redis connected');

    console.log(`🚀 Running manual POPULAR seed bot (limit=${limit})`);

    const result = await runLibrarySeedBot({
      limit,
      importChapters: true,
      delayMs: 400,
    });

    console.log('✅ Done:', result);
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed:', err);
    process.exit(1);
  }
}

main();