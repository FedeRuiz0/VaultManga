import express from 'express';
import { query, queryAll, queryOne } from '../db/database.js';
import { mangaCache } from '../db/redis.js';
import { authenticateToken } from './authRoutes.js';
import {
  emitLibraryUpdated,
  emitReadingUpdated,
  emitRecommendationsUpdated,
} from '../realtime/socket.js';

const router = express.Router();
router.use(authenticateToken);

function normalizePageNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

async function getUserChapterProgress(userId, chapterId) {
  return queryOne(
    `
    SELECT
      c.id,
      c.manga_id,
      c.page_count,
      COALESCE(MAX(rh.page_number), 0)::int AS read_progress,
      CASE
        WHEN COALESCE(c.page_count, 0) > 0 THEN COALESCE(MAX(rh.page_number), 0) >= c.page_count
        ELSE FALSE
      END AS is_read
    FROM chapters c
    LEFT JOIN reading_history rh
      ON rh.chapter_id = c.id
      AND rh.user_id = $1
    WHERE c.id = $2
    GROUP BY c.id, c.manga_id, c.page_count
    `,
    [userId, chapterId]
  );
}

router.get('/overview', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const overview = await queryOne(
      `
      WITH progress AS (
        SELECT chapter_id, MAX(page_number)::int AS max_page
        FROM reading_history
        WHERE user_id = $1
        GROUP BY chapter_id
      )
      SELECT
        (SELECT COUNT(*)::int FROM manga) as total_manga,
        (
          SELECT COUNT(*)::int
          FROM user_favorites
          WHERE user_id = $1
        ) as favorites,
        (SELECT COUNT(*)::int FROM manga WHERE is_incomplete = true) as incomplete,
        (SELECT COUNT(*)::int FROM chapters) as total_chapters,
        (
          SELECT COUNT(*)::int
          FROM chapters c
          LEFT JOIN progress p ON p.chapter_id = c.id
          WHERE COALESCE(c.page_count, 0) > 0
            AND COALESCE(p.max_page, 0) >= c.page_count
        ) as read_chapters,
        (
          SELECT COUNT(*)::int
          FROM chapters c
          LEFT JOIN progress p ON p.chapter_id = c.id
          WHERE COALESCE(c.page_count, 0) <= 0
            OR COALESCE(p.max_page, 0) < c.page_count
        ) as unread_chapters
      `,
      [userId]
    );

    const recentlyRead = await queryAll(
      `
      SELECT DISTINCT ON (m.id)
        m.id,
        m.title,
        m.cover_image,
        rh.read_at AS last_read_at,
        c.id AS chapter_id,
        c.chapter_number,
        COALESCE(progress.max_page, 0)::int AS read_progress
      FROM reading_history rh
      JOIN manga m ON m.id = rh.manga_id
      JOIN chapters c ON c.id = rh.chapter_id
      LEFT JOIN (
        SELECT chapter_id, MAX(page_number)::int AS max_page
        FROM reading_history
        WHERE user_id = $1
        GROUP BY chapter_id
      ) progress ON progress.chapter_id = c.id
      WHERE rh.user_id = $1
      ORDER BY m.id, rh.read_at DESC, c.chapter_number::numeric DESC
      LIMIT 10
      `,
      [userId]
    );

    const continueReading = await queryAll(
      `
      WITH chapter_progress AS (
        SELECT
          c.id AS chapter_id,
          c.manga_id,
          c.chapter_number,
          c.page_count,
          MAX(rh.page_number)::int AS read_progress,
          MAX(rh.read_at) AS last_read_at
        FROM chapters c
        JOIN reading_history rh ON rh.chapter_id = c.id
        WHERE rh.user_id = $1
        GROUP BY c.id, c.manga_id, c.chapter_number, c.page_count
      ),
      in_progress AS (
        SELECT DISTINCT ON (m.id)
          m.id AS manga_id,
          m.title,
          m.cover_image,
          cp.chapter_id,
          cp.chapter_number,
          cp.read_progress,
          cp.page_count,
          cp.last_read_at,
          false AS suggested_next,
          CASE
            WHEN COALESCE(cp.page_count, 0) <= 0 THEN 0
            ELSE ROUND((LEAST(cp.read_progress, cp.page_count)::numeric / cp.page_count) * 100)::int
          END AS display_progress_percent
        FROM chapter_progress cp
        JOIN manga m ON m.id = cp.manga_id
        WHERE cp.read_progress > 0
          AND (COALESCE(cp.page_count, 0) <= 0 OR cp.read_progress < cp.page_count)
        ORDER BY m.id, cp.last_read_at DESC NULLS LAST, cp.chapter_number::numeric DESC
      ),
      latest_read AS (
        SELECT DISTINCT ON (cp.manga_id)
          cp.manga_id,
          cp.chapter_number::numeric AS chapter_num,
          cp.last_read_at
        FROM chapter_progress cp
        ORDER BY cp.manga_id, cp.last_read_at DESC NULLS LAST, cp.chapter_number::numeric DESC
      ),
      next_unread AS (
        SELECT DISTINCT ON (m.id)
          m.id AS manga_id,
          m.title,
          m.cover_image,
          c.id AS chapter_id,
          c.chapter_number,
          0::int AS read_progress,
          c.page_count,
          lr.last_read_at,
          true AS suggested_next,
          0::int AS display_progress_percent
        FROM latest_read lr
        JOIN manga m ON m.id = lr.manga_id
        JOIN chapters c ON c.manga_id = lr.manga_id
        LEFT JOIN chapter_progress cp ON cp.chapter_id = c.id
        WHERE c.chapter_number::numeric > lr.chapter_num
          AND COALESCE(cp.read_progress, 0) = 0
        ORDER BY m.id, c.chapter_number::numeric ASC
      ),
      continue_candidates AS (
        SELECT * FROM in_progress
        UNION ALL
        SELECT nu.*
        FROM next_unread nu
        WHERE NOT EXISTS (
          SELECT 1
          FROM in_progress ip
          WHERE ip.manga_id = nu.manga_id
        )
      )
      SELECT *
      FROM continue_candidates
      ORDER BY last_read_at DESC NULLS LAST, manga_id ASC
      LIMIT 5
      `,
      [userId]
    );

    const recentAdditions = await queryAll(`
      SELECT *
      FROM manga
      ORDER BY created_at DESC, id ASC
      LIMIT 10
    `);

    const favorites = await queryAll(`
      SELECT m.*, true AS is_favorite
      FROM user_favorites uf
      JOIN manga m ON m.id = uf.manga_id
      WHERE uf.user_id = $1
      ORDER BY updated_at DESC, id ASC
      LIMIT 10
     `, [userId]);

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

router.get('/recent-read', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 24);
    const offset = (page - 1) * limit;

    const recentRead = await queryAll(
      `
      SELECT
        m.*,
        COUNT(c.id)::int AS total_chapters,
        COUNT(CASE WHEN COALESCE(progress.max_page, 0) >= COALESCE(c.page_count, 0) AND COALESCE(c.page_count, 0) > 0 THEN 1 END)::int AS read_chapters
      FROM manga m
      LEFT JOIN chapters c ON c.manga_id = m.id
      JOIN reading_history rh ON rh.manga_id = m.id AND rh.user_id = $3
      LEFT JOIN (
        SELECT chapter_id, MAX(page_number)::int AS max_page
        FROM reading_history
        WHERE user_id = $3
        GROUP BY chapter_id
      ) progress ON progress.chapter_id = c.id
      GROUP BY m.id
      ORDER BY MAX(rh.read_at) DESC NULLS LAST, m.id ASC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset, userId]
    );

    const countResult = await queryOne(
      `
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT DISTINCT manga_id
        FROM reading_history
        WHERE user_id = $1
      ) x
    `,
      [userId]
    );

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

router.post('/start-reading', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const chapter_id = req.body?.chapter_id;
    const manga_id = req.body?.manga_id;
    const page_number = normalizePageNumber(req.body?.page_number, 0);

    if (!chapter_id) {
      return res.status(400).json({ error: 'Chapter ID is required' });
    }

    const chapterRecord = await queryOne(
      'SELECT id, manga_id FROM chapters WHERE id = $1',
      [chapter_id]
    );
    if (!chapterRecord) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    const effectiveMangaId = chapterRecord.manga_id;

    const existingSession = await queryOne(
      `
      SELECT *
      FROM reading_sessions
      WHERE manga_id = $1
        AND chapter_id = $2
        AND user_id = $3
        AND ended_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1
      `,
      [effectiveMangaId, chapter_id, userId]
    );

    const session =
      existingSession ||
      (await queryOne(
        `
        INSERT INTO reading_sessions (user_id, manga_id, chapter_id, start_page)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        `,
        [userId, effectiveMangaId, chapter_id, page_number]
      ));

    if (manga_id && manga_id !== effectiveMangaId) {
      console.warn('[library] start-reading payload manga_id mismatch', {
        chapter_id,
        payloadMangaId: manga_id,
        chapterMangaId: effectiveMangaId,
      });
    }

    if (page_number > 0) {
      await query(
        `
        INSERT INTO reading_history (user_id, manga_id, chapter_id, page_number)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, chapter_id, page_number) DO NOTHING
        `,
        [userId, effectiveMangaId, chapter_id, page_number]
      );
    }

    await mangaCache.invalidateManga(effectiveMangaId);
    await mangaCache.invalidateChapters(effectiveMangaId);

    emitReadingUpdated({ type: 'start-reading', user_id: userId, manga_id: effectiveMangaId, chapter_id, page_number });
    emitLibraryUpdated({ type: 'overview-changed', user_id: userId });
    emitRecommendationsUpdated({ type: 'profile-changed', user_id: userId });

    res.json(session);
  } catch (error) {
    next(error);
  }
});

router.post('/progress', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const chapter_id = req.body?.chapter_id;
    const manga_id = req.body?.manga_id;
    const page_number = normalizePageNumber(req.body?.page_number, 0);

    if (!chapter_id) {
      return res.status(400).json({ error: 'Chapter ID is required' });
    }

    const chapterRecord = await queryOne(
      'SELECT id, manga_id FROM chapters WHERE id = $1',
      [chapter_id]
    );
    if (!chapterRecord) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    const effectiveMangaId = chapterRecord.manga_id;

    if (manga_id && manga_id !== effectiveMangaId) {
      console.warn('[library] progress payload manga_id mismatch', {
        chapter_id,
        payloadMangaId: manga_id,
        chapterMangaId: effectiveMangaId,
      });
    }

    if (page_number > 0) {
      await query(
        `
        INSERT INTO reading_history (user_id, manga_id, chapter_id, page_number)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, chapter_id, page_number) DO NOTHING
        `,
        [userId, effectiveMangaId, chapter_id, page_number]
      );
    }

    await mangaCache.invalidateManga(effectiveMangaId);
    await mangaCache.invalidateChapters(effectiveMangaId);

    emitReadingUpdated({ type: 'progress', user_id: userId, manga_id: effectiveMangaId, chapter_id, page_number });
    emitLibraryUpdated({ type: 'overview-changed', user_id: userId });
    emitRecommendationsUpdated({ type: 'profile-changed', user_id: userId });

    res.json({ success: true, page_number });
  } catch (error) {
    next(error);
  }
});

router.post('/end-reading', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const session_id = req.body?.session_id;
    const end_page = normalizePageNumber(req.body?.end_page, 0);
    const duration_seconds = normalizePageNumber(req.body?.duration_seconds, 0);

    if (!session_id) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const session = await queryOne(
      `
      UPDATE reading_sessions SET
        end_page = GREATEST(COALESCE(end_page, 0), $2),
        duration_seconds = GREATEST(COALESCE(duration_seconds, 0), $3),
        ended_at = COALESCE(ended_at, CURRENT_TIMESTAMP)
      WHERE id = $1
        AND user_id = $4
      RETURNING *
      `,
      [session_id, end_page, duration_seconds, userId]
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.chapter_id && end_page > 0) {
      await query(
        `
        INSERT INTO reading_history (user_id, manga_id, chapter_id, page_number)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, chapter_id, page_number) DO NOTHING
        `,
        [userId, session.manga_id, session.chapter_id, end_page]
      );
    }

    if (session.manga_id) {
      await mangaCache.invalidateManga(session.manga_id);
      await mangaCache.invalidateChapters(session.manga_id);
    }

    emitReadingUpdated({
      type: 'end-reading',
      user_id: userId,
      manga_id: session.manga_id,
      chapter_id: session.chapter_id,
      end_page,
    });
    emitLibraryUpdated({ type: 'overview-changed', user_id: userId });
    emitRecommendationsUpdated({ type: 'profile-changed', user_id: userId });

    res.json(session);
  } catch (error) {
    next(error);
  }
});

router.get('/history', async (req, res, next) => {
  try {
    const userId = req.user.id;
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
      WHERE rh.user_id = $3
      ORDER BY rh.read_at DESC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset, userId]
    );

    const countResult = await queryOne(
      'SELECT COUNT(*) FROM reading_history WHERE user_id = $1',
      [userId]
    );

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

export default router;