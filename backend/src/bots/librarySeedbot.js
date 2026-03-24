import { query, queryOne } from '../db/database.js';
import { mangaCache } from '../db/redis.js';
import mangadexScraper from '../services/mangadexScraper.js';

const DEFAULT_LIMIT = Number(process.env.SEED_POPULAR_LIMIT || 30);
const DEFAULT_IMPORT_CHAPTERS = process.env.SEED_IMPORT_CHAPTERS !== 'false';
const DEFAULT_DELAY_MS = Number(process.env.SEED_REQUEST_DELAY_MS || 400);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeGenreForDb(genre) {
  if (Array.isArray(genre)) {
    return JSON.stringify(genre);
  }
  return JSON.stringify([]);
}

async function invalidateLibraryCaches(mangaId) {
  try {
    if (mangaId) {
      await mangaCache.invalidateManga(mangaId);
      await mangaCache.invalidateChapters(mangaId);
    }

    if (typeof mangaCache.cacheDeletePattern === 'function') {
      await mangaCache.cacheDeletePattern('manga:list:*');
    }
  } catch (error) {
    console.warn('[library-seed-bot] cache invalidation warning:', error.message);
  }
}

async function upsertManga(details) {
  const sourcePath = `mangadex://${details.id}`;

  const existing = await queryOne(
    'SELECT id, source_path FROM manga WHERE source_path = $1 LIMIT 1',
    [sourcePath]
  );

  if (existing) {
    const updated = await queryOne(
      `
      UPDATE manga
      SET
        title = $2,
        description = $3,
        cover_image = $4,
        genre = $5,
        status = COALESCE($6, status),
        year = COALESCE($7, year),
        author = COALESCE($8, author),
        artist = COALESCE($9, artist),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
      `,
      [
        existing.id,
        details.title,
        details.description || '',
        details.cover_image || null,
        normalizeGenreForDb(details.genre),
        details.status || 'ongoing',
        details.year || null,
        details.author || null,
        details.artist || null,
      ]
    );

    await invalidateLibraryCaches(updated.id);

    return {
      manga: updated,
      created: false,
      sourcePath,
    };
  }

  const inserted = await queryOne(
    `
    INSERT INTO manga (
      title,
      description,
      cover_image,
      genre,
      status,
      year,
      author,
      artist,
      source_path
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
    `,
    [
      details.title,
      details.description || '',
      details.cover_image || null,
      normalizeGenreForDb(details.genre),
      details.status || 'ongoing',
      details.year || null,
      details.author || null,
      details.artist || null,
      sourcePath,
    ]
  );

  await invalidateLibraryCaches(inserted.id);

  return {
    manga: inserted,
    created: true,
    sourcePath,
  };
}

async function getChapterCount(localMangaId) {
  const row = await queryOne(
    'SELECT COUNT(*)::int AS count FROM chapters WHERE manga_id = $1',
    [localMangaId]
  );

  return row?.count || 0;
}

async function ensureChapters(localMangaId, mangadexId, enabled) {
  if (!enabled) return 0;

  const existingCount = await getChapterCount(localMangaId);
  if (existingCount > 0) {
    return 0;
  }

  const importedCount = await mangadexScraper.importChapters(localMangaId, mangadexId);
  await invalidateLibraryCaches(localMangaId);
  return importedCount;
}

async function seedSingleManga(remoteItem, { importChapters = DEFAULT_IMPORT_CHAPTERS } = {}) {
  const details = await mangadexScraper.getMangaDetails(remoteItem.id);

  if (!details) {
    return {
      ok: false,
      mangadexId: remoteItem.id,
      title: remoteItem?.title || 'Unknown title',
      reason: 'details_not_found',
    };
  }

  const { manga, created } = await upsertManga(details);
  const importedChapters = await ensureChapters(manga.id, details.id, importChapters);

  return {
    ok: true,
    localMangaId: manga.id,
    mangadexId: details.id,
    title: details.title,
    created,
    importedChapters,
  };
}

export async function runLibrarySeedBot(options = {}) {
  const {
    limit = DEFAULT_LIMIT,
    importChapters = DEFAULT_IMPORT_CHAPTERS,
    delayMs = DEFAULT_DELAY_MS,
  } = options;

  console.log(
    `[library-seed-bot] starting limit=${limit} importChapters=${importChapters} delayMs=${delayMs}`
  );

  const candidates = await mangadexScraper.getPopularManga(limit);
  const results = [];

  for (const item of candidates) {
    try {
      const result = await seedSingleManga(item, { importChapters });
      results.push(result);

      if (result.ok) {
        console.log(
          `[library-seed-bot] seeded "${result.title}" local=${result.localMangaId} created=${result.created} chapters=${result.importedChapters}`
        );
      } else {
        console.warn(
          `[library-seed-bot] skipped mangadex=${result.mangadexId} reason=${result.reason}`
        );
      }
    } catch (error) {
      console.error(
        `[library-seed-bot] failed mangadex=${item?.id || 'unknown'}: ${error.message}`
      );

      results.push({
        ok: false,
        mangadexId: item?.id || null,
        title: item?.title || 'Unknown title',
        reason: error.message,
      });
    }

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const summary = {
    attempted: results.length,
    seeded: results.filter((r) => r.ok).length,
    created: results.filter((r) => r.ok && r.created).length,
    updated: results.filter((r) => r.ok && !r.created).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };

  console.log(
    `[library-seed-bot] finished attempted=${summary.attempted} seeded=${summary.seeded} created=${summary.created} updated=${summary.updated} failed=${summary.failed}`
  );

  return summary;
}

export default runLibrarySeedBot;