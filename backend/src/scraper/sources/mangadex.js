import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const BASE_URL = 'https://api.mangadex.org';

// ======================
// 🔍 SEARCH
// ======================
export async function searchManga(query, limit = 5) {
  try {
    console.log('🔍 Searching MangaDex:', query);

    const res = await axios.get(`${BASE_URL}/manga`, {
      params: {
        title: query,
        limit
      }
    });

    const results = res.data.data.map(m => ({
      title:
        m.attributes.title?.en ||
        Object.values(m.attributes.title || {})[0] ||
        'Unknown title',
      url: `${BASE_URL}/manga/${m.id}`,
      id: m.id
    }));

    console.log(`📖 Found ${results.length} results (MangaDex)`);
    return results;

  } catch (err) {
    console.error('❌ MangaDex search failed:', err.message);
    return [];
  }
}

// ======================
// 📖 DETAILS
// ======================
export async function scrapeMangaDetails(mangaUrl) {
  try {
    console.log('📖 Scraping details:', mangaUrl);

    const res = await axios.get(mangaUrl);
    const data = res.data.data;

    const title =
      data.attributes.title?.en ||
      Object.values(data.attributes.title || {})[0] ||
      'Unknown title';

    const description =
      data.attributes.description?.en ||
      Object.values(data.attributes.description || {})[0] ||
      '';

    
    let cover = null;
    const coverRel = res.data.data.relationships?.find(r => r.type === 'cover_art');

    if (coverRel) {
      const coverRes = await axios.get(`${BASE_URL}/cover/${coverRel.id}`);
      const fileName = coverRes.data.data.attributes.fileName;
      cover = `https://uploads.mangadex.org/covers/${data.id}/${fileName}`;
    }

    return {
      id: uuidv4(),
      title,
      description,
      cover_image: cover,
      source_path: `mangadex:${data.id}`,
      author: null,
      status: data.attributes.status || 'unknown'
    };

  } catch (err) {
    console.error('❌ Details failed:', err.message);
    throw err;
  }
}

export async function clearScrapeProgress(mangaId) {
  try {
    await cacheDelete(`scraper:progress:${mangaId}`);
    console.log('🗑️ Progress cleared');
  } catch {}
}

// ======================
// 📚 CHAPTER LIST
// ======================
export async function scrapeChapterList(mangaUrl) {
  try {
    console.log('📚 Fetching chapters from MangaDex API');

    const mangaId = mangaUrl.split('/').pop();

    let allChapters = [];
    let offset = 0;
    const limit = 100;

    // 🔥 PAGINACIÓN REAL
    while (true) {
      const res = await axios.get(`${BASE_URL}/chapter`, {
        params: {
          manga: mangaId,
          limit,
          offset,
          translatedLanguage: ['en'],
          order: { chapter: 'asc' }
        }
      });

      const data = res.data.data;

      if (!data.length) break;

      const parsed = data
        .filter(ch => ch.attributes.chapter)
        .map(ch => ({
          chapter_number: parseFloat(ch.attributes.chapter),
          title: ch.attributes.title || `Chapter ${ch.attributes.chapter}`,
          url: ch.id,
          source_path: `mangadex:${mangaId}`
        }));

      allChapters.push(...parsed);

      offset += limit;

      if (data.length < limit) break;
    }

    // 🔥 ORDEN FINAL (por si acaso)
    allChapters.sort((a, b) => a.chapter_number - b.chapter_number);

    console.log(`📚 Found ${allChapters.length} chapters`);

    return allChapters;

  } catch (err) {
    console.error('❌ Chapter list failed:', err.message);
    return [];
  }
}

// ======================
// 🖼️ PAGES
// ======================
export async function scrapeChapterPages(chapterId) {
  try {
    console.log('🖼️ Fetching pages for chapter:', chapterId);

    const res = await axios.get(`${BASE_URL}/at-home/server/${chapterId}`);

    const { baseUrl, chapter } = res.data;

    if (!chapter?.data?.length) {
      console.log('⚠️ No pages found');
      return [];
    }

    return chapter.data.map((file, i) => ({
      page_number: i + 1,
      image_url: `${baseUrl}/data/${chapter.hash}/${file}`
    }));

  } catch (err) {
    console.error('❌ Page scrape failed:', err.message);
    return [];
  }
}

export default {
  searchManga,
  scrapeMangaDetails,
  scrapeChapterList,
  scrapeChapterPages
};