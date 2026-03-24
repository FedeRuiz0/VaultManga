import { query, queryOne } from '../db/database.js';
import { mangaCache } from '../db/redis.js';
import mangadexScraper from './mangadexScraper.js';

async function upsertManga(details) {
  const sourcePath = `mangadex://${details.id}`;

  const existing = await queryOne(
    'SELECT id FROM manga WHERE source_path = $1 LIMIT 1',
    [sourcePath]
  );

  let mangaId;

  if (existing) {
    const updated = await queryOne(
      `
      UPDATE manga
      SET
        title = $2,
        description = $3,
        cover_image = $4,
        genre = $5,
        status = $6,
        year = $7,
        author = $8,
        artist = $9,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id
      `,
      [
        existing.id,
        details.title,
        details.description,
        details.cover_image,
        JSON.stringify(details.genre || []),
        details.status || 'ongoing',
        details.year || null,
        details.author || null,
        details.artist || null,
      ]
    );

    mangaId = updated.id;
  } else {
    const inserted = await queryOne(
      `
      INSERT INTO manga (
        title, description, cover_image, genre, status, year, author, artist, source_path
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
      `,
      [
        details.title,
        details.description,
        details.cover_image,
        JSON.stringify(details.genre || []),
        details.status || 'ongoing',
        details.year || null,
        details.author || null,
        details.artist || null,
        sourcePath,
      ]
    );

    mangaId = inserted.id;
  }

  await mangaCache.invalidateManga(mangaId);
  return mangaId;
}

async function importChaptersIfNeeded(localMangaId, mangadexId, enabled = true) {
  if (!enabled) return 0;

  const count = await queryOne(
    'SELECT COUNT(*)::int AS count FROM chapters WHERE manga_id = $1',
    [localMangaId]
  );

  if (count?.count > 0) return 0;

  return mangadexScraper.importChapters(localMangaId, mangadexId);
}

export async function seedPopularManga({ limit = 20, importChapters = true } = {}) {
  const items = await mangadexScraper.getPopularManga(limit);
  const results = [];

  for (const item of items) {
    const details = await mangadexScraper.getMangaDetails(item.id);
    if (!details) continue;

    const localMangaId = await upsertManga(details);
    const importedChapters = await importChaptersIfNeeded(localMangaId, details.id, importChapters);

    results.push({
      localMangaId,
      mangadexId: details.id,
      title: details.title,
      importedChapters,
    });
  }

  return results;
}

export async function seedMangaByGenre({ genre, limit = 20, importChapters = true } = {}) {
  if (!genre) {
    throw new Error('genre is required');
  }

  const items = await mangadexScraper.searchManga(genre, limit);
  const results = [];

  for (const item of items) {
    const details = await mangadexScraper.getMangaDetails(item.id);
    if (!details) continue;

    const genres = (details.genre || []).map((g) => String(g).toLowerCase());
    if (!genres.some((g) => g.includes(String(genre).toLowerCase()))) {
      continue;
    }

    const localMangaId = await upsertManga(details);
    const importedChapters = await importChaptersIfNeeded(localMangaId, details.id, importChapters);

    results.push({
      localMangaId,
      mangadexId: details.id,
      title: details.title,
      importedChapters,
    });
  }

  return results;
}