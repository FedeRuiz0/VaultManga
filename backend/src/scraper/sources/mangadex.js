import axios from 'axios';
import mangadexService from '../../services/mangadex.service.js';

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

export async function searchManga(query, limit = 5) {
  const items = await mangadexService.searchMangaByTitle(query, limit);
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    url: `/manga/${item.id}`
  }));
}

export async function scrapeMangaDetails(mangaUrl) {
  const mangaId = String(mangaUrl || '').split('/').filter(Boolean).pop();
  if (!mangaId) {
    throw new Error('Invalid manga URL/path for MangaDex details');
  }

  const { data } = await http.get(`/manga/${mangaId}`, {
    params: {
      includes: ['cover_art', 'author', 'artist']
    }
  });

  const manga = data?.data;
  if (!manga) throw new Error('MangaDex details response missing data');

  const title = pickLocalizedValue(manga.attributes?.title, 'en', 'Unknown title');
  const description = pickLocalizedValue(manga.attributes?.description, 'en', '');
  const coverRel = (data?.includes || []).find((item) => item.type === 'cover_art');
  const coverFile = coverRel?.attributes?.fileName;

  return {
    title,
    description,
    cover_image: coverFile
      ? `https://uploads.mangadex.org/covers/${mangaId}/${coverFile}.512.jpg`
      : null,
    source_path: `mangadex://${mangaId}`,
    author: null,
    status: manga.attributes?.status || 'unknown'
  };
}

export async function scrapeChapterList(mangaUrl) {
  const mangaId = String(mangaUrl || '').split('/').filter(Boolean).pop();
  if (!mangaId) throw new Error('Invalid manga ID');

  const chapters = await mangadexService.fetchChapters(mangaId);
  return chapters.map((chapter) => ({
  chapter_number: chapter.chapterNumber,
  title: chapter.title,
  source_path: chapter.source_path,
  url: chapter.chapterId,
  language: chapter.language || 'unknown'
}));
}

export async function scrapeChapterPages(chapterId) {
  const pages = await mangadexService.fetchPages(chapterId);
  return pages.map((imageUrl, index) => ({
    page_number: index + 1,
    image_url: imageUrl
  }));
}

export default {
  searchManga,
  scrapeMangaDetails,
  scrapeChapterList,
  scrapeChapterPages
};