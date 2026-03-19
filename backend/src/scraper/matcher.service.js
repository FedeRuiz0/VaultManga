function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\\s]/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const matrix = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

export function similarity(str1, str2) {
  const norm1 = normalize(str1);
  const norm2 = normalize(str2);
  const longer = Math.max(norm1.length, norm2.length);
  
  if (longer === 0) return 1;
  
  return 1 - (levenshtein(norm1, norm2) / longer);
}

export async function matchManga(scrapedManga, threshold = 0.7) {
  const { query, queryOne } = await import('../db/database.js');
  
  try {
    console.log('🔍 Matching manga:', scrapedManga.title);
    
    // Exact source_path first
    const exact = await queryOne(
      'SELECT id, title FROM manga WHERE source_path = $1',
      [scrapedManga.source_path]
    );
    if (exact) {
      console.log('✅ Exact match found:', exact.title);
      return exact;
    }
    
    // Fuzzy match
    const dbMangas = await query(
      'SELECT id, title FROM manga WHERE LENGTH(title) > 3',
      []
    );
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const dbManga of dbMangas.rows) {
      const score = similarity(scrapedManga.title, dbManga.title);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = dbManga;
      }
    }
    
    if (bestScore > threshold) {
      console.log(`✅ Fuzzy match: ${bestMatch.title} (score: ${bestScore.toFixed(2)})`);
      return bestMatch;
    }
    
    console.log('❌ No match found');
    return null;
  } catch (error) {
    console.error('❌ Matcher error:', error.message);
    return null;
  }
}

