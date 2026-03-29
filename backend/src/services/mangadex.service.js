import axios from 'axios';

const BASE_URL = 'https://api.mangadex.org';
const HTTP_TIMEOUT_MS = Number(process.env.SCRAPER_HTTP_TIMEOUT_MS || 15000);
const FEED_LIMIT = 100;

const client = axios.create({
  baseURL: BASE_URL,
  timeout: HTTP_TIMEOUT_MS,
  headers: {
    'User-Agent': 'VaultManga/1.0',
  },
});


function pickLocalizedText(data, preferred = 'en', fallback = '') {
  if (!data || typeof data !== 'object') return fallback;
  if (data[preferred]) return data[preferred];
  const first = Object.values(data).find(Boolean);
  return first || fallback;
}

async function request(config, logContext = {}) {
  const endpoint = `${config.method || 'GET'} ${config.url}`;

  console.log('[mangadex] request:start', {
    endpoint,
    mangaId: logContext.mangaId || null,
    chapterId: logContext.chapterId || null,
    params: config.params || null,
  });

  const response = await client.request(config);

  const chaptersCount = Array.isArray(response.data?.data)
    ? response.data.data.length
    : 0;

  const pagesCount = Array.isArray(response.data?.chapter?.data)
    ? response.data.chapter.data.length
    : 0;

  console.log('[mangadex] request:done', {
    endpoint,
    mangaId: logContext.mangaId || null,
    chapterId: logContext.chapterId || null,
    chaptersCount,
    pagesCount,
  });

  return response.data;
}

async function fetchCoverByMangaId(mangaId) {
  try {
    const data = await request(
      {
        method: 'GET',
        url: '/cover',
        params: {
          manga: [mangaId],
          limit: 1,
        },
      },
      { mangaId }
    );

    const cover = data?.data?.[0];
    const fileName = cover?.attributes?.fileName;

    if (!fileName) return null;

    return `https://uploads.mangadex.org/covers/${mangaId}/${fileName}.512.jpg`;
  } catch (error) {
    console.warn('[mangadex] cover fetch failed', {
      mangaId,
      message: error.response?.data || error.message,
    });
    return null;
  }
}

export async function searchMangaByTitle(title, limit = 10) {
  if (!title || !String(title).trim()) return [];

  const data = await request({
    method: 'GET',
    url: '/manga',
    params: {
      title,
      limit,
      includes: ['cover_art'],
    },
  });

  const items = data.data || [];
  const includes = data.includes || [];

  return items.map((item) => ({
    id: item.id,
    title: pickLocalizedText(item.attributes?.title, 'en', 'Unknown title'),
    description: pickLocalizedText(item.attributes?.description, 'en', ''),
    cover: buildCoverUrlFromIncludes(item, includes),
    cover_image: buildCoverUrlFromIncludes(item, includes),
  }));
}

async function getMangaById(mangaId) {
  if (!mangaId) return null;

  const data = await request(
    {
      method: 'GET',
      url: `/manga/${mangaId}`,
    },
    { mangaId }
  );

  const item = data?.data;
  if (!item) return null;

  const attributes = item.attributes || {};
  const coverUrl = await fetchCoverByMangaId(mangaId);

  return {
    id: item.id,
    title: pickLocalizedText(attributes.title, 'en', 'Unknown title'),
    description: pickLocalizedText(attributes.description, 'en', ''),
    cover: coverUrl,
    cover_image: coverUrl,
    status: attributes.status || 'ongoing',
  };
}

async function fetchAtHome(chapterId) {
  try {
    return await request(
      {
        method: 'GET',
        url: `/at-home/server/${chapterId}`,
      },
      { chapterId }
    );
  } catch (error) {
    console.warn('[mangadex] at-home failed', {
      chapterId,
      message: error.response?.data || error.message,
    });
    return null;
  }
}

async function fetchPages(chapterId) {
  const payload = await fetchAtHome(chapterId);

  const baseUrl = payload?.baseUrl;
  const hash = payload?.chapter?.hash;
  const files = payload?.chapter?.data;

  if (!baseUrl || !hash || !Array.isArray(files) || files.length === 0) {
    console.log('[mangadex] fetchPages empty', {
      chapterId,
      pagesCount: 0,
    });
    return [];
  }

  const pages = files.map((filename) => `${baseUrl}/data/${hash}/${filename}`);

  console.log('[mangadex] fetchPages done', {
    chapterId,
    pagesCount: pages.length,
  });

  return pages;
}

async function fetchChapters(mangaId) {
  const chapters = [];
  let offset = 0;

  while (true) {
    const data = await request(
      {
        method: 'GET',
        url: `/manga/${mangaId}/feed`,
        params: {
          limit: FEED_LIMIT,
          offset,
          translatedLanguage: ['es', 'en', 'pt-br'],
          'order[chapter]': 'asc',
        },
      },
      { mangaId }
    );

    const items = data?.data || [];
    if (items.length === 0) break;

    for (const item of items) {
      const chapterNumber = String(item?.attributes?.chapter || '').trim();
      if (!chapterNumber) continue;

      const chapterId = item.id;

      chapters.push({
        chapterId,
        chapterNumber,
        title: item.attributes?.title || `Chapter ${chapterNumber}`,
        source_path: `mangadex://${chapterId}`,
        language: item.attributes?.translatedLanguage || 'unknown',
      });
    }

    offset += FEED_LIMIT;
    if (items.length < FEED_LIMIT) break;
  }

  console.log('[mangadex] fetchChapters done', {
    mangaId,
    chaptersCount: chapters.length,
  });

  return chapters;
}

export default {
  searchMangaByTitle,
  getMangaById,
  fetchChapters,
  fetchPages,
  fetchAtHome,
};