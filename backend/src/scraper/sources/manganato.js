import axios from 'axios';
import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';

const BASE_URL = 'https://manganato.com';
const CHAPTER_BASE = 'https://chapmanganato.com';
const DELAY_MS = 800;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.google.com/'
};

// 🔍 SEARCH
export async function searchManga(query, limit = 5) {
  try {
    console.log('🔍 Searching MangaDex:', query);

    const res = await axios.get(
      `https://api.mangadex.org/manga`,
      {
        params: {
          title: query,
          limit
        }
      }
    );

    const results = res.data.data.map(m => ({
      title: m.attributes.title.en || Object.values(m.attributes.title)[0],
      url: `https://api.mangadex.org/manga/${m.id}`,
      slug: m.id,
      cover: m.relationships.find(r => r.type === 'cover_art')?.id || null,
      mangadexId: m.id
    }));

    console.log(`📖 Found ${results.length} results (MangaDex)`);
    return results;

  } catch (err) {
    console.error('❌ MangaDex search failed:', err.message);
    return [];
  }
}

// 📖 DETAILS
export async function scrapeMangaDetails(mangaUrl) {
  try {
    const response = await axios.get(mangaUrl);
    
    const data = response.data.data;
    const attributes = data.attributes;

    const title =
      attributes.title.en ||
      Object.values(attributes.title)[0];

    const description =
      attributes.description?.en || '';

    const coverRel = data.relationships.find(
      r => r.type === 'cover_art'
    );

    const coverFile = coverRel?.attributes?.fileName;

    const cover_image = coverFile
      ? `https://uploads.mangadex.org/covers/${data.id}/${coverFile}.256.jpg`
      : null;

    return {
      id: data.id,
      title,
      description,
      cover_image,
      source_path: `mangadex:${data.id}`,
      author: null,
      status: attributes.status,
    };

  } catch (error) {
    console.error('❌ MangaDex details failed:', error.message);
    throw error;
  }
}

// 📚 CHAPTER LIST
export async function scrapeChapterList(mangaUrl) {
  try {
    console.log('📚 Fetching chapters from MangaDex API');

    const mangaId = mangaUrl.split('/').pop();

    const res = await axios.get(
      `https://api.mangadex.org/chapter`,
      {
        params: {
          manga: mangaId,
          limit: 100,
          order: { chapter: 'asc' }
        }
      }
    );

    const chapters = res.data.data.map(ch => ({
      chapter_number: ch.attributes.chapter || '0',
      title: ch.attributes.title || `Chapter ${ch.attributes.chapter}`,
      url: ch.id, // usamos ID como referencia
      source_path: `mangadex:${ch.id}`
    }));

    console.log(`📚 Found ${chapters.length} chapters`);
    return chapters;

  } catch (error) {
    console.error('❌ MangaDex chapters failed:', error.message);
    return [];
  }
}

// 🖼️ PAGES
export async function scrapeChapterPages(chapterId) {
  try {
    console.log('🖼️ Fetching pages from MangaDex:', chapterId);

    const res = await axios.get(
      `https://api.mangadex.org/at-home/server/${chapterId}`
    );

    const { baseUrl, chapter } = res.data;

    const pages = chapter.data.map((file, i) => ({
      page_number: i + 1,
      image_url: `${baseUrl}/data/${chapter.hash}/${file}`,
      image_path: null
    }));

    console.log(`🖼️ Found ${pages.length} pages`);
    return pages;

  } catch (error) {
    console.error('❌ MangaDex pages failed:', error.message);
    return [];
  }
}

export default {
  searchManga,
  scrapeMangaDetails,
  scrapeChapterList,
  scrapeChapterPages
};