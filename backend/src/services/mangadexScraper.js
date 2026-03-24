import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/database.js';
import { safeGet } from './safeRequest.js';
import { mangaCache } from '../db/redis.js';

function pickLocalizedText(data, preferred = 'en', fallback = '') {
  if (!data || typeof data !== 'object') return fallback;
  if (data[preferred]) return data[preferred];
  const first = Object.values(data).find(Boolean);
  return first || fallback;
}

function getRelationshipId(entity, type) {
  const rel = (entity?.relationships || []).find((r) => r.type === type);
  return rel?.id || null;
}

function buildCoverUrlFromIncludes(manga, includes = []) {
  const coverRelationshipId = getRelationshipId(manga, 'cover_art');
  if (!coverRelationshipId) return null;

  const cover = includes.find(
    (item) => item.type === 'cover_art' && item.id === coverRelationshipId
  );

  const fileName = cover?.attributes?.fileName;
  if (!fileName) return null;

  return `https://uploads.mangadex.org/covers/${manga.id}/${fileName}.512.jpg`;
}

class MangaDexScraper {
  constructor() {
    this.baseURL = 'https://api.mangadex.org';
    this.delay = 1500;
    this.feedPageSize = 100;
  }

  async searchManga(queryText, limit = 10) {
    try {
      const response = await safeGet.get(`${this.baseURL}/manga`, {
        params: {
          title: queryText,
          limit,
          includes: ['cover_art'],
        },
      });

      return response.data?.data || [];
    } catch (error) {
      console.error('MangaDex search error:', error.response?.data || error.message);
      return [];
    }
  }

  async getMangaDetails(id) {
  try {
    const response = await safeGet.get(`${this.baseURL}/manga/${id}`, {
      params: {
        includes: ['cover_art', 'author', 'artist'],
      },
    });

    const manga = response.data?.data;
    const includes = response.data?.includes || [];

    if (!manga) return null;

    const authorRel = (manga.relationships || []).find((r) => r.type === 'author');
    const artistRel = (manga.relationships || []).find((r) => r.type === 'artist');

    const author = includes.find((i) => i.type === 'author' && i.id === authorRel?.id);
    const artist = includes.find((i) => i.type === 'artist' && i.id === artistRel?.id);

    return {
      id: manga.id,
      title:
        manga.attributes?.title?.en ||
        Object.values(manga.attributes?.title || {})[0] ||
        'Unknown',
      description:
        manga.attributes?.description?.en ||
        Object.values(manga.attributes?.description || {})[0] ||
        '',
      cover_image: buildCoverUrlFromIncludes(manga, includes),
      genre:
        manga.attributes?.tags
          ?.map((t) => t.attributes?.name?.en)
          .filter(Boolean) || [],
      status: manga.attributes?.status || 'ongoing',
      year: manga.attributes?.year || null,
      author: author?.attributes?.name || '',
      artist: artist?.attributes?.name || '',
    };
  } catch (error) {
    console.error('MangaDex details error:', error.response?.data || error.message);
    return null;
  }
}

  async getPopularManga(limit = 50) {
    try {
      const response = await safeGet.get(`${this.baseURL}/manga`, {
        params: {
          limit,
          order: { rating: 'desc' },
          includes: ['cover_art'],
        },
      });

      return response.data?.data || [];
    } catch (error) {
      console.error('Popular manga error:', error.response?.data || error.message);
      return [];
    }
  }

  async getChapters(mangaDexId) {
    try {
      console.log(`📖 Fetching chapters for manga: ${mangaDexId}`);

      const chapters = [];
      let offset = 0;

      while (true) {
        const response = await safeGet.get(`${this.baseURL}/manga/${mangaDexId}/feed`, {
          params: {
            limit: this.feedPageSize,
            offset,
            translatedLanguage: ['en', 'es', 'pt-br'],
            'order[chapter]': 'asc',
          },
        });

        const batch = response.data?.data || [];
        const total = response.data?.total || 0;

        console.log(
          `📦 Feed batch fetched manga=${mangaDexId} offset=${offset} batch=${batch.length} total=${total}`
        );

        if (batch.length === 0) break;

        chapters.push(...batch);

        if (batch.length < this.feedPageSize) break;

        offset += this.feedPageSize;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      console.log(`📚 Total chapters fetched for ${mangaDexId}: ${chapters.length}`);
      return chapters;
    } catch (error) {
      console.error('Chapters fetch error:', error.response?.data || error.message);
      return [];
    }
  }

  async importChapters(mangaId, mangaDexId) {
  try {
    const chapters = await this.getChapters(mangaDexId);

    // 1) normalizar
    const normalized = chapters
      .map((c) => {
        const attrs = c.attributes || {};
        let raw = String(attrs.chapter || '').trim();

        if (!raw) return null;

        raw = raw.replace(',', '.');

        return {
          id: c.id,
          chapterNumber: raw, // string exacto
          chapterNumberSort: parseFloat(raw) || 0, // solo para ordenar
          volume: attrs.volume || null,
          title: attrs.title || `Chapter ${raw}`,
          source_path: `mangadex://${c.id}`,
          language: attrs.translatedLanguage || 'unknown',
        };
      })
      .filter(Boolean);

    if (normalized.length === 0) {
      console.log(`📚 No chapters to import for manga ${mangaId}`);
      return 0;
    }

    // 2) deduplicar dentro del lote
    const uniqueMap = new Map();

    for (const ch of normalized) {
      const key = ch.chapterNumber;

      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, ch);
      } else {
        const existing = uniqueMap.get(key);

        const priority = (lang) =>
          lang === 'es' ? 3 : lang === 'en' ? 2 : 1;

        if (priority(ch.language) > priority(existing.language)) {
          uniqueMap.set(key, ch);
        }
      }
    }

    const cleanChapters = Array.from(uniqueMap.values()).sort(
      (a, b) => a.chapterNumberSort - b.chapterNumberSort
    );

    console.log('DEBUG duplicates:', normalized.length, '->', cleanChapters.length);

    // 3) filtrar contra DB existente
    const existingRows = await query(
      `SELECT chapter_number FROM chapters WHERE manga_id = $1`,
      [mangaId]
    );

    const existingSet = new Set(
      existingRows.rows.map((r) => String(r.chapter_number))
    );

    const finalChapters = cleanChapters.filter(
      (ch) => !existingSet.has(String(ch.chapterNumber))
    );

    console.log(`📚 Final import: ${cleanChapters.length} -> ${finalChapters.length}`);

    if (finalChapters.length === 0) {
      console.log('⚠️ No new chapters to insert');
      return 0;
    }

    // 4) armar bulk insert con FINAL chapters
    const values = [];
    const params = [];
    let paramIndex = 1;

    for (const chapter of finalChapters) {
      values.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, 0, FALSE, $${paramIndex + 6})`
      );

      params.push(
        uuidv4(),
        mangaId,
        chapter.chapterNumber,
        chapter.volume,
        chapter.title,
        chapter.source_path,
        chapter.language
      );

      paramIndex += 7;
    }

    console.log(`📚 Bulk importing ${finalChapters.length} chapters for manga ${mangaId}`);

    await query('BEGIN');

    await query(
      `
      INSERT INTO chapters (
        id,
        manga_id,
        chapter_number,
        volume,
        title,
        source_path,
        page_count,
        pages_fetched,
        language
      )
      VALUES ${values.join(', ')}
      ON CONFLICT (manga_id, chapter_number)
      DO UPDATE SET
        volume = EXCLUDED.volume,
        title = EXCLUDED.title,
        source_path = EXCLUDED.source_path,
        language = EXCLUDED.language,
        updated_at = CURRENT_TIMESTAMP
      `,
      params
    );

    await query('COMMIT');

    await mangaCache.invalidateChapters(mangaId);
    await mangaCache.invalidateManga(mangaId);

    console.log(`✅ Chapters bulk imported: ${finalChapters.length} for ${mangaId}`);
    return finalChapters.length;
  } catch (error) {
    try {
      await query('ROLLBACK');
    } catch (_) {
      // no-op
    }

    console.error('Chapter bulk import failed:', error);
    throw error;
  }
}

  async importManga(mangaData) {
    try {
      const sourcePath = `mangadex://${mangaData.id}`;

      const exists = await query(
        'SELECT id FROM manga WHERE source_path = $1 LIMIT 1',
        [sourcePath]
      );

      if (exists.rowCount > 0) {
        const mangaId = exists.rows[0].id;

        console.log(`Manga exists: ${mangaData.title}`);
        console.log(`📚 Importing chapters for existing manga: ${mangaData.title}`);

        await this.importChapters(mangaId, mangaData.id);
        return mangaId;
      }

      const genreArray = JSON.stringify(mangaData.genre || []);

      const result = await query(
        `
        INSERT INTO manga (
          id, title, description, cover_image, genre, status, year, author, artist, source_path
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
        `,
        [
          uuidv4(),
          mangaData.title,
          mangaData.description || '',
          mangaData.cover_image || null,
          genreArray,
          mangaData.status || 'ongoing',
          mangaData.year || null,
          mangaData.author || null,
          mangaData.artist || null,
          sourcePath,
        ]
      );

      const mangaId = result.rows[0].id;

      if (typeof mangaCache.cacheDeletePattern === 'function') {
        await mangaCache.cacheDeletePattern('manga:*');
        await mangaCache.cacheDeletePattern('manga:list:*');
      }

      console.log(`✅ Imported manga: ${mangaData.title} (ID: ${mangaId})`);
      console.log(`🔄 Importing chapters for: ${mangaData.title}`);

      const chapterCount = await this.importChapters(mangaId, mangaData.id);
      console.log(`📚 Chapters done: ${chapterCount}`);

      return mangaId;
    } catch (error) {
      console.error('Import error:', mangaData.title, error);
      return null;
    }
  }

  async scrapeBatch(options = {}) {
    const { count = 10, genres = [] } = options;

    console.log(`🎯 Starting ethical scrape: ${count} mangas (1.5s/request)`);

    let mangas;
    if (genres.length > 0) {
      mangas = await this.searchManga(genres.join(' '), count * 2);
    } else {
      mangas = await this.getPopularManga(count * 2);
    }

    let imported = 0;

    for (let i = 0; i < Math.min(mangas.length, count); i++) {
      try {
        const mangaRef = mangas[i];
        console.log(`📥 Scraping ${i + 1}/${Math.min(mangas.length, count)}: ${mangaRef.id}`);

        await new Promise((resolve) => setTimeout(resolve, this.delay));

        const details = await this.getMangaDetails(mangaRef.id);
        if (details) {
          await this.importManga(details);
          imported++;
        }
      } catch (error) {
        console.error('Scrape item error:', error);
      }
    }

    console.log(`✅ Scraping complete: ${imported}/${count} mangas + chapters imported`);
    return { imported, total: mangas.length, attempted: count };
  }
}

export default new MangaDexScraper();