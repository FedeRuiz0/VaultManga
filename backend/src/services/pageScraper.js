import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/database.js';
import { safeGet } from './safeRequest.js';
import { mangaCache } from '../db/redis.js';

class MangaDexPageScraper {
  constructor() {
    this.baseURL = 'https://api.mangadex.org';
    this.serverBase = 'https://api.mangadex.network';
    this.delay = 1000; // 1s per page request (ethical)
  }

  extractMangadexChapterId(rawSource) {
    if (!rawSource || typeof rawSource !== 'string') {
      return null;
    }

    const trimmed = rawSource.trim();
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

    if (trimmed.startsWith('mangadex://')) {
      const candidate = trimmed.replace('mangadex://', '').trim();
      return candidate.match(uuidPattern)?.[0] || null;
    }

    if (trimmed.startsWith('mangadex:')) {
      const candidate = trimmed.replace('mangadex:', '').trim();
      return candidate.match(uuidPattern)?.[0] || null;
    }

    const chapterPathMatch = trimmed.match(/\/chapter\/([0-9a-f-]{36})/i);
    if (chapterPathMatch?.[1]) {
      return chapterPathMatch[1];
    }

    return trimmed.match(uuidPattern)?.[0] || null;
  }

  async getChapterPages(chapterId) {
    const extractedId = String(chapterId || '').match(/[0-9a-f-]{36}/i)?.[0] || null;
    if (!extractedId) {
      console.warn(`⚠️ Invalid MangaDex chapter ID, skipping scrape: ${chapterId}`);
      return null;
    }
  try {
    console.log(`📄 Fetching pages for chapter: ${chapterId}`);
    console.log('📦 Requesting MangaDex at-home with:', extractedId);

    // Get available servers
    const serversRes = await safeGet.get(`${this.baseURL}/at-home/server/${extractedId}`, {}, { label: `at-home: ${extractedId}`});
    const server = serversRes.data;

    console.log('📦 RAW MangaDex response:', server);
    console.log('📦 server.baseUrl:', server?.baseUrl);
    console.log('📦 server.chapter.hash:', server?.chapter?.hash);
    console.log('📦 data length:', server?.chapter?.data?.length);

    if (!server?.baseUrl || !server?.chapter?.hash || !server?.chapter?.data) {
      console.error('❌ Invalid MangaDex server response:', server);
      return null;
    }

    // build image base URL
    const imageBase = `${server.baseUrl}/data/${server.chapter.hash}`;

    console.log(`📊 Server: ${server.baseUrl}, Hash: ${server.chapter.hash}`);
    console.log('📦 pagesInfo:', server.chapter.data?.length);

    return {
      baseUrl: imageBase,
      hash: server.chapter.hash,
      chapterId: extractedId,
      data: server.chapter.data,
      dataSaver: server.chapter.dataSaver
    };
  } catch (error) {
    console.error('Page fetch error:', error.response?.data || error.message);
    return null;
  }
}

async importPages(chapterId, mangadexChapterId = null) {
  console.log('🔥 importPages called:', chapterId);
  try {
    const sourceChapterId = mangadexChapterId || chapterId;
    const pagesInfo = await this.getChapterPages(sourceChapterId);

    if (!pagesInfo || !Array.isArray(pagesInfo.data) || pagesInfo.data.length === 0) {
      console.error('❌ INVALID pagesInfo:', pagesInfo);
      await query(`
        UPDATE chapters
        SET pages_fetched = TRUE, updated_at = NOW()
        WHERE id = $1
      `, [chapterId]);
      return 0;
    }

    console.log(`🔄 Importing pages for chapter ${chapterId}: ${pagesInfo.data.length} pages`);
    console.log('📦 pages to import:', pagesInfo.data);

    let importedCount = 0;

    for (let i = 0; i < pagesInfo.data.length; i++) {
      try {
        const pageId = uuidv4();
        const imageUrl = `${pagesInfo.baseUrl}/${pagesInfo.data[i]}`;

        console.log('🧩 INSERT page:', i + 1, imageUrl);

        await query(`
          INSERT INTO pages (
            id, chapter_id, page_number, image_url, image_path,
            file_size, is_cached, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (chapter_id, page_number) DO UPDATE SET
            image_url = EXCLUDED.image_url,
            image_path = EXCLUDED.image_path
        `, [
          pageId,
          chapterId,
          i + 1,
          imageUrl,
          imageUrl,
          null,
          false
        ]);

        importedCount++;

        // Ethical delay between page requests
        if (i < pagesInfo.data.length - 1) {
          await new Promise(resolve => setTimeout(resolve, this.delay));
        }
      } catch (pageError) {
        console.error(`❌ Page ${i + 1} error:`, pageError.message);
      }
    }

    await query(`
      UPDATE chapters
      SET page_count = $1, pages_fetched = TRUE, updated_at = NOW()
      WHERE id = $2
    `, [pagesInfo.data.length, chapterId]);

    const chapter = await queryOne('SELECT manga_id FROM chapters WHERE id = $1', [chapterId]);
    if (chapter) {
      await mangaCache.cacheDelete(`pages:${chapterId}`);
      await mangaCache.invalidateChapters(chapter.manga_id);
    }

    console.log(`✅ Imported ${importedCount} pages for chapter ${chapterId}`);
    return importedCount;
  } catch (error) {
    console.error('importPages error:', error);
    return 0;
  }
}
}

export default new MangaDexPageScraper();