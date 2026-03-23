import axios from 'axios';

const BASE_URL = 'https://api.mangadex.org';
const DEFAULT_TIMEOUT_MS = Number(process.env.SCRAPER_HTTP_TIMEOUT_MS || 15000);

const http = axios.create({
  baseURL: BASE_URL,
  timeout: DEFAULT_TIMEOUT_MS
});

function pickLocalizedValue(valueObj, preferred = 'en', fallback = '') {
  if (!valueObj || typeof valueObj !== 'object') return fallback;
  if (valueObj[preferred]) return valueObj[preferred];

  const first = Object.values(valueObj).find(Boolean);
  return first || fallback;
}

function toChapterNumber(raw) {
  if (raw === null || raw === undefined) return null;
  return String(raw).trim();
}

function mapMangaListItem(item) {
  return {
    id: item.id,
    title: pickLocalizedValue(item.attributes?.title, 'en', 'Unknown title'),
    url: `/manga/${item.id}`
  };
}




// ======================
// 🔍 SEARCH
// ======================

export async function getPopularManga(limit = 20, offset = 0) {
  try {
    const params = new URLSearchParams();
    params.append('limit', String(limit));
    params.append('offset', String(offset));
    params.append('order[followedCount]', 'desc');

    const { data } = await http.get('/manga', { params });
    return (data?.data || []).map(mapMangaListItem);
  } catch (error) {
    console.error(`[mangadex] popular manga failed: ${error.message}`);
    return [];
  }
}

export async function searchManga(query, limit = 5) {
  if (!query || !String(query).trim()) return [];

  try {
    const { data } = await http.get('/manga', {
      params: {
        title: query,
        limit,
        order: { relevance: 'desc' }
      }
    });

    return (data?.data || []).map((item) => ({
      id: item.id,
      title: pickLocalizedValue(item.attributes?.title, 'en', 'Unknown title'),
      url: `/manga/${item.id}`
    }));
  } catch (error) {
    console.error(`[mangadex] search failed: ${error.message}`);
    return [];
  }
}

// ======================
// 📖 DETAILS
// ======================
export async function scrapeMangaDetails(mangaUrl) {
  const mangaId = String(mangaUrl || '').split('/').filter(Boolean).pop();
  if (!mangaId) {
    throw new Error('Invalid manga URL/path for MangaDex details');
  }

  try {
    const { data } = await http.get(`/manga/${mangaId}`, {
      params: {
        includes: ['author', 'artist', 'cover_art']
      }
    });

    const manga = data?.data;
    if (!manga) throw new Error('MangaDex details response missing data');

    const attrs = manga.attributes || {};
    const title = pickLocalizedValue(attrs.title, 'en', 'Unknown title');
    const description = pickLocalizedValue(attrs.description, 'en', '');

    const authorRel = (manga.relationships || []).find((r) => r.type === 'author');
    const artistRel = (manga.relationships || []).find((r) => r.type === 'artist');
    const coverRel = (manga.relationships || []).find((r) => r.type === 'cover_art');

    let coverImage = null;
    if (coverRel?.id) {
      const { data: coverData } = await http.get(`/cover/${coverRel.id}`);
      const fileName = coverData?.data?.attributes?.fileName;
      if (fileName) {
        coverImage = `https://uploads.mangadex.org/covers/${mangaId}/${fileName}`;
      }
    }

    return {
      title,
      description,
      cover_image: coverImage,
      source_path: `mangadex://${mangaId}`,
      author: authorRel?.attributes?.name || artistRel?.attributes?.name || null,
      status: attrs.status || 'unknown'
    };
  } catch (error) {
    console.error(`[mangadex] details failed: ${error.message}`);
    throw error;
  }
}

// ======================
// 📚 CHAPTER LIST
// ======================

export async function getLatestManga(limit = 20, offset = 0) {
  try {
    const params = new URLSearchParams();
    params.append('limit', String(limit));
    params.append('offset', String(offset));
    params.append('order[createdAt]', 'desc');

    const { data } = await http.get('/manga', { params });
    return (data?.data || []).map(mapMangaListItem);
  } catch (error) {
    console.error(`[mangadex] latest manga failed: ${error.message}`);
    return [];
  }
}

export async function getRecentlyUpdatedManga(limit = 20, offset = 0) {
  try {
    const params = new URLSearchParams();
    params.append('limit', String(limit));
    params.append('offset', String(offset));
    params.append('order[updatedAt]', 'desc');

    const { data } = await http.get('/manga', { params });
    return (data?.data || []).map(mapMangaListItem);
  } catch (error) {
    console.error(`[mangadex] updated manga failed: ${error.message}`);
    return [];
  }
}

export async function scrapeChapterList(mangaUrl) {
  const mangaId = String(mangaUrl || '').split('/').filter(Boolean).pop();
  if (!mangaId) throw new Error('Invalid manga ID');

  try {
    const fetchAll = async (translatedLanguage = ['en']) => {
      const chapters = [];
      const limit = 100;
      let offset = 0;

      while (true) {
        const params = new URLSearchParams();
        params.append('limit', String(limit));
        params.append('offset', String(offset));
        params.append('order[chapter]', 'asc');

        // ✅ SOLO agregar idiomas si hay
        if (translatedLanguage.length > 0) {
          for (const lang of translatedLanguage) {
            params.append('translatedLanguage[]', lang);
          }
        }

        // ✅ ENDPOINT CORRECTO
        const { data } = await http.get(`/manga/${mangaId}/feed`, { params });

        const items = data?.data || [];
        if (items.length === 0) break;

        for (const item of items) {
          const rawChapter = item.attributes?.chapter;
          const chapterNumber = toChapterNumber(rawChapter) || `special-${item.id}`;
          const language = item.attributes?.translatedLanguage || 'unknown';

          chapters.push({
            chapter_number: chapterNumber,
            title: item.attributes?.title || `Chapter ${chapterNumber}`,
            source_path: `mangadex://${item.id}`,
            url: item.id,
            language
          });
        }

        offset += limit;
        if (items.length < limit) break;
      }

      return chapters;
    };

    let chapters = await fetchAll(['en']);

    if (chapters.length === 0) {
      console.log('[mangadex] no EN chapters, trying ES...');
      chapters = await fetchAll(['es']);
    }

    if (chapters.length === 0) {
      console.log('[mangadex] no ES chapters, fetching ALL...');
      chapters = await fetchAll([]);
    }

    // dedupe
    const unique = new Map();
    for (const ch of chapters) {
      const key = `${ch.chapter_number}|${ch.language}`;
      if (!unique.has(key)) unique.set(key, ch);
    }

    return Array.from(unique.values());

  } catch (error) {
    console.error(`[mangadex] chapter list failed: ${error.message}`);
    return [];
  }
}

// ======================
// 🖼️ PAGES
// ======================
export async function scrapeChapterPages(chapterId) {
  if (!chapterId) return [];

  try {
    const { data } = await http.get(`/at-home/server/${chapterId}`);
    const baseUrl = data?.baseUrl;
    const chapter = data?.chapter;

    if (!baseUrl || !chapter?.hash || !Array.isArray(chapter.data)) {
      return [];
    }

    return chapter.data.map((fileName, index) => ({
      page_number: index + 1,
      image_url: `${baseUrl}/data/${chapter.hash}/${fileName}`
    }));
  } catch (error) {
    console.error(`[mangadex] page scrape failed for ${chapterId}: ${error.message}`);
    return [];
  }
}

export default {
  searchManga,
  scrapeMangaDetails,
  getLatestManga,
  getRecentlyUpdatedManga,
  getPopularManga,
  scrapeChapterList,
  scrapeChapterPages
};