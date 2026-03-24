import runGenreSeedBot from './bots/genreSeedBot.js';

const genre = process.argv[2];

if (!genre) {
  console.error('Usage: node src/scripts/runGenreSeedBot.js <genre>');
  process.exit(1);
}

runGenreSeedBot(genre, {
  limit: Number(process.env.SEED_GENRE_LIMIT || 25),
  importChapters: process.env.SEED_IMPORT_CHAPTERS !== 'false',
  delayMs: Number(process.env.SEED_REQUEST_DELAY_MS || 400),
})
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });