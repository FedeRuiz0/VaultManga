import fs from 'fs';
import path from 'path';
import { query, queryOne, queryAll } from '../db/database.js';
import { getRedis } from '../db/redis.js';
import chokidar from 'chokidar';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Supported image extensions
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];

// Manga folder structure patterns
const CHAPTER_PATTERNS = [
  /ch(?:apter)?[\s._-]*(\d+)/i,
  /[\s._-](\d+)[\s._-]?/,
  /vol(?:ume)?[\s._-]*(\d+)/i,
  /^(\d+)$/
];

// Scan status storage
let scanStatus = {
  isScanning: false,
  currentPath: '',
  progress: 0,
  total: 0,
  errors: []
};

/**
 * Scan a manga folder and detect chapters and pages
 */
export async function scanMangaFolder(sourcePath) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Path does not exist: ${sourcePath}`);
  }

  const stat = fs.statSync(sourcePath);
  
  if (stat.isFile()) {
    // Single file - treat as single chapter
    return scanSingleMangaFolder(sourcePath);
  }
  
  return scanMangaDirectory(sourcePath);
}

/**
 * Scan a manga directory and detect chapters
 */
async function scanMangaDirectory(mangaPath) {
  const entries = fs.readdirSync(mangaPath, { withFileTypes: true });
  
  // Detect if it's a manga with chapters in subdirectories
  const subdirs = entries.filter(e => e.isDirectory());
  const files = entries.filter(e => e.isFile());
  
  let chapters = [];
  
  if (subdirs.length > 0) {
    // Multiple chapters in subdirectories
    for (const subdir of subdirs) {
      const chapterPath = path.join(mangaPath, subdir.name);
      const chapterNum = parseChapterNumber(subdir.name);
      
      if (chapterNum !== null) {
        const pages = await scanChapterFolder(chapterPath);
        chapters.push({
          chapterNumber: chapterNum,
          path: chapterPath,
          pages
        });
      }
    }
  } else if (files.length > 0) {
    // Single chapter (all images in one folder)
    const pages = await scanChapterFolder(mangaPath);
    chapters.push({
      chapterNumber: '1',
      path: mangaPath,
      pages
    });
  }
  
  return chapters;
}

/**
 * Scan a chapter folder and get all pages
 */
async function scanChapterFolder(chapterPath) {
  const files = fs.readdirSync(chapterPath);
  
  const images = files
    .filter(file => {
      const ext = path.extname(file).toLowerCase();
      return IMAGE_EXTENSIONS.includes(ext);
    })
    .map(file => {
      const filePath = path.join(chapterPath, file);
      const stat = fs.statSync(filePath);
      
      return {
        filename: file,
        path: filePath,
        size: stat.size,
        pageNumber: extractPageNumber(file)
      };
    })
    .sort((a, b) => a.pageNumber - b.pageNumber);
  
  return images;
}

/**
 * Parse chapter number from folder/file name
 */
function parseChapterNumber(name) {
  for (const pattern of CHAPTER_PATTERNS) {
    const match = name.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Extract page number from filename
 */
function extractPageNumber(filename) {
  // Remove extension
  const name = path.basename(filename, path.extname(filename));
  
  // Try to find number in filename
  const match = name.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

/**
 * Scan single manga folder (all images in one folder)
 */
async function scanSingleMangaFolder(folderPath) {
  const pages = await scanChapterFolder(folderPath);
  
  return [{
    chapterNumber: '1',
    path: folderPath,
    pages: pages.map((p, idx) => ({ ...p, pageNumber: idx + 1 }))
  }];
}

/**
 * Import manga to database
 */
export async function importMangaToDatabase(sourcePath, metadata = {}) {
  const chapters = await scanMangaFolder(sourcePath);
  
  // Get manga title from folder name
  const title = metadata.title || path.basename(sourcePath);
  
  // Find or create manga entry
  let manga = await queryOne(
    'SELECT * FROM manga WHERE source_path = $1',
    [sourcePath]
  );
  
  if (!manga) {
    manga = await queryOne(`
      INSERT INTO manga (title, source_path, status)
      VALUES ($1, $2, 'ongoing')
      RETURNING *
    `, [title, sourcePath]);
  }
  
  // Import chapters
  for (const chapter of chapters) {
    await importChapterToDatabase(manga.id, chapter);
  }
  
  // Check for incomplete
  await checkMangaCompleteness(manga.id);
  
  return { manga, chapters: chapters.length };
}

/**
 * Import chapter to database
 */
async function importChapterToDatabase(mangaId, chapterData) {
  const { chapterNumber, path: chapterPath, pages } = chapterData;
  
  // Create or update chapter
  const chapter = await queryOne(`
    INSERT INTO chapters (manga_id, chapter_number, source_path, page_count)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (manga_id, chapter_number) 
    DO UPDATE SET source_path = $3, page_count = $4
    RETURNING *
  `, [mangaId, chapterNumber, chapterPath, pages.length]);
  
  // Import pages
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    await query(`
      INSERT INTO pages (chapter_id, page_number, image_path, file_size)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (chapter_id, page_number) 
      DO UPDATE SET image_path = $3, file_size = $4
    `, [chapter.id, i + 1, page.path, page.size]);
  }
  
  return chapter;
}

/**
 * Check manga completeness (detect missing chapters/pages)
 */
export async function checkMangaCompleteness(mangaId) {
  const manga = await queryOne('SELECT * FROM manga WHERE id = $1', [mangaId]);
  if (!manga) return;
  
  const chapters = await queryAll(`
    SELECT * FROM chapters WHERE manga_id = $1 ORDER BY chapter_number::numeric
  `, [mangaId]);
  
  const issues = [];
  
  // Check for missing chapter numbers
  for (let i = 0; i < chapters.length - 1; i++) {
    const current = parseFloat(chapters[i].chapter_number);
    const next = parseFloat(chapters[i + 1].chapter_number);
    
    if (next - current > 1) {
      // Found gap in chapters
      for (let j = current + 1; j < next; j++) {
        issues.push({
          chapterNumber: j.toString(),
          issueType: 'missing_chapter'
        });
      }
    }
  }
  
  // Check for chapters with no pages
  for (const chapter of chapters) {
    if (chapter.page_count === 0) {
      issues.push({
        chapterNumber: chapter.chapter_number,
        issueType: 'missing_pages'
      });
      
      await query(`
        INSERT INTO incomplete_manga_log (manga_id, chapter_number, issue_type)
        VALUES ($1, $2, 'missing_pages')
        ON CONFLICT DO NOTHING
      `, [mangaId, chapter.chapter_number]);
    }
  }
  
  // Update manga incomplete status
  const isIncomplete = issues.length > 0;
  await query(`
    UPDATE manga SET is_incomplete = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1
  `, [mangaId, isIncomplete]);
  
  return issues;
}

/**
 * Scan configured manga folders
 */
export async function scanMangaFolders() {
  const mangaFolders = process.env.MANGA_FOLDERS?.split(',') || [];
  
  if (mangaFolders.length === 0) {
    console.log('No manga folders configured');
    return [];
  }
  
  scanStatus = {
    isScanning: true,
    currentPath: '',
    progress: 0,
    total: mangaFolders.length,
    errors: []
  };
  
  const results = [];
  
  for (const folder of mangaFolders) {
    const folderPath = folder.trim();
    
    if (!fs.existsSync(folderPath)) {
      scanStatus.errors.push(`Path not found: ${folderPath}`);
      continue;
    }
    
    try {
      scanStatus.currentPath = folderPath;
      
      // Scan subfolders as individual manga
      const entries = fs.readdirSync(folderPath, { withFileTypes: true });
      const subdirs = entries.filter(e => e.isDirectory());
      
      for (const subdir of subdirs) {
        const mangaPath = path.join(folderPath, subdir.name);
        const result = await importMangaToDatabase(mangaPath);
        results.push(result);
      }
      
      scanStatus.progress++;
    } catch (error) {
      scanStatus.errors.push(`Error scanning ${folderPath}: ${error.message}`);
    }
  }
  
  scanStatus.isScanning = false;
  scanStatus.currentPath = '';
  
  return results;
}

/**
 * Get scan status
 */
export function getScanStatus() {
  return { ...scanStatus };
}

/**
 * Start watching manga folders for changes
 */
export function watchMangaFolders() {
  const mangaFolders = process.env.MANGA_FOLDERS?.split(',') || [];
  
  if (mangaFolders.length === 0) {
    console.log('No manga folders to watch');
    return;
  }
  
  const watcher = chokidar.watch(mangaFolders, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: true
  });
  
  watcher
    .on('addDir', async (dirPath) => {
      console.log(`New manga folder detected: ${dirPath}`);
      try {
        await importMangaToDatabase(dirPath);
      } catch (error) {
        console.error(`Error importing manga: ${error.message}`);
      }
    })
    .on('error', (error) => {
      console.error(`Watcher error: ${error}`);
    });
  
  console.log(`Watching ${mangaFolders.length} manga folders`);
  
  return watcher;
}

export default {
  scanMangaFolder,
  scanMangaFolders,
  importMangaToDatabase,
  checkMangaCompleteness,
  getScanStatus,
  watchMangaFolders
};

