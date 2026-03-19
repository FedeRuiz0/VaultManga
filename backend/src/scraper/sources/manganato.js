import axios from 'axios';
import cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';

const BASE_URL = 'https://manganato.com';
const DELAY_MS = 800;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function searchManga(query, limit = 5) {
  try {
    console.log('🔍 Searching manganato for:', query);
    const response = await axios.get(`${BASE_URL}/search?name=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(response.data);
    const results = [];
    
    $('.search-story-item').slice(0, limit).each((i, el) => {
      const link = $(el).find('a');
      const img = $(el).find('img');
      results.push({
        title: link.text().trim(),
        url: BASE_URL + link.attr('href'),
        slug: link.attr('href').split('/').pop(),
        cover: img.attr('src')
      });
    });
    
    console.log(`📖 Found ${results.length} results`);
    return results;
  } catch (error) {
    console.error('❌ Manganato search failed:', error.message);
    return [];
  }
}

export async function scrapeMangaDetails(mangaUrl) {
  try {
    console.log('📖 Scraping details:', mangaUrl);
    await delay(DELAY_MS);
    
    const response = await axios.get(mangaUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0...' } // same UA
    });
    const $ = cheerio.load(response.data);
    
    const title = $('.story-title h1').text().trim();
    const slug = mangaUrl.split('/').pop().replace(/\/$/, '');
    const desc = $('.panel-story-info-description p').text().trim();
    const cover = $('.cover-info img').attr('src') || $('.story-cover img').attr('src');
    
    const scrapedManga = {
      id: uuidv4(),
      title,
      description: desc,
      cover_image: cover ? (cover.startsWith('http') ? cover : BASE_URL + cover) : null,
      source_path: `manganato:${slug}`,
      author: $('.story-info-right p').first().next().text().trim() || null,
      artist: null, // parse if needed
      status: 'ongoing',
      genre: [], // parse tags
      year: null
    };
    
    return scrapedManga;
  } catch (error) {
    console.error('❌ Details scrape failed:', error.message);
    throw error;
  }
}

export async function scrapeChapterList(mangaUrl) {
  try {
    console.log('📚 Scraping chapter list:', mangaUrl);
    await delay(DELAY_MS);
    
    const response = await axios.get(mangaUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0...' }
    });
    const $ = cheerio.load(response.data);
    
    const chapters = [];
    $('.panel-story-chapter-list .row-content-chapter li').each((i, el) => {
      const link = $(el).find('a');
      const titleMatch = link.text().match(/Chapter\s+(\d+(?:\.\d+)?)/i);
      const chapterNum = titleMatch ? titleMatch[1] : `ch-${i}`;
      
      chapters.unshift({ // latest first
        chapter_number: chapterNum,
        title: link.text().trim(),
        url: BASE_URL + link.attr('href'),
        source_path: null // set later
      });
    });
    
    console.log(`📚 Found ${chapters.length} chapters`);
    return chapters;
  } catch (error) {
    console.error('❌ Chapter list failed:', error.message);
    return [];
  }
}

export async function scrapeChapterPages(chapterUrl) {
  try {
    console.log('🖼️  Scraping pages:', chapterUrl);
    await delay(DELAY_MS);
    
    const response = await axios.get(chapterUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0...' }
    });
    const $ = cheerio.load(response.data);
    
    const pages = [];
    $('.container-chapter-reader img').each((i, el) => {
      const imgSrc = $(el).attr('src');
      if (imgSrc && imgSrc.includes('.jpg') || imgSrc.includes('.png')) {
        pages.push({
          page_number: pages.length + 1,
          image_url: imgSrc.startsWith('http') ? imgSrc : BASE_URL + imgSrc,
          image_path: null
        });
      }
    });
    
    console.log(`🖼️  Found ${pages.length} pages`);
    return pages;
  } catch (error) {
    console.error('❌ Page scrape failed:', error.message);
    return [];
  }
}

export default { searchManga, scrapeMangaDetails, scrapeChapterList, scrapeChapterPages };

