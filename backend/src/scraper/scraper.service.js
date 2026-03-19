import manganato from './sources/manganato.js';
import { matchManga } from './matcher.service.js';
import * as sync from './sync.service.js';

const SOURCES = [manganato];

export async function scrapeAndSyncManga(searchTitle, options = { resume: true }) {
  console.log('🚀 Starting scrapeAndSyncManga:', searchTitle);
  
  try {
    // 1. Search across sources
    let scrapedManga = null;
    let scrapedChapters = [];
    
    for (const source of SOURCES) {
      try {
        const searchResults = await source.searchManga(searchTitle, 1);
        if (searchResults.length === 0) continue;
        
        const topResult = searchResults[0];
        scrapedManga = await source.scrapeMangaDetails(topResult.url);
        scrapedChapters = await source.scrapeChapterList(topResult.url);
        
        scrapedChapters.forEach(ch => {
          ch.source_path = scrapedManga.source_path; // temp
        });
        
        break; // use first successful source
      } catch (sourceErr) {
        console.log('⚠️  Source failed, trying next:', sourceErr.message);
      }
    }
    
    if (!scrapedManga || scrapedChapters.length === 0) {
      throw new Error('No data scraped from any source');
    }
    
    console.log(`✅ Scraped: ${scrapedManga.title} (${scrapedChapters.length} chapters)`);
    
    // 2. Match existing
    const existingManga = await matchManga(scrapedManga);
    
    // 3. Batch sync with resume
    const mangaRecord = await sync.upsertManga(scrapedManga);
    const mangaId = mangaRecord.id;
    
    if (!options.resume) {
      await sync.clearScrapeProgress(mangaId);
    }
    
    let progress = await sync.getScrapeProgress(mangaId);
    console.log(`📊 Resuming from progress: ${progress}/${scrapedChapters.length}`);
    
    while (progress < scrapedChapters.length) {
      const batchEnd = Math.min(progress + 20, scrapedChapters.length);
      console.log(`📦 Processing chapters ${progress + 1}-${batchEnd}`);
      
      const batch = scrapedChapters.slice(progress, batchEnd);
      await sync.upsertChapters(mangaId, batch);
      
      progress = batchEnd;
      await sync.setScrapeProgress(mangaId, progress);
      
      if (batchEnd < scrapedChapters.length) {
        console.log('⏳ Waiting 60s for next batch...');
        await new Promise(resolve => setTimeout(resolve, 60000));
      }
    }
    
    console.log('✅ All chapters completed!');
    console.log(`📊 Manga ID: ${mangaId}, Total: ${scrapedChapters.length}`);
    
    return {
      mangaId,
      chaptersSynced: scrapedChapters.length,
      batches: Math.ceil(scrapedChapters.length / 20),
      source: 'manganato'
    };

    
  } catch (error) {
    console.error('💥 Full scrape failed:', error.message);
    throw error;
  }
}

// Export for lazy page scraping
export async function scrapePagesForChapter(chapterId) {
  // Impl here using sync.scrapePagesIfNeeded + manganato.scrapeChapterPages(reconstructUrl)
  console.log('🛠️  scrapePagesForChapter:', chapterId);
  // To complete: reconstruct chapterUrl from source_path (e.g. parse slug/ch-num)
}

export default { scrapeAndSyncManga };

