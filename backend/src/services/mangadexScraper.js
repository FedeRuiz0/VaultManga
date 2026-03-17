import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/database.js';
import { mangaCache } from '../db/redis.js';

class MangaDexScraper {
  constructor() {
    this.baseURL = 'https://api.mangadex.org';
    this.delay = 1500; // Ethical rate limit (1.5s per request)
  }

  async searchManga(query, limit = 10) {
    try {
      const response = await axios.get(`${this.baseURL}/manga`, {
        params: {
          title: query,
          limit,
          includes: ['cover_art']
        }
      });

      return response.data.data;
    } catch (error) {
      console.error('MangaDex search error:', error.response?.data || error.message);
      return [];
    }
  }

  async getMangaDetails(id) {
    try {
      const response = await axios.get(`${this.baseURL}/manga/${id}`, {
        params: { includes: ['cover_art', 'author', 'artist', 'tag'] }
      });

      const manga = response.data.data;
      const cover = response.data.includes?.find(i => i.type === 'cover_art') || {};
      
      return {
        id: manga.id,
        title: manga.attributes.title.en || Object.values(manga.attributes.title)[0] || 'Unknown',
        description: manga.attributes.description?.en || '',
        cover_image: cover.attributes?.fileName ? `https://uploads.mangadex.org/covers/${manga.id}/${cover.attributes.fileName}.512.jpg` : null,
        genre: manga.attributes.tags?.map(t => t.attributes.name.en) || [],
        status: manga.attributes.status || 'ongoing',
        year: manga.attributes.year || null,
        author: manga.attributes.authors?.[0]?.attributes.name || '',
        artist: manga.attributes.artists?.[0]?.attributes.name || ''
      };
    } catch (error) {
      console.error('MangaDex details error:', error.response?.data || error.message);
      return null;
    }
  }

  async getPopularManga(limit = 50) {
    try {
      const response = await axios.get(`${this.baseURL}/manga`, {
        params: {
          limit,
          order: { rating: 'desc' },
          includes: ['cover_art']
        }
      });

      return response.data.data;
    } catch (error) {
      console.error('Popular manga error:', error.response?.data || error.message);
      return [];
    }
  }

async getChapters(mangaDexId) {
    try {
      console.log(`📖 Fetching chapters for manga: ${mangaDexId}`);
      const response = await axios.get(`${this.baseURL}/chapter`, {
        params: {
          manga: mangaDexId,
          translatedLanguage: ['en'],
          limit: 500,
          order: { 'chapter': 'asc' },
          includes: []
        }
      });

      console.log(`Found ${response.data.total} chapters`);
      return response.data.data;
    } catch (error) {
      console.error('Chapters fetch error:', error.response?.data || error.message);
      return [];
    }
  }

async importChapters(mangaId, mangaDexId) {
    const client = await queryPool.connect();
    try {
      await client.query('BEGIN');

      const chapters = await this.getChapters(mangaDexId);
      let importedCount = 0;

      console.log(`📚 Importing ${chapters.length} chapters for manga ${mangaId}`);

      for (const chapter of chapters) {
        const attrs = chapter.attributes;
        const mangadexChapterId = chapter.id;
        const dbChapterId = uuidv4();

        // Upsert chapter - avoid duplicates on mangadex_chapter_id
        const result = await client.query(`
          INSERT INTO chapters (
            id, manga_id, mangadex_chapter_id, chapter_number, volume, 
            title, language, published_at, page_count
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)
          ON CONFLICT (mangadex_chapter_id) DO UPDATE SET
            title = EXCLUDED.title,
            chapter_number = EXCLUDED.chapter_number,
            updated_at = NOW()
          RETURNING id
        `, [
          dbChapterId,
          mangaId,
          mangadexChapterId,
          attrs.chapter || '0',
          attrs.volume || null,
          attrs.title?.en || `Chapter ${attrs.chapter || '?'}`, 
          attrs.translatedLanguage || 'en',
          attrs.publishAt ? new Date(attrs.publishAt).toISOString() : null
        ]);

        importedCount++;

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      await client.query('COMMIT');
      console.log(`✅ Transaction committed: ${importedCount} chapters for ${mangaId}`);
      return importedCount;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Chapter import transaction failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async importManga(mangaData) {
    try {
      // Check duplicate
      const exists = await query(
        'SELECT id FROM manga WHERE LOWER(title) = LOWER($1)',
        [mangaData.title]
      );

    if (exists.rowCount > 0) {
  console.log(`Manga exists: ${mangaData.title}`);

  const mangaId = exists.rows[0].id;

  console.log(`📚 Importing chapters for existing manga: ${mangaData.title}`);

  await this.importChapters(mangaId, mangaData.id);

  return mangaId;
}

      // Convert genre array to PostgreSQL array literal
      const genreArray = JSON.stringify(mangaData.genre || []);

      const result = await query(
        `INSERT INTO manga (id, title, description, cover_image, genre, status, year, author, artist, source_path)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          uuidv4(),
          mangaData.title,
          mangaData.description,
          mangaData.cover_image,
          genreArray,
          mangaData.status,
          mangaData.year,
          mangaData.author,
          mangaData.artist,
          `mangadex://${mangaData.id}`
        ]
      );

      const mangaId = result.rows[0].id;
      
      // Invalidate cache
      await mangaCache.cacheDeletePattern?.('manga:*');

      console.log(`✅ Imported manga: ${mangaData.title} (ID: ${mangaId})`);

      // AUTO IMPORT CHAPTERS
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
        const mangaId = mangas[i];
        console.log(`📥 Scraping ${i+1}/${Math.min(mangas.length, count)}: ${mangaId.id}`);
        
        // Ethical delay
        await new Promise(resolve => setTimeout(resolve, this.delay));
        
        const details = await this.getMangaDetails(mangaId.id);
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

