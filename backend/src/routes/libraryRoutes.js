import express from 'express';
import { query, queryOne, queryAll } from '../db/database.js';
import { mangaCache } from '../db/redis.js';

const router = express.Router();

// Get library overview (dashboard)
router.get('/overview', async (req, res, next) => {
  try {
    const overview = await queryOne(`
      SELECT 
        (SELECT COUNT(*) FROM manga) as total_manga,
        (SELECT COUNT(*) FROM manga WHERE is_favorite = true) as favorites,
        (SELECT COUNT(*) FROM manga WHERE is_incomplete = true) as incomplete,
        (SELECT COUNT(*) FROM chapters) as total_chapters,
        (SELECT COUNT(*) FROM chapters WHERE is_read = true) as read_chapters,
        (SELECT COUNT(*) FROM chapters WHERE is_read = false) as unread_chapters
    `);

    const recentlyRead = await queryAll(`
      SELECT DISTINCT ON (m.id)
        m.id,
        m.title,
        m.cover_image,
        rh.read_at as last_read_at,
        c.chapter_number,
        c.read_progress
      FROM reading_history rh
      JOIN manga m ON rh.manga_id = m.id
      JOIN chapters c ON rh.chapter_id = c.id
      ORDER BY m.id, rh.read_at DESC
      LIMIT 10
    `);

    const continueReading = await queryAll(`
      SELECT DISTINCT ON (c.id)
        m.id as manga_id,
        m.title,
        m.cover_image,
        c.id as chapter_id,
        c.chapter_number,
        c.read_progress,
        c.page_count
      FROM manga m
      JOIN chapters c ON m.id = c.manga_id
      WHERE c.is_read = false AND c.read_progress > 0
      ORDER BY c.id, c.last_read_at DESC
      LIMIT 5
    `);

    const recentAdditions = await queryAll(`
      SELECT * FROM manga
      ORDER BY created_at DESC
      LIMIT 10
    `);

    const favorites = await queryAll(`
      SELECT * FROM manga
      WHERE is_favorite = true
      ORDER BY updated_at DESC
      LIMIT 10
    `);

    res.json({
      stats: overview,
      recently_read: recentlyRead,
      continue_reading: continueReading,
      recent_additions: recentAdditions,
      favorites,
    });
  } catch (error) {
    next(error);
  }
});

// Get recently read manga with pagination
router.get('/recent-read', async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 24);
    const offset = (page - 1) * limit;

    const recentRead = await queryAll(
      `
      SELECT
        m.*,
        COUNT(c.id)::int AS total_chapters,
        COUNT(CASE WHEN c.is_read = true THEN 1 END)::int AS read_chapters
      FROM manga m
      LEFT JOIN chapters c ON c.manga_id = m.id
      WHERE m.last_read_at IS NOT NULL
      GROUP BY m.id
      ORDER BY m.last_read_at DESC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset]
    );

    const countResult = await queryOne(`
      SELECT COUNT(*)::int AS count
      FROM manga
      WHERE last_read_at IS NOT NULL
    `);

    const total = countResult?.count || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    res.json({
      data: recentRead,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get reading history
router.get('/history', async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 50);
    const offset = (page - 1) * limit;

    const history = await queryAll(
      `
      SELECT 
        rh.*,
        m.title as manga_title,
        m.cover_image,
        c.chapter_number
      FROM reading_history rh
      JOIN manga m ON rh.manga_id = m.id
      JOIN chapters c ON rh.chapter_id = c.id
      ORDER BY rh.read_at DESC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset]
    );

    const countResult = await queryOne(`
      SELECT COUNT(*) FROM reading_history
    `);

    res.json({
      data: history,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.count, 10),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get incomplete manga
router.get('/incomplete', async (req, res, next) => {
  try {
    const incomplete = await queryAll(`
      SELECT 
        m.id,
        m.title,
        m.cover_image,
        iml.issue_type,
        iml.chapter_number,
        iml.detected_at
      FROM incomplete_manga_log iml
      JOIN manga m ON iml.manga_id = m.id
      ORDER BY iml.detected_at DESC
    `);

    const grouped = {};
    for (const item of incomplete) {
      if (!grouped[item.id]) {
        grouped[item.id] = {
          id: item.id,
          title: item.title,
          cover_image: item.cover_image,
          issues: [],
        };
      }

      grouped[item.id].issues.push({
        chapter_number: item.chapter_number,
        issue_type: item.issue_type,
        detected_at: item.detected_at,
      });
    }

    res.json(Object.values(grouped));
  } catch (error) {
    next(error);
  }
});

// Mark chapter as reading (start reading session)
router.post('/start-reading', async (req, res, next) => {
  try {
    const { chapter_id, manga_id, page_number = 0 } = req.body;

    if (!chapter_id || !manga_id) {
      return res.status(400).json({
        error: 'Chapter ID and Manga ID are required',
      });
    }

    const session = await queryOne(
      `
      INSERT INTO reading_sessions (manga_id, chapter_id, start_page)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [manga_id, chapter_id, page_number]
    );

    await query(
      `
      UPDATE chapters SET
        last_read_at = CURRENT_TIMESTAMP,
        read_progress = GREATEST(read_progress, $2),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [chapter_id, page_number]
    );

    await query(
      `
      UPDATE manga SET
        last_read_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [manga_id]
    );

    await query(
      `
      INSERT INTO reading_history (manga_id, chapter_id, page_number)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, chapter_id, page_number) DO NOTHING
      `,
      [manga_id, chapter_id, page_number]
    );

    await mangaCache.invalidateManga(manga_id);
    await mangaCache.invalidateChapters(manga_id);

    res.json(session);
  } catch (error) {
    next(error);
  }
});

router.get('/recent-read', async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 24);
    const offset = (page - 1) * limit;

    const manga = await queryAll(`
      SELECT *
      FROM manga
      WHERE last_read_at IS NOT NULL
      ORDER BY last_read_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const count = await queryOne(`
      SELECT COUNT(*) FROM manga WHERE last_read_at IS NOT NULL
    `);

    res.json({
      data: manga,
      pagination: {
        page,
        limit,
        total: parseInt(count.count, 10),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Update reading progress while reading
router.post('/progress', async (req, res, next) => {
  try {
    const { manga_id, chapter_id, page_number = 0 } = req.body;

    if (!chapter_id || !manga_id) {
      return res.status(400).json({
        error: 'Chapter ID and Manga ID are required',
      });
    }

    await query(
      `
      UPDATE chapters SET
        read_progress = GREATEST(read_progress, $2),
        last_read_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [chapter_id, page_number]
    );

    await query(
      `
      UPDATE manga SET
        last_read_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [manga_id]
    );

    await mangaCache.invalidateManga(manga_id);
    await mangaCache.invalidateChapters(manga_id);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// End reading session
router.post('/end-reading', async (req, res, next) => {
  try {
    const { session_id, end_page = 0, duration_seconds = 0 } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const session = await queryOne(
      `
      UPDATE reading_sessions SET
        end_page = $2,
        duration_seconds = $3,
        ended_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
      `,
      [session_id, end_page, duration_seconds]
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.manga_id) {
      await query(
        `
        UPDATE manga SET
          last_read_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        `,
        [session.manga_id]
      );

      await mangaCache.invalidateManga(session.manga_id);
      await mangaCache.invalidateChapters(session.manga_id);
    }

    res.json(session);
  } catch (error) {
    next(error);
  }
});

// Add bookmark
router.post('/bookmarks', async (req, res, next) => {
  try {
    const { manga_id, chapter_id, page_number, note } = req.body;

    if (!manga_id) {
      return res.status(400).json({ error: 'Manga ID is required' });
    }

    const bookmark = await queryOne(
      `
      INSERT INTO bookmarks (manga_id, chapter_id, page_number, note)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [manga_id, chapter_id, page_number, note]
    );

    res.status(201).json(bookmark);
  } catch (error) {
    next(error);
  }
});

// Get bookmarks
router.get('/bookmarks', async (req, res, next) => {
  try {
    const { manga_id } = req.query;

    let queryText = `
      SELECT 
        b.*,
        m.title as manga_title,
        c.chapter_number
      FROM bookmarks b
      JOIN manga m ON b.manga_id = m.id
      LEFT JOIN chapters c ON b.chapter_id = c.id
    `;

    const params = [];

    if (manga_id) {
      queryText += ' WHERE b.manga_id = $1';
      params.push(manga_id);
    }

    queryText += ' ORDER BY b.created_at DESC';

    const bookmarks = await queryAll(queryText, params);
    res.json(bookmarks);
  } catch (error) {
    next(error);
  }
});

// Delete bookmark
router.delete('/bookmarks/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    await query('DELETE FROM bookmarks WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;