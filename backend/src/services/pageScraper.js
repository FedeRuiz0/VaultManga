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

  async getChapterPages(chapterId) {
    try {
      console.log(`📄 Fetching pages for chapter: ${chapterId}`);
      
      // Get available servers
      const serversRes = await safeGet.get(`${this.baseURL}/at-home/server/${chapterId}`, {}, { label: `at-home: ${chapterId}`});
      const server = serversRes.data;
      
      if (!server.baseUrl || !server.chapter.hash) {
        console.error('Invalid server response:', server);
        return [];
      }

      // Build image base URL
      const imageBase = `${server.baseUrl}/data/${server.chapter.hash}`;
      
      console.log(`📊 Server: ${server.baseUrl}, Hash: ${server.chapter.hash}`);
      
      return {
        baseUrl: imageBase,
        hash: server.chapter.hash,
        chapterId: chapterId,
        data: server.chapter.data,
        dataSaver: server.chapter.dataSaver
      };
    } catch (error) {
      console.error('Page fetch error:', error.response?.data || error.message);
      return null;
    }
  }

  async importPages(chapterId, mangadexChapterId = null) {
    try {
      const sourceChapterId = mangadexChapterId || chapterId;
      const pagesInfo = await this.getChapterPages(sourceChapterId);
      if (!pagesInfo) {
        console.log('❌ No pages data available');
        await query(`
          UPDATE chapters
          SET page_fetched = TRUE, updated_at = NOW()
          WHERE id = $1
        `, [chapterId]);
        return 0;
      }

      console.log(`🔄 Importing pages for chapter ${chapterId}: ${pagesInfo.data.length} pages`);

      let importedCount = 0;

      for (let i = 0; i < pagesInfo.data.length; i++) {
        try {
          const pageId = uuidv4();
          const imageUrl = `${pagesInfo.baseUrl}/${pagesInfo.data[i]}`;
          
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
            imageUrl, // Use URL as path for now
            null, // file_size will be updated later if downloaded
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

      // Update chapter page count
      await query(`
        UPDATE chapters 
        SET page_count = $1, pages_fetched = TRUE, updated_at = NOW()
        WHERE id = $2
      `, [pagesInfo.data.length, chapterId]);

      // Invalidate caches
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

