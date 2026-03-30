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

function toMap(entries = []) {
  const map = new Map();
  for (const entry of entries) {
    if (entry?.name) {
      map.set(entry.name, Number(entry.score || 0));
    }
  }
  return map;
}

function decadeBucket(year) {
  if (!year) return null;
  return `${Math.floor(Number(year) / 10) * 10}s`;
}

export function scoreCandidateManga(manga, profile, feedback = {}) {
  const genreMap = toMap(profile.top_genres);
  const authorMap = toMap(profile.top_authors);
  const artistMap = toMap(profile.top_artists);
  const statusMap = toMap(profile.preferred_statuses);
  const eraMap = toMap(profile.preferred_eras);

  const blockedIds = new Set(feedback.blocked_manga_ids || []);
  const dislikedGenres = new Set(feedback.disliked_genres || []);
  const boostedGenres = new Set(feedback.liked_genres || []);

  if (blockedIds.has(manga.id)) {
    return {
      score: -9999,
      reasons: ['Blocked by user feedback'],
      confidence: 0,
    };
  }

  let score = 0;
  const reasons = [];

  const genres = normalizeGenreList(manga.genre);

  for (const genre of genres) {
    const base = genreMap.get(genre) || 0;
    if (base > 0) {
      score += base * 2;
      reasons.push(`Matches preferred genre: ${genre}`);
    }

    if (boostedGenres.has(genre)) {
      score += 5;
      reasons.push(`Boosted by explicit genre preference: ${genre}`);
    }

    if (dislikedGenres.has(genre)) {
      score -= 8;
      reasons.push(`Penalized by disliked genre: ${genre}`);
    }
  }

  if (manga.author && authorMap.has(manga.author)) {
    score += authorMap.get(manga.author) * 1.8;
    reasons.push(`Author affinity: ${manga.author}`);
  }

  if (manga.artist && artistMap.has(manga.artist)) {
    score += artistMap.get(manga.artist) * 1.3;
    reasons.push(`Artist affinity: ${manga.artist}`);
  }

  if (manga.status && statusMap.has(manga.status)) {
    score += statusMap.get(manga.status) * 0.8;
    reasons.push(`Matches preferred status: ${manga.status}`);
  }

  const bucket = decadeBucket(manga.year);
  if (bucket && eraMap.has(bucket)) {
    score += eraMap.get(bucket) * 0.5;
    reasons.push(`Matches preferred era: ${bucket}`);
  }

  if (manga.is_favorite) {
    score -= 100;
    reasons.push('Already favorite');
  }

  if (Number(manga.read_chapters || 0) > 0 && Number(manga.total_chapters || 0) > 0) {
    const completion =
      Number(manga.read_chapters) / Number(manga.total_chapters);
    score -= completion * 20;
    reasons.push('Reduced because already started');
  }

  const uniqueReasons = [...new Set(reasons)].slice(0, 5);
  const confidence = Math.max(0, Math.min(1, score / 25));

  return {
    score: Number(score.toFixed(2)),
    reasons: uniqueReasons,
    confidence: Number(confidence.toFixed(2)),
  };
}