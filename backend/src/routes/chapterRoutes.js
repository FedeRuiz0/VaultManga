import express from 'express';
import { query, queryOne, queryAll } from '../db/database.js';
import { mangaCache } from '../db/redis.js';

const router = express.Router();

// Get chapters for a manga
router.get('/manga/:mangaId', async (req, res, next) => {
  try {
    const { mangaId } = req.params;
    const { sort = 'asc' } = req.query;

    // Try cache first
    const cached = await mangaCache.getChapters(mangaId);
    if (cached) {
      return res.json(cached);
    }

    let chapters = [];
    const order = sort === 'desc' ? 'DESC' : 'ASC';
    
    // First check count
    const countResult = await queryOne('SELECT COUNT(*) as count FROM chapters WHERE manga_id = $1', [mangaId]);
    const chapterCount = parseInt(countResult.count);

    if (chapterCount === 0) {
      console.log(`⚠️ No chapters found for manga ${mangaId}. Checking for auto-import...`);
      
      // Get manga source
      const manga = await queryOne('SELECT source_path FROM manga WHERE id = $1', [mangaId]);
      if (manga && manga.source_path && manga.source_path.startsWith('mangadex://')) {
        const mangaDexId = manga.source_path.replace('mangadex://', '');
        console.log(`🚀 Auto-importing chapters from MangaDex ID: ${mangaDexId}`);
        
        const { default: mangaDexScraper } = await import('../services/mangadexScraper.js');
        const imported = await mangaDexScraper.importChapters(mangaId, mangaDexId);
        console.log(`✅ Imported ${imported} chapters`);
        
        // Re-fetch chapters
        chapters = await queryAll(`
          SELECT 
            c.*,
            COALESCE(p.total_pages, 0) as total_pages,
            COALESCE(p.cached_pages, 0) as cached_pages
          FROM chapters c
          LEFT JOIN (
            SELECT 
              chapter_id,
              COUNT(*) as total_pages,
              COUNT(*) FILTER (WHERE is_cached) as cached_pages
            FROM pages
            GROUP BY chapter_id
          ) p ON c.id = p.chapter_id
          WHERE c.manga_id = $1
          ORDER BY c.chapter_number::numeric ${order}
        `, [mangaId]);
      } else {
        console.log(`❌ Cannot auto-import. Source path: ${manga?.source_path || 'null'}`);
      }
    } else {
      chapters = await queryAll(`
        SELECT 
          c.*,
          COALESCE(p.total_pages, 0) as total_pages,
          COALESCE(p.cached_pages, 0) as cached_pages
        FROM chapters c
        LEFT JOIN (
          SELECT 
            chapter_id,
            COUNT(*) as total_pages,
            COUNT(*) FILTER (WHERE is_cached) as cached_pages
        FROM pages
        GROUP BY chapter_id
        ) p ON c.id = p.chapter_id
        WHERE c.manga_id = $1
        ORDER BY c.chapter_number::numeric ${order}
      `, [mangaId]);
    }

    // Cache the result
    await mangaCache.setChapters(mangaId, chapters);

    res.json(chapters);
  } catch (error) {
    console.error('Chapters endpoint error:', error);
    next(error);
  }
});


// Get single chapter with auto page import
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const chapter = await queryOne(`
      SELECT c.*, c.mangadex_id
FROM chapters c
WHERE c.id = $1
    `, [id]);

    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    // Check if pages exist
    const pageCountResult = await queryOne(
      'SELECT COUNT(*) as count FROM pages WHERE chapter_id = $1', 
      [id]
    );
    
    if (parseInt(pageCountResult.count) === 0 && chapter.source_path && chapter.source_path.startsWith('mangadex://')) {
      
      const { default: pageScraper } = await import('../services/pageScraper.js');
      const mangadexChapterId = chapter.source_path.replace('mangadex://', '');
      const imported = await pageScraper.importPages(id, mangadexChapterId);
      console.log(`✅ Imported ${imported} pages for chapter ${id}`);
      
      // Refresh chapter data
      const refreshedChapter = await queryOne(`
        SELECT 
          c.*,
          m.id as manga_id,
          m.title as manga_title
        FROM chapters c
        JOIN manga m ON c.manga_id = m.id
        WHERE c.id = $1
      `, [id]);
      
      res.json(refreshedChapter);
    } else {
      res.json(chapter);
    }
  } catch (error) {
    console.error('Chapter get error:', error);
    next(error);
  }
});


// Create chapter
router.post('/', async (req, res, next) => {
  try {
    const { 
      manga_id, 
      chapter_number, 
      volume, 
      title, 
      source_path,
      page_count = 0
    } = req.body;

    if (!manga_id || !chapter_number || !source_path) {
      return res.status(400).json({ error: 'Manga ID, chapter number, and source path are required' });
    }

    const chapter = await queryOne(`
      INSERT INTO chapters (
        manga_id, chapter_number, volume, title, source_path, page_count
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (manga_id, chapter_number) 
      DO UPDATE SET source_path = $5, page_count = $6
      RETURNING *
    `, [manga_id, chapter_number, volume, title, source_path, page_count]);

    // Invalidate chapters cache
    await mangaCache.invalidateChapters(manga_id);
    await mangaCache.invalidateManga(manga_id);

    res.status(201).json(chapter);
  } catch (error) {
    next(error);
  }
});

// Update chapter
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { 
      chapter_number, 
      volume, 
      title, 
      page_count,
      is_read,
      is_downloaded,
      read_progress
    } = req.body;

    const chapter = await queryOne(`
      UPDATE chapters SET
        chapter_number = COALESCE($2, chapter_number),
        volume = COALESCE($3, volume),
        title = COALESCE($4, title),
        page_count = COALESCE($5, page_count),
        is_read = COALESCE($6, is_read),
        is_downloaded = COALESCE($7, is_downloaded),
        read_progress = COALESCE($8, read_progress),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id, chapter_number, volume, title, page_count, is_read, is_downloaded, read_progress]);

    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    // Invalidate cache
    await mangaCache.invalidateChapters(chapter.manga_id);

    res.json(chapter);
  } catch (error) {
    next(error);
  }
});

// Mark chapter as read
router.patch('/:id/read', async (req, res, next) => {
  try {
    const { id } = req.params;

    const chapter = await queryOne(`
      UPDATE chapters SET
        is_read = true,
        read_count = read_count + 1,
        read_progress = page_count - 1,
        first_read_at = COALESCE(first_read_at, CURRENT_TIMESTAMP),
        last_read_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    // Update manga last_read_at
    await query(`
      UPDATE manga SET
        last_read_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [chapter.manga_id]);

    // Invalidate cache
    await mangaCache.invalidateChapters(chapter.manga_id);
    await mangaCache.invalidateManga(chapter.manga_id);

    res.json(chapter);
  } catch (error) {
    next(error);
  }
});

// Mark chapter as unread
router.patch('/:id/unread', async (req, res, next) => {
  try {
    const { id } = req.params;

    const chapter = await queryOne(`
      UPDATE chapters SET
        is_read = false,
        read_progress = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    await mangaCache.invalidateChapters(chapter.manga_id);

    res.json(chapter);
  } catch (error) {
    next(error);
  }
});

// Delete chapter
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const chapter = await queryOne('SELECT manga_id FROM chapters WHERE id = $1', [id]);
    
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    await query('DELETE FROM chapters WHERE id = $1', [id]);

    await mangaCache.invalidateChapters(chapter.manga_id);

    res.json({ success: true, message: 'Chapter deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Get next chapter
router.get('/:id/next', async (req, res, next) => {
  try {
    const { id } = req.params;

    const current = await queryOne('SELECT manga_id, chapter_number::numeric as num FROM chapters WHERE id = $1', [id]);
    
    if (!current) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    const nextChapter = await queryOne(`
      SELECT id FROM chapters 
      WHERE manga_id = $1 AND chapter_number::numeric > $2
      ORDER BY chapter_number::numeric ASC
      LIMIT 1
    `, [current.manga_id, current.num]);

    res.json(nextChapter || null);
  } catch (error) {
    next(error);
  }
});

// Get previous chapter
router.get('/:id/prev', async (req, res, next) => {
  try {
    const { id } = req.params;

    const current = await queryOne('SELECT manga_id, chapter_number::numeric as num FROM chapters WHERE id = $1', [id]);
    
    if (!current) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    const prevChapter = await queryOne(`
      SELECT id FROM chapters 
      WHERE manga_id = $1 AND chapter_number::numeric < $2
      ORDER BY chapter_number::numeric DESC
      LIMIT 1
    `, [current.manga_id, current.num]);

    res.json(prevChapter || null);
  } catch (error) {
    next(error);
  }
});

export default router;

