import nodeCron from 'node-cron';
import scraper from './mangadexScraper.js';
import { cacheDeletePattern } from '../db/redis.js';

class AutoScraper {
  constructor() {
    this.enabled = true;
    this.lastRun = null;
    this.totalImported = 0;
  }

  async start() {
    // Auto scrape daily at 2AM
    nodeCron.schedule('0 2 * * *', async () => {
      if (!this.enabled) return;
      
      try {
        console.log('🤖 Auto-scraping daily popular mangas...');
        const result = await scraper.scrapeBatch({ 
          count: 50, 
          genres: ['Action', 'Adventure', 'Fantasy'] 
        });
        
        this.lastRun = new Date().toISOString();
        this.totalImported += result.imported;
        console.log('🤖 Auto-scrape complete:', result);
        
        // Clear cache
        await cacheDeletePattern('manga:*');
        
      } catch (error) {
        console.error('🤖 Auto-scrape failed:', error);
      }
    }, { timezone: 'America/Argentina/Buenos_Aires' });

    console.log('🤖 AutoScraper iniciado - Scraping diario 2AM');
  }

  enable() {
    this.enabled = true;
    console.log('🤖 AutoScraper habilitado');
  }

  disable() {
    this.enabled = false;
    console.log('🤖 AutoScraper deshabilitado');
  }

  getStatus() {
    return {
      enabled: this.enabled,
      lastRun: this.lastRun,
      totalImported: this.totalImported,
      nextRun: '2AM daily'
    };
  }
}

export default new AutoScraper();

