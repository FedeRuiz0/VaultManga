import express from 'express';
import { query, queryOne, queryAll } from '../db/database.js';
import { mangaCache } from '../db/redis.js';
import { scanMangaFolder } from '../services/mangaScanner.js';
import mangadexService from '../services/mangadex.service.js';

const router = express.Router();

// Get all manga with pagination and filters
router.get('/', async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search = '',
      title,
      status,
      genre,
      sort = 'last_read_at',
      order = 'DESC',
      favorites = false,
      incomplete = false
    } = req.query;

    const offset = (page - 1) * limit;

    if (title) {
      const searchResults = await mangadexService.searchMangaByTitle(title, Number(limit) || 20);
      return res.json({ data: searchResults, pagination: null });
    }
    
    // Try cache first
    const cacheKey = { page, limit, search, status, genre, sort, order, favorites, incomplete };
    const cached = await mangaCache.getMangaList(page, limit, cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Build query
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (search) {
      whereClause += ` AND (m.title ILIKE $${paramIndex} OR m.alt_titles && ARRAY[$${paramIndex}])`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (status) {
      whereClause += ` AND m.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (favorites === 'true') {
      whereClause += ' AND m.is_favorite = true';
    }

    if (incomplete === 'true') {
      whereClause += ' AND m.is_incomplete = true';
    }

    if (genre) {
      whereClause += ` AND $${paramIndex} = ANY(m.genre)`;
      params.push(genre);
      paramIndex++;
    }

    // Validate sort column
    const allowedSortColumns = ['title', 'created_at', 'updated_at', 'last_read_at', 'year'];
    const sortColumn = allowedSortColumns.includes(sort) ? `m.${sort}` : 'm.last_read_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM manga m ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get manga with progress
    params.push(limit, offset);
    const manga = await queryAll(`
      SELECT 
        m.*,
        COALESCE(c.total_chapters, 0) as total_chapters,
        COALESCE(c.read_chapters, 0) as read_chapters,
        ROUND(
          CASE 
            WHEN c.total_chapters > 0 
            THEN (c.read_chapters::numeric / c.total_chapters * 100)
            ELSE 0 
          END, 1
        ) as progress_percentage
      FROM manga m
      LEFT JOIN (
        SELECT 
          manga_id,
          COUNT(*) as total_chapters,
          COUNT(*) FILTER (WHERE is_read) as read_chapters
        FROM chapters
        GROUP BY manga_id
      ) c ON m.id = c.manga_id
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, params);

    const result = {
      data: manga,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };

    console.log('[GET /api/v1/manga] rows returned:', manga.length);
    console.log('[GET /api/v1/manga] response payload:', result);
    res.json(result);

    // Cache the result
    await mangaCache.setMangaList(page, limit, cacheKey, result);
  } catch (error) {
    next(error);
  }
});

router.get('/search', async (req, res, next) => {
  try {
    const { q, limit = 20 } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const results = await mangadexService.searchMangaByTitle(q, Number(limit));
    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});

// Get single manga by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Try cache first
    const cached = await mangaCache.getManga(id);
    if (cached) {
      return res.json(cached);
    }

    const manga = await queryOne(`
      SELECT 
        m.*,
        COALESCE(c.total_chapters, 0) as total_chapters,
        COALESCE(c.read_chapters, 0) as read_chapters,
        ROUND(
          CASE 
            WHEN c.total_chapters > 0 
            THEN (c.read_chapters::numeric / c.total_chapters * 100)
            ELSE 0 
          END, 1
        ) as progress_percentage FROM manga m

      LEFT JOIN (
        SELECT 
          manga_id,
          COUNT(*) as total_chapters,
          COUNT(*) FILTER (WHERE is_read) as read_chapters
        FROM chapters
        WHERE manga_id = $1
        GROUP BY manga_id
      ) c ON m.id = c.manga_id
      WHERE m.id = $1
    `, [id]);

    if (!manga) {
      return res.status(404).json({ error: 'Manga not found' });
    }

    // Cache and return
    await mangaCache.setManga(id, manga);
    res.json(manga);
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
      cover_image
    } = req.body;

    if (!title || !source_path) {
      return res.status(400).json({ error: 'Title and source path are required' });
    }

    const manga = await queryOne(`
      INSERT INTO manga (
        title, alt_titles, description, source_path, genre,
        author, artist, status, year, cover_image
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [title, alt_titles, description, source_path, genre, author, artist, status, year, cover_image]);

    // Scan the folder for chapters
    scanMangaFolder(source_path).catch(err => 
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
      is_incomplete
    } = req.body;

    const manga = await queryOne(`
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
    `, [id, title, alt_titles, description, genre, author, artist, status, year, cover_image, is_favorite, is_incomplete]);

    if (!manga) {
      return res.status(404).json({ error: 'Manga not found' });
    }

    // Invalidate cache
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

    // 1. Traer data desde MangaDex
    const mangaData = await mangadexService.getMangaById(mangadexId);

    // 2. Insertar en DB
    const manga = await queryOne(`
      INSERT INTO manga (
        title, description, cover_image, source_path, status
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (source_path) DO UPDATE
      SET title = EXCLUDED.title
      RETURNING *
    `, [
      mangaData.title,
      mangaData.description,
      mangaData.cover,
      `mangadex://${mangadexId}`,
      mangaData.status || 'ongoing'
    ]);

    res.json(manga);
  } catch (err) {
    next(err);
  }
});

// Toggle favorite
router.patch('/:id/favorite', async (req, res, next) => {
  try {
    const { id } = req.params;

    const manga = await queryOne(`
      UPDATE manga SET
        is_favorite = NOT is_favorite,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);

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

    const result = await query(`
      DELETE FROM manga WHERE id = $1
    `, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Manga not found' });
    }

    await mangaCache.invalidateManga(id);

    res.json({ success: true, message: 'Manga deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Get manga genres
router.get('/meta/genres', async (req, res, next) => {
  try {
    const genres = await queryAll(`
      SELECT DISTINCT genre FROM manga, UNNEST(genre) as genre
      WHERE genre IS NOT NULL AND genre != ''
      ORDER BY genre
    `);
    
    res.json(genres.map(g => g.genre));
  } catch (error) {
    next(error);
  }
});

// Get single manga by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Try cache first
    const cached = await mangaCache.getManga(id);
    if (cached) {
      return res.json(cached);
    }

    const manga = await queryOne(`
      SELECT 
        m.*,
        COALESCE(c.total_chapters, 0) as total_chapters,
        COALESCE(c.read_chapters, 0) as read_chapters,
        ROUND(
          CASE 
            WHEN c.total_chapters > 0 
            THEN (c.read_chapters::numeric / c.total_chapters * 100)
            ELSE 0 
          END, 1
        ) as progress_percentage FROM manga m

      LEFT JOIN (
        SELECT 
          manga_id,
          COUNT(*) as total_chapters,
          COUNT(*) FILTER (WHERE is_read) as read_chapters
        FROM chapters
        WHERE manga_id = $1
        GROUP BY manga_id
      ) c ON m.id = c.manga_id
      WHERE m.id = $1
    `, [id]);

    if (!manga) {
      return res.status(404).json({ error: 'Manga not found' });
    }

    // Cache and return
    await mangaCache.setManga(id, manga);
    res.json(manga);
  } catch (error) {
    next(error);
  }
});

export default router;