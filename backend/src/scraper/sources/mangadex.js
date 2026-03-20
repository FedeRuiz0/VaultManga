import axios from 'axios';

const BASE_URL = 'https://api.mangadex.org';
const DEFAULT_TIMEOUT_MS = Number(process.env.SCRAPER_HTTP_TIMEOUT_MS || 15000);

const http = axios.create({
  baseURL: BASE_URL,
  timeout: DEFAULT_TIMEOUT_MS,
  headers: {
    'User-Agent': 'VaultManga/1.0 (+https://github.com)',
    Accept: 'application/json'
  }
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

// ======================
// 🔍 SEARCH
// ======================
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
      source_path: `mangadex:${mangaId}`,
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
export async function scrapeChapterList(mangaUrl) {
  const mangaId = String(mangaUrl || '').split('/').filter(Boolean).pop();
  if (!mangaId) {
    throw new Error('Invalid manga URL/path for MangaDex chapter list');
  }

  try {
    const chapters = [];
    const limit = 100;
    let offset = 0;

    while (true) {
      const { data } = await http.get('/chapter', {
        params: {
          manga: mangaId,
          translatedLanguage: ['en', 'es', 'pt-br', 'ja', 'it'],
          limit,
          offset,
          includes: ['scanlation_group'],
          order: { chapter: 'asc' }
        }
      });

      const items = data?.data || [];
      if (items.length === 0) break;

      for (const item of items) {
        const chapterNumber = toChapterNumber(item.attributes?.chapter);
        if (!chapterNumber) continue;

        chapters.push({
          chapter_number: chapterNumber,
          title: item.attributes?.title || `Chapter ${chapterNumber}`,
          source_path: `mangadex:${item.id}`,
          url: item.id
        });
      }

      offset += limit;
      if (items.length < limit) break;
    }

    return chapters;

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
  scrapeChapterList,
  scrapeChapterPages
};