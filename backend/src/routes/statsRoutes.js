import express from 'express';
import { queryOne, queryAll } from '../db/database.js';
import { authenticateToken } from './authRoutes.js';

const router = express.Router();
router.use(authenticateToken);

function resolvePeriodFilter(period) {
  if (period === 'today') return "AND rs.started_at >= CURRENT_DATE";
  if (period === 'week') return "AND rs.started_at >= CURRENT_DATE - INTERVAL '7 days'";
  if (period === 'month') return "AND rs.started_at >= CURRENT_DATE - INTERVAL '30 days'";
  return '';
}

// Get reading statistics (scoped by user)
router.get('/reading', async (req, res, next) => {
  try {
    const { period = 'all' } = req.query;
    const dateFilter = resolvePeriodFilter(period);
    const userId = req.user.id;

    const stats = await queryOne(
      `
      SELECT
        COUNT(*)::int as total_sessions,
        COALESCE(SUM(rs.duration_seconds), 0)::int as total_read_time,
        COALESCE(AVG(rs.duration_seconds), 0)::int as avg_session_time,
        COUNT(DISTINCT rs.manga_id)::int as unique_manga,
        COUNT(DISTINCT rs.chapter_id)::int as chapters_read
      FROM reading_sessions rs
      WHERE rs.user_id = $1
        AND rs.ended_at IS NOT NULL
        ${dateFilter}
      `,
      [userId]
    );

    const dailyStats = await queryAll(
      `
      SELECT
        DATE(rs.started_at) as date,
        COUNT(*)::int as sessions,
        COALESCE(SUM(rs.duration_seconds), 0)::int as read_time,
        COUNT(DISTINCT rs.chapter_id)::int as chapters
      FROM reading_sessions rs
      WHERE rs.user_id = $1
        AND rs.ended_at IS NOT NULL
        AND rs.started_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(rs.started_at)
      ORDER BY date DESC
      `,
      [userId]
    );

    const mostRead = await queryAll(
      `
      SELECT
        m.id, m.title, m.cover_image,
        COUNT(*)::int as read_count,
        COALESCE(SUM(rs.duration_seconds), 0)::int as total_time
      FROM reading_sessions rs
      JOIN manga m ON rs.manga_id = m.id
      WHERE rs.user_id = $1
        AND rs.ended_at IS NOT NULL
        ${dateFilter}
      GROUP BY m.id, m.title, m.cover_image
      ORDER BY read_count DESC
      LIMIT 10
      `,
      [userId]
    );

    res.json({ summary: stats, daily: dailyStats, most_read: mostRead });
  } catch (error) {
    next(error);
  }
});

router.get('/genres', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const genres = await queryAll(
      `
      SELECT
      g.genre,
        COUNT(*)::int as manga_count,
        COUNT(*) FILTER (WHERE uf.user_id = $1)::int as favorites_count
      FROM manga m
      CROSS JOIN LATERAL UNNEST(m.genre) AS g(genre)
      LEFT JOIN user_favorites uf ON uf.manga_id = m.id
      WHERE g.genre IS NOT NULL AND g.genre != ''
      GROUP BY g.genre
      ORDER BY manga_count DESC
    `,
      [userId]
    );

    res.json(genres);
  } catch (error) {
    next(error);
  }
});

router.get('/estimates', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const avgTimePerChapter = await queryOne(
      `
      SELECT AVG(duration_seconds)::integer as avg_time
      FROM reading_sessions
      WHERE user_id = $1
        AND ended_at IS NOT NULL
        AND duration_seconds > 0
      `,
      [userId]
    );

    const unreadChapters = await queryOne(
      `
      WITH progress AS (
        SELECT chapter_id, MAX(page_number)::int AS max_page
        FROM reading_history
        WHERE user_id = $1
        GROUP BY chapter_id
      )
      SELECT COUNT(*)::int as count
      FROM chapters c
      LEFT JOIN progress p ON p.chapter_id = c.id
      WHERE COALESCE(c.page_count, 0) <= 0
         OR COALESCE(p.max_page, 0) < c.page_count
      `,
      [userId]
    );

    const avgTime = avgTimePerChapter?.avg_time || 1800;
    const totalUnread = Number(unreadChapters?.count || 0);
    const estimatedMinutes = Math.round((totalUnread * avgTime) / 60);

    res.json({
      avg_time_per_chapter_minutes: Math.round(avgTime / 60),
      unread_chapters: totalUnread,
      estimated_total_reading_hours: Math.round(estimatedMinutes / 60),
      estimated_reading_days: Math.round(estimatedMinutes / 60 / 1.5),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/completion', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const completion = await queryAll(
      `
      WITH progress AS (
        SELECT chapter_id, MAX(page_number)::int AS max_page
        FROM reading_history
        WHERE user_id = $1
        GROUP BY chapter_id
      )
      SELECT
        m.id,
        m.title,
        m.cover_image,
        c.total_chapters,
        c.read_chapters,
        ROUND(
          CASE
            WHEN c.total_chapters > 0 THEN (c.read_chapters::numeric / c.total_chapters * 100)
            ELSE 0
          END, 1
        ) as percentage
      FROM manga m
      JOIN (
        SELECT
          c.manga_id,
          COUNT(*)::int as total_chapters,
          COUNT(*) FILTER (
            WHERE COALESCE(c.page_count, 0) > 0 AND COALESCE(p.max_page, 0) >= c.page_count
          )::int as read_chapters
        FROM chapters c
        LEFT JOIN progress p ON p.chapter_id = c.id
        GROUP BY c.manga_id
      ) c ON m.id = c.manga_id
      WHERE c.read_chapters > 0
      ORDER BY percentage DESC
      LIMIT 20
      `,
      [userId]
    );

    const grouped = { '0-25': 0, '26-50': 0, '51-75': 0, '76-99': 0, 100: 0 };
    for (const item of completion) {
      const pct = Number(item.percentage || 0);
      if (pct >= 100) grouped[100] += 1;
      else if (pct >= 76) grouped['76-99'] += 1;
      else if (pct >= 51) grouped['51-75'] += 1;
      else if (pct >= 26) grouped['26-50'] += 1;
      else grouped['0-25'] += 1;
    }

    res.json({ distribution: grouped, details: completion });
  } catch (error) {
    next(error);
  }
});

router.get('/manga/:mangaId', async (req, res, next) => {
  try {
    const { mangaId } = req.params;
    const userId = req.user.id;

    const stats = await queryOne(
      `
      WITH progress AS (
        SELECT chapter_id, MAX(page_number)::int AS max_page
        FROM reading_history
        WHERE user_id = $2
        GROUP BY chapter_id
      )
      SELECT
        m.id, m.title,
        c.total_chapters,
        c.read_chapters,
        COALESCE(SUM(rs.duration_seconds), 0)::int as total_read_time,
        COUNT(rs.id)::int as read_sessions
      FROM manga m
      JOIN (
        SELECT
          c.manga_id,
          COUNT(*)::int as total_chapters,
          COUNT(*) FILTER (
            WHERE COALESCE(c.page_count, 0) > 0 AND COALESCE(p.max_page, 0) >= c.page_count
          )::int as read_chapters
        FROM chapters c
        LEFT JOIN progress p ON p.chapter_id = c.id
        WHERE c.manga_id = $1
        GROUP BY c.manga_id
      ) c ON m.id = c.manga_id
      LEFT JOIN reading_sessions rs
        ON m.id = rs.manga_id
        AND rs.user_id = $2
        AND rs.ended_at IS NOT NULL
      WHERE m.id = $1
      GROUP BY m.id, m.title, c.total_chapters, c.read_chapters
      `,
      [mangaId, userId]
    );

    if (!stats) {
      return res.status(404).json({ error: 'Manga not found' });
    }

    const chapters = await queryAll(
      `
      WITH progress AS (
        SELECT chapter_id, MAX(page_number)::int AS max_page, MAX(read_at) AS last_read_at
        FROM reading_history
        WHERE user_id = $2
        GROUP BY chapter_id
      )
      SELECT
        c.id,
        c.chapter_number,
        COALESCE(p.max_page, 0)::int AS read_progress,
        p.last_read_at,
        c.page_count
      FROM chapters c
      LEFT JOIN progress p ON p.chapter_id = c.id
      WHERE c.manga_id = $1
      ORDER BY c.chapter_number::numeric
      `,
      [mangaId, userId]
    );

    res.json({ ...stats, chapters });
  } catch (error) {
    next(error);
  }
});

export default router;