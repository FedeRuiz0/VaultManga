import { queryAll, queryOne } from '../db/database.js';

function normalizeGenreList(genre) {
  if (Array.isArray(genre)) return genre.filter(Boolean);
  if (typeof genre === 'string') {
    try {
      const parsed = JSON.parse(genre);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function buildUserPreferenceProfile(userId = null) {
  const scopedFavoritesSql = userId
    ? `
      SELECT DISTINCT m.id, m.title, m.genre, m.status, m.year, m.author, m.artist
      FROM user_favorites uf
      JOIN manga m ON m.id = uf.manga_id
      WHERE uf.user_id = $1
    `
    : `
      SELECT id, title, genre, status, year, author, artist
      FROM manga
      WHERE false
    `;

  const favorites = await queryAll(`
    ${scopedFavoritesSql}
  `, userId ? [userId] : []);

  const readingStats = await queryAll(
    `
    SELECT
      m.id,
      m.title,
      m.genre,
      m.status,
      m.year,
      m.author,
      m.artist,
      COUNT(c.id)::int AS total_chapters,
      COUNT(*) FILTER (
        WHERE COALESCE(c.page_count, 0) > 0 AND COALESCE(progress.max_page, 0) >= c.page_count
      )::int AS read_chapters,
      COALESCE(MAX(progress.last_read_at), m.last_read_at) AS last_activity
    FROM manga m
    LEFT JOIN chapters c ON c.manga_id = m.id
    LEFT JOIN (
      SELECT chapter_id, MAX(page_number)::int AS max_page, MAX(read_at) AS last_read_at
      FROM reading_history
      ${userId ? 'WHERE user_id = $1' : ''}
      GROUP BY chapter_id
    ) progress ON progress.chapter_id = c.id
    GROUP BY m.id
  `,
    userId ? [userId] : []
  );

  const totalManga = readingStats.length;

  const genreScores = new Map();
  const authorScores = new Map();
  const artistScores = new Map();
  const statusScores = new Map();
  const yearBuckets = new Map();

  const addScore = (map, key, value) => {
    if (!key) return;
    map.set(key, (map.get(key) || 0) + value);
  };

  for (const manga of readingStats) {
    const totalChapters = Number(manga.total_chapters || 0);
    const readChapters = Number(manga.read_chapters || 0);
    const completionRatio =
      totalChapters > 0 ? readChapters / totalChapters : 0;

    const favoriteBoost = favorites.some((fav) => fav.id === manga.id) ? 2.5 : 1;
    const activityBoost = manga.last_activity ? 1.2 : 1;

    const score = Math.max(0.2, completionRatio * 3 + favoriteBoost) * activityBoost;

    for (const genre of normalizeGenreList(manga.genre)) {
      addScore(genreScores, genre, score);
    }

    addScore(authorScores, manga.author, score);
    addScore(artistScores, manga.artist, score);
    addScore(statusScores, manga.status, score);

    if (manga.year) {
      const bucket = `${Math.floor(Number(manga.year) / 10) * 10}s`;
      addScore(yearBuckets, bucket, score);
    }
  }

  const topEntries = (map, limit = 10) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, score]) => ({ name, score: Number(score.toFixed(2)) }));

  const globalCompletion = await queryOne(
    `
    SELECT
      COUNT(*) FILTER (
        WHERE COALESCE(c.page_count, 0) > 0 AND COALESCE(progress.max_page, 0) >= c.page_count
      )::int AS read_chapters,
      COUNT(*)::int AS total_chapters
    FROM chapters
    c
    LEFT JOIN (
      SELECT chapter_id, MAX(page_number)::int AS max_page
      FROM reading_history
      ${userId ? 'WHERE user_id = $1' : ''}
      GROUP BY chapter_id
    ) progress ON progress.chapter_id = c.id
  `,
    userId ? [userId] : []
  );

  const readChapters = Number(globalCompletion?.read_chapters || 0);
  const totalChapters = Number(globalCompletion?.total_chapters || 0);

  return {
    generated_at: new Date().toISOString(),
    total_manga: totalManga,
    favorites_count: favorites.length,
    chapter_completion_ratio:
      totalChapters > 0 ? Number((readChapters / totalChapters).toFixed(4)) : 0,
    top_genres: topEntries(genreScores, 12),
    top_authors: topEntries(authorScores, 8),
    top_artists: topEntries(artistScores, 8),
    preferred_statuses: topEntries(statusScores, 6),
    preferred_eras: topEntries(yearBuckets, 6),
  };
}