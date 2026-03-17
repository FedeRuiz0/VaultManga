import express from 'express';
import { query, queryOne, queryAll } from '../db/database.js';

const router = express.Router();

// Get reading statistics
router.get('/reading', async (req, res, next) => {
  try {
    const { period = 'all' } = req.query;
    
    let dateFilter = '';
    if (period === 'today') {
      dateFilter = "AND started_at >= CURRENT_DATE";
    } else if (period === 'week') {
      dateFilter = "AND started_at >= CURRENT_DATE - INTERVAL '7 days'";
    } else if (period === 'month') {
      dateFilter = "AND started_at >= CURRENT_DATE - INTERVAL '30 days'";
    }

    const stats = await queryOne(`
      SELECT 
        COUNT(*) as total_sessions,
        SUM(duration_seconds) as total_read_time,
        AVG(duration_seconds) as avg_session_time,
        COUNT(DISTINCT manga_id) as unique_manga,
        COUNT(DISTINCT chapter_id) as chapters_read
      FROM reading_sessions
      WHERE ended_at IS NOT NULL ${dateFilter}
    `);

    // Get daily reading stats for the last 30 days
    const dailyStats = await queryAll(`
      SELECT 
        DATE(started_at) as date,
        COUNT(*) as sessions,
        SUM(duration_seconds) as read_time,
        COUNT(DISTINCT chapter_id) as chapters
      FROM reading_sessions
      WHERE ended_at IS NOT NULL
        AND started_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(started_at)
      ORDER BY date DESC
    `);

    // Get most read manga
    const mostRead = await queryAll(`
      SELECT 
        m.id, m.title, m.cover_image,
        COUNT(*) as read_count,
        SUM(rs.duration_seconds) as total_time
      FROM reading_sessions rs
      JOIN manga m ON rs.manga_id = m.id
      WHERE rs.ended_at IS NOT NULL ${dateFilter}
      GROUP BY m.id, m.title, m.cover_image
      ORDER BY read_count DESC
      LIMIT 10
    `);

    res.json({
      summary: stats,
      daily: dailyStats,
      most_read: mostRead
    });
  } catch (error) {
    next(error);
  }
});

// Get genre distribution
router.get('/genres', async (req, res, next) => {
  try {
    const genres = await queryAll(`
      SELECT 
        genre,
        COUNT(*) as manga_count,
        COUNT(*) FILTER (WHERE is_favorite) as favorites_count
      FROM manga, UNNEST(genre) as genre
      WHERE genre IS NOT NULL AND genre != ''
      GROUP BY genre
      ORDER BY manga_count DESC
    `);

    res.json(genres);
  } catch (error) {
    next(error);
  }
});

// Get reading time estimates
router.get('/estimates', async (req, res, next) => {
  try {
    // Calculate average time per chapter
    const avgTimePerChapter = await queryOne(`
      SELECT AVG(duration_seconds)::integer as avg_time
      FROM reading_sessions
      WHERE ended_at IS NOT NULL AND duration_seconds > 0
    `);

    // Get unread chapters count
    const unreadChapters = await queryOne(`
      SELECT COUNT(*) as count FROM chapters WHERE is_read = false
    `);

    // Estimate total reading time for unread chapters
    const avgTime = avgTimePerChapter?.avg_time || 1800; // Default 30 min
    const totalUnread = parseInt(unreadChapters?.count || 0);
    const estimatedMinutes = Math.round((totalUnread * avgTime) / 60);

    res.json({
      avg_time_per_chapter_minutes: Math.round(avgTime / 60),
      unread_chapters: totalUnread,
      estimated_total_reading_hours: Math.round(estimatedMinutes / 60),
      estimated_reading_days: Math.round(estimatedMinutes / 60 / 1.5) // Assuming 1.5 hours per day
    });
  } catch (error) {
    next(error);
  }
});

// Get completion stats
router.get('/completion', async (req, res, next) => {
  try {
    const completion = await queryAll(`
      SELECT 
        m.id,
        m.title,
        m.cover_image,
        c.total_chapters,
        c.read_chapters,
        ROUND(
          CASE 
            WHEN c.total_chapters > 0 
            THEN (c.read_chapters::numeric / c.total_chapters * 100)
            ELSE 0 
          END, 1
        ) as percentage
      FROM manga m
      JOIN (
        SELECT 
          manga_id,
          COUNT(*) as total_chapters,
          COUNT(*) FILTER (WHERE is_read) as read_chapters
        FROM chapters
        GROUP BY manga_id
      ) c ON m.id = c.manga_id
      WHERE c.read_chapters > 0
      ORDER BY percentage DESC
      LIMIT 20
    `);

    // Group by completion percentage
    const grouped = {
      '0-25': 0,
      '26-50': 0,
      '51-75': 0,
      '76-99': 0,
      '100': 0
    };

    for (const item of completion) {
      if (item.percentage >= 100) grouped['100']++;
      else if (item.percentage >= 76) grouped['76-99']++;
      else if (item.percentage >= 51) grouped['51-75']++;
      else if (item.percentage >= 26) grouped['26-50']++;
      else grouped['0-25']++;
    }

    res.json({
      distribution: grouped,
      details: completion
    });
  } catch (error) {
    next(error);
  }
});

// Get manga stats (detailed per manga)
router.get('/manga/:mangaId', async (req, res, next) => {
  try {
    const { mangaId } = req.params;

    const stats = await queryOne(`
      SELECT 
        m.id, m.title,
        c.total_chapters,
        c.read_chapters,
        COALESCE(SUM(rs.duration_seconds), 0) as total_read_time,
        COUNT(rs.id) as read_sessions
      FROM manga m
      JOIN (
        SELECT 
          manga_id,
          COUNT(*) as total_chapters,
          COUNT(*) FILTER (WHERE is_read) as read_chapters
        FROM chapters
        WHERE manga_id = $1
        GROUP BY manga_id
      ) c ON m.id = c.manga_id
      LEFT JOIN reading_sessions rs ON m.id = rs.manga_id AND rs.ended_at IS NOT NULL
      WHERE m.id = $1
      GROUP BY m.id, m.title, c.total_chapters, c.read_chapters
    `, [mangaId]);

    if (!stats) {
      return res.status(404).json({ error: 'Manga not found' });
    }

    // Get chapter breakdown
    const chapters = await queryAll(`
      SELECT 
        chapter_number,
        read_count,
        last_read_at,
        first_read_at,
        read_progress,
        page_count
      FROM chapters
      WHERE manga_id = $1
      ORDER BY chapter_number::numeric
    `, [mangaId]);

    res.json({
      ...stats,
      chapters
    });
  } catch (error) {
    next(error);
  }
});

export default router;

