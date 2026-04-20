import express from 'express';
import { query, queryAll, queryOne } from '../db/database.js';
import { mangaCache } from '../db/redis.js';
import {
  emitLibraryUpdated,
  emitReadingUpdated,
  emitRecommendationsUpdated,
} from '../realtime/socket.js';

const router = express.Router();

function normalizePageNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

async function updateChapterProgress(chapterId, pageNumber) {
  return queryOne(
    `
    UPDATE chapters
    SET
      read_progress = CASE
        WHEN COALESCE(page_count, 0) > 0 THEN LEAST(
          GREATEST(COALESCE(read_progress, 0), $2),
          page_count
        )
        ELSE GREATEST(COALESCE(read_progress, 0), $2)
      END,
      is_read = CASE
        WHEN COALESCE(page_count, 0) > 0 THEN
          LEAST(GREATEST(COALESCE(read_progress, 0), $2), page_count) >= page_count
        ELSE is_read
      END,
      first_read_at = COALESCE(first_read_at, CURRENT_TIMESTAMP),
      last_read_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING id, manga_id, read_progress, page_count, is_read
    `,
    [chapterId, pageNumber]
  );
}

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
        m.last_read_at,
        c.id AS chapter_id,
        c.chapter_number,
        c.read_progress
      FROM manga m
      JOIN chapters c ON c.manga_id = m.id
      WHERE m.last_read_at IS NOT NULL
      ORDER BY m.id, m.last_read_at DESC, c.last_read_at DESC NULLS LAST
      LIMIT 10
    `);

    const continueReading = await queryAll(`
      WITH in_progress AS (
        SELECT DISTINCT ON (m.id)
          m.id AS manga_id,
          m.title,
          m.cover_image,
          c.id AS chapter_id,
          c.chapter_number,
          c.read_progress,
          c.page_count,
          c.last_read_at,
          false AS suggested_next,
          CASE
            WHEN COALESCE(c.page_count, 0) <= 0 THEN 0
            ELSE ROUND(
              (
                LEAST(c.read_progress, c.page_count)::numeric
                / c.page_count
              ) * 100
            )::int
          END AS display_progress_percent
        FROM manga m
        JOIN chapters c ON c.manga_id = m.id
        WHERE c.is_read = false
          AND c.read_progress > 0
        ORDER BY m.id, c.last_read_at DESC NULLS LAST, c.chapter_number DESC
      ),
      latest_read AS (
        SELECT DISTINCT ON (c.manga_id)
          c.manga_id,
          c.chapter_number::numeric AS chapter_num,
          c.last_read_at
        FROM chapters c
        WHERE c.is_read = true
        ORDER BY c.manga_id, c.last_read_at DESC NULLS LAST, c.chapter_number::numeric DESC
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
        JOIN chapters c
          ON c.manga_id = lr.manga_id
         AND c.is_read = false
         AND c.chapter_number::numeric > lr.chapter_num
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
    `);

    const recentAdditions = await queryAll(`
      SELECT *
      FROM manga
      ORDER BY created_at DESC, id ASC
      LIMIT 10
    `);

    const favorites = await queryAll(`
      SELECT *
      FROM manga
      WHERE is_favorite = true
      ORDER BY updated_at DESC, id ASC
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
      ORDER BY m.last_read_at DESC NULLS LAST, m.id ASC
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

router.post('/start-reading', async (req, res, next) => {
  try {
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
        AND ended_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1
      `,
      [effectiveMangaId, chapter_id]
    );

    const session =
      existingSession ||
      (await queryOne(
        `
        INSERT INTO reading_sessions (manga_id, chapter_id, start_page)
        VALUES ($1, $2, $3)
        RETURNING *
        `,
        [effectiveMangaId, chapter_id, page_number]
      ));

    const chapter = await updateChapterProgress(chapter_id, page_number);
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    if (manga_id && manga_id !== effectiveMangaId) {
      console.warn('[library] start-reading payload manga_id mismatch', {
        chapter_id,
        payloadMangaId: manga_id,
        chapterMangaId: effectiveMangaId,
      });
    }

    await query(
      `
      UPDATE manga SET
        last_read_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [effectiveMangaId]
    );

    if (page_number > 0) {
      await query(
        `
        INSERT INTO reading_history (manga_id, chapter_id, page_number)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, chapter_id, page_number) DO NOTHING
        `,
        [effectiveMangaId, chapter_id, page_number]
      );
    }

    await mangaCache.invalidateManga(effectiveMangaId);
    await mangaCache.invalidateChapters(effectiveMangaId);

    emitReadingUpdated({ type: 'start-reading', manga_id: effectiveMangaId, chapter_id, page_number });
    emitLibraryUpdated({ type: 'overview-changed' });
    emitRecommendationsUpdated({ type: 'profile-changed' });

    res.json(session);
  } catch (error) {
    next(error);
  }
});

router.post('/progress', async (req, res, next) => {
  try {
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

    const chapter = await updateChapterProgress(chapter_id, page_number);
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    if (manga_id && manga_id !== effectiveMangaId) {
      console.warn('[library] progress payload manga_id mismatch', {
        chapter_id,
        payloadMangaId: manga_id,
        chapterMangaId: effectiveMangaId,
      });
    }

    await query(
      `
      UPDATE manga SET
        last_read_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [effectiveMangaId]
    );

    if (page_number > 0) {
      await query(
        `
        INSERT INTO reading_history (manga_id, chapter_id, page_number)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, chapter_id, page_number) DO NOTHING
        `,
        [effectiveMangaId, chapter_id, page_number]
      );
    }

    await mangaCache.invalidateManga(effectiveMangaId);
    await mangaCache.invalidateChapters(effectiveMangaId);

    emitReadingUpdated({ type: 'progress', manga_id: effectiveMangaId, chapter_id, page_number });
    emitLibraryUpdated({ type: 'overview-changed' });
    emitRecommendationsUpdated({ type: 'profile-changed' });

    res.json({ success: true, page_number });
  } catch (error) {
    next(error);
  }
});

router.post('/end-reading', async (req, res, next) => {
  try {
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
      RETURNING *
      `,
      [session_id, end_page, duration_seconds]
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.chapter_id) {
      await updateChapterProgress(session.chapter_id, end_page);
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

    emitReadingUpdated({
      type: 'end-reading',
      manga_id: session.manga_id,
      chapter_id: session.chapter_id,
      end_page,
    });
    emitLibraryUpdated({ type: 'overview-changed' });
    emitRecommendationsUpdated({ type: 'profile-changed' });

    res.json(session);
  } catch (error) {
    next(error);
  }
});

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

export default router;