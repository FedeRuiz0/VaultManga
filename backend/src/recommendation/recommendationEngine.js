import { queryAll } from '../db/database.js';
import { buildUserPreferenceProfile } from './userProfileBuilder.js';
import { filterRecommendationCandidates } from './ruleEngine.js';
import { scoreCandidateManga } from './scoringEngine.js';

async function getRecommendationFeedback() {
  const rows = await queryAll(`
    SELECT feedback_type, value
    FROM recommendation_feedback
    ORDER BY created_at DESC
  `);

  const feedback = {
    blocked_manga_ids: [],
    disliked_genres: [],
    liked_genres: [],
  };

  for (const row of rows) {
    if (row.feedback_type === 'block_manga') {
      feedback.blocked_manga_ids.push(row.value);
    }
    if (row.feedback_type === 'dislike_genre') {
      feedback.disliked_genres.push(row.value);
    }
    if (row.feedback_type === 'like_genre') {
      feedback.liked_genres.push(row.value);
    }
  }

  return feedback;
}

export async function generateRecommendations(limit = 12, userId = null) {
  const [profile, feedback, mangaList] = await Promise.all([
    buildUserPreferenceProfile(userId),
    getRecommendationFeedback(),
    queryAll(`
      SELECT
        m.*,
        COUNT(c.id)::int AS total_chapters,
        COUNT(*) FILTER (WHERE c.is_read = true)::int AS read_chapters
      FROM manga m
      LEFT JOIN chapters c ON c.manga_id = m.id
      GROUP BY m.id
    `),
  ]);

  const candidates = filterRecommendationCandidates(mangaList);

  const scored = candidates
    .map((manga) => {
      const result = scoreCandidateManga(manga, profile, feedback);

      return {
        ...manga,
        recommendation_score: result.score,
        confidence: result.confidence,
        reasons: result.reasons,
      };
    })
    .filter((item) => item.recommendation_score > 0)
    .sort((a, b) => b.recommendation_score - a.recommendation_score)
    .slice(0, limit);

  return {
    profile,
    generated_at: new Date().toISOString(),
    recommendations: scored,
  };
}