import { query, queryOne } from '../db/database.js';
import { mangaCache } from '../db/redis.js';
import mangadexScraper from '../services/mangadexScraper.js';

const DEFAULT_LIMIT = Number(process.env.SEED_GENRE_LIMIT || 25);
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

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

function genreMatchesTarget(mangaGenres, targetGenre) {
  const target = normalizeText(targetGenre);
  const aliases = new Set([
    target,
    target.replace(/-/g, ' '),
    target.replace(/\s+/g, '-'),
  ]);

  if (target === 'terror') {
    aliases.add('horror');
  }
  if (target === 'horror') {
    aliases.add('terror');
  }
  if (target === 'accion') {
    aliases.add('action');
  }
  if (target === 'action') {
    aliases.add('accion');
  }
  if (target === 'romance') {
    aliases.add('romance');
  }
  if (target === 'comedia') {
    aliases.add('comedy');
  }
  if (target === 'comedy') {
    aliases.add('comedia');
  }

  return (mangaGenres || []).some((genre) => {
    const normalized = normalizeText(genre);
    return [...aliases].some(
      (alias) =>
        normalized === alias ||
        normalized.includes(alias) ||
        alias.includes(normalized)
    );
  });
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
    console.warn('[genre-seed-bot] cache invalidation warning:', error.message);
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

async function seedSingleGenreManga(remoteItem, genre, { importChapters = DEFAULT_IMPORT_CHAPTERS } = {}) {
  const details = await mangadexScraper.getMangaDetails(remoteItem.id);

  if (!details) {
    return {
      ok: false,
      mangadexId: remoteItem.id,
      title: remoteItem?.title || 'Unknown title',
      reason: 'details_not_found',
    };
  }

  if (!genreMatchesTarget(details.genre, genre)) {
    return {
      ok: false,
      mangadexId: details.id,
      title: details.title,
      reason: 'genre_mismatch',
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
    genres: details.genre || [],
  };
}

export async function runGenreSeedBot(genre, options = {}) {
  if (!genre || !String(genre).trim()) {
    throw new Error('genre is required');
  }

  const {
    limit = DEFAULT_LIMIT,
    importChapters = DEFAULT_IMPORT_CHAPTERS,
    delayMs = DEFAULT_DELAY_MS,
  } = options;

  console.log(
    `[genre-seed-bot] starting genre="${genre}" limit=${limit} importChapters=${importChapters} delayMs=${delayMs}`
  );

  const candidates = await mangadexScraper.searchManga(genre, limit * 3);
  const results = [];

  for (const item of candidates) {
    if (results.filter((r) => r.ok).length >= limit) {
      break;
    }

    try {
      const result = await seedSingleGenreManga(item, genre, { importChapters });

      if (result.ok) {
        results.push(result);
        console.log(
          `[genre-seed-bot] seeded "${result.title}" genre="${genre}" local=${result.localMangaId} created=${result.created} chapters=${result.importedChapters}`
        );
      } else if (result.reason !== 'genre_mismatch') {
        results.push(result);
        console.warn(
          `[genre-seed-bot] skipped mangadex=${result.mangadexId} reason=${result.reason}`
        );
      }
    } catch (error) {
      console.error(
        `[genre-seed-bot] failed genre="${genre}" mangadex=${item?.id || 'unknown'}: ${error.message}`
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
    genre,
    attempted: results.length,
    seeded: results.filter((r) => r.ok).length,
    created: results.filter((r) => r.ok && r.created).length,
    updated: results.filter((r) => r.ok && !r.created).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };

  console.log(
    `[genre-seed-bot] finished genre="${genre}" attempted=${summary.attempted} seeded=${summary.seeded} created=${summary.created} updated=${summary.updated} failed=${summary.failed}`
  );

  return summary;
}

export default runGenreSeedBot;