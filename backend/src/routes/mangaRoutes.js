import express from 'express';
import { query, queryOne, queryAll } from '../db/database.js';
import { mangaCache } from '../db/redis.js';
import { scanMangaFolder } from '../services/mangaScanner.js';
import mangadexService from '../services/mangadex.service.js';

const router = express.Router();

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }
  return fallback;
}

async function upsertMangaFromMangadex(mangadexId) {
  if (!mangadexId) {
    throw new Error('mangadexId is required');
  }

  const mangaData = await mangadexService.getMangaById(mangadexId);
  if (!mangaData) {
    throw new Error(`MangaDex returned no data for manga ${mangadexId}`);
  }

  const sourcePath = `mangadex://${mangadexId}`;

  const existing = await queryOne(
    'SELECT * FROM manga WHERE source_path = $1 LIMIT 1',
    [sourcePath]
  );

  let manga;

  if (existing) {
    manga = await queryOne(
      `
      UPDATE manga
      SET
        title = $2,
        description = $3,
        cover_image = $4,
        status = COALESCE($5, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
      `,
      [
        existing.id,
        mangaData.title,
        mangaData.description,
        mangaData.cover,
        mangaData.status || 'ongoing',
      ]
    );
  } else {
    manga = await queryOne(
      `
      INSERT INTO manga (
        title, description, cover_image, source_path, status
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        mangaData.title,
        mangaData.description,
        mangaData.cover,
        sourcePath,
        mangaData.status || 'ongoing',
      ]
    );
  }

  await mangaCache.invalidateManga(manga.id);

  return manga;
}

// Get manga genres
router.get('/meta/genres', async (req, res, next) => {
  try {
    const genres = await queryAll(`
      SELECT DISTINCT genre
      FROM manga, UNNEST(genre) AS genre
      WHERE genre IS NOT NULL AND genre != ''
      ORDER BY genre
    `);

    res.json(genres.map((g) => g.genre));
  } catch (error) {
    next(error);
  }
});

// Get all manga with pagination and filters
router.get('/', async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const offset = (page - 1) * limit;

    const search = req.query.search?.trim() || '';
    const title = req.query.title?.trim();
    const status = req.query.status?.trim();
    const genre = req.query.genre?.trim();
    const year = req.query.year ? Number(req.query.year) : null;
    const sort = req.query.sort || 'last_read_at';
    const order = String(req.query.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const favorites = toBoolean(req.query.favorites, false);
    const incomplete = toBoolean(req.query.incomplete, false);

    if (title) {
      const searchResults = await mangadexService.searchMangaByTitle(
        title,
        Number(limit) || 20
      );
      return res.json({ data: searchResults, pagination: null });
    }

    const cacheKey = {
      page,
      limit,
      search,
      status,
      genre,
      year,
      sort,
      order,
      favorites,
      incomplete,
    };

    const cached = await mangaCache.getMangaList(page, limit, cacheKey);
    if (cached) {
      return res.json(cached);
    }

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (search) {
      whereClause += ` AND (
        m.title ILIKE $${paramIndex}
        OR m.description ILIKE $${paramIndex}
        OR m.author ILIKE $${paramIndex}
        OR m.artist ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex += 1;
    }

    if (status) {
      whereClause += ` AND m.status = $${paramIndex}`;
      params.push(status);
      paramIndex += 1;
    }

    if (favorites) {
      whereClause += ' AND m.is_favorite = true';
    }

    if (incomplete) {
      whereClause += ' AND m.is_incomplete = true';
    }

    if (genre) {
  whereClause += ` AND m.genre::jsonb ? $${paramIndex}`;
  params.push(genre);
  paramIndex += 1;
}

    if (year) {
      whereClause += ` AND m.year = $${paramIndex}`;
      params.push(year);
      paramIndex += 1;
    }

    const allowedSortColumns = ['title', 'created_at', 'updated_at', 'last_read_at', 'year'];
    const safeSort = allowedSortColumns.includes(sort) ? sort : 'last_read_at';

    const orderClauses = {
      title: `m.title ${order}, m.id ASC`,
      created_at: `m.created_at ${order}, m.id ASC`,
      updated_at: `m.updated_at ${order}, m.id ASC`,
      last_read_at: `m.last_read_at ${order} NULLS LAST, m.id ASC`,
      year: `m.year ${order} NULLS LAST, m.id ASC`,
    };

    const orderClause = orderClauses[safeSort] || `m.last_read_at ${order} NULLS LAST, m.id ASC`;

    const countResult = await queryOne(
      `
      SELECT COUNT(*)::int AS total
      FROM manga m
      ${whereClause}
      `,
      params
    );

    const total = countResult?.total || 0;

    params.push(limit, offset);

    const manga = await queryAll(
      `
      SELECT
        m.*,
        COALESCE(c.total_chapters, 0)::int AS total_chapters,
        COALESCE(c.read_chapters, 0)::int AS read_chapters,
        ROUND(
          CASE
            WHEN COALESCE(c.total_chapters, 0) > 0
            THEN (COALESCE(c.read_chapters, 0)::numeric / c.total_chapters * 100)
            ELSE 0
          END,
          1
        ) AS progress_percentage
      FROM manga m
      LEFT JOIN (
        SELECT
          manga_id,
          COUNT(*) AS total_chapters,
          COUNT(*) FILTER (WHERE is_read) AS read_chapters
        FROM chapters
        GROUP BY manga_id
      ) c ON m.id = c.manga_id
      ${whereClause}
      ORDER BY ${orderClause}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `,
      params
    );

    const result = {
      data: manga,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };

    await mangaCache.setMangaList(page, limit, cacheKey, result);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Search MangaDex, optionally persist one selected result locally
router.get('/search', async (req, res, next) => {
  try {
    const { q, limit = 20, persist = 'false', mangadexId } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const results = await mangadexService.searchMangaByTitle(q, Number(limit));
    let imported = null;

    if (toBoolean(persist) && mangadexId) {
      imported = await upsertMangaFromMangadex(mangadexId);
    }

    res.json({
      data: results,
      imported,
    });
  } catch (err) {
    next(err);
  }
});

// Get single manga by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const cached = await mangaCache.getManga(id);
    if (cached) {
      return res.json(cached);
    }

    const manga = await queryOne(
      `
      SELECT
        m.*,
        COALESCE(c.total_chapters, 0)::int AS total_chapters,
        COALESCE(c.read_chapters, 0)::int AS read_chapters,
        ROUND(
          CASE
            WHEN COALESCE(c.total_chapters, 0) > 0
            THEN (COALESCE(c.read_chapters, 0)::numeric / c.total_chapters * 100)
            ELSE 0
          END, 1
        ) AS progress_percentage
      FROM manga m
      LEFT JOIN (
        SELECT
          manga_id,
          COUNT(*) AS total_chapters,
          COUNT(*) FILTER (WHERE is_read) AS read_chapters
        FROM chapters
        WHERE manga_id = $1
        GROUP BY manga_id
      ) c ON m.id = c.manga_id
      WHERE m.id = $1
      `,
      [id]
    );

    if (!manga) {
      return res.status(404).json({ error: 'Manga not found' });
    }

    await mangaCache.setManga(id, manga);
    res.json(manga);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/languages', async (req, res, next) => {
  try {
    const { id } = req.params;

    const languages = await queryAll(
      `
      SELECT LOWER(language) AS language, COUNT(*)::int AS chapters
      FROM chapters
      WHERE manga_id = $1
      GROUP BY LOWER(language)
      ORDER BY chapters DESC, language ASC
      `,
      [id]
    );

    res.json(languages);
  } catch (error) {
    next(error);
  }
});

// Create new manga entry
router.post('/', async (req, res, next) => {
  try {
    const {
      title,
      alt_titles = [],
      description,
      source_path,
      genre = [],
      author,
      artist,
      status = 'ongoing',
      year,
      cover_image,
    } = req.body;

    if (!title || !source_path) {
      return res.status(400).json({ error: 'Title and source path are required' });
    }

    const manga = await queryOne(
      `
      INSERT INTO manga (
        title, alt_titles, description, source_path, genre,
        author, artist, status, year, cover_image
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
      `,
      [title, alt_titles, description, source_path, genre, author, artist, status, year, cover_image]
    );

    scanMangaFolder(source_path).catch((err) =>
      console.error(`Failed to scan manga folder: ${source_path}`, err)
    );

    res.status(201).json(manga);
  } catch (error) {
    next(error);
  }
});

// Update manga
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      title,
      alt_titles,
      description,
      genre,
      author,
      artist,
      status,
      year,
      cover_image,
      is_favorite,
      is_incomplete,
    } = req.body;

    const manga = await queryOne(
      `
      UPDATE manga SET
        title = COALESCE($2, title),
        alt_titles = COALESCE($3, alt_titles),
        description = COALESCE($4, description),
        genre = COALESCE($5, genre),
        author = COALESCE($6, author),
        artist = COALESCE($7, artist),
        status = COALESCE($8, status),
        year = COALESCE($9, year),
        cover_image = COALESCE($10, cover_image),
        is_favorite = COALESCE($11, is_favorite),
        is_incomplete = COALESCE($12, is_incomplete),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
      `,
      [id, title, alt_titles, description, genre, author, artist, status, year, cover_image, is_favorite, is_incomplete]
    );

    if (!manga) {
      return res.status(404).json({ error: 'Manga not found' });
    }

    await mangaCache.invalidateManga(id);
    res.json(manga);
  } catch (error) {
    next(error);
  }
});

router.post('/import', async (req, res, next) => {
  try {
    const { mangadexId } = req.body;

    if (!mangadexId) {
      return res.status(400).json({ error: 'mangadexId is required' });
    }

    const manga = await upsertMangaFromMangadex(mangadexId);
    res.json(manga);
  } catch (err) {
    next(err);
  }
});

// Toggle favorite
router.patch('/:id/favorite', async (req, res, next) => {
  try {
    const { id } = req.params;

    const manga = await queryOne(
      `
      UPDATE manga SET
        is_favorite = NOT is_favorite,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (!manga) {
      return res.status(404).json({ error: 'Manga not found' });
    }

    await mangaCache.invalidateManga(id);
    res.json(manga);
  } catch (error) {
    next(error);
  }
});

// Delete manga
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      `
      DELETE FROM manga WHERE id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Manga not found' });
    }

    await mangaCache.invalidateManga(id);
    res.json({ success: true, message: 'Manga deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;