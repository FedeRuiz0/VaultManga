import axios from 'axios';
import mangadexScraper from './mangadexScraper.js';

const DEFAULT_TIMEOUT_MS = 15000;

export class AxiosMangadexScraper {
  constructor(options = {}) {
    this.client = axios.create({
      baseURL: 'https://api.mangadex.org',
      timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
      headers: {
        'User-Agent': 'MangaVault/1.0'
      }
    });
  }

  async ping() {
    const response = await this.client.get('/ping');
    return response.data;
  }

  async scrapeBatch(options = {}) {
    return mangadexScraper.scrapeBatch(options);
  }
}

const axiosMangadexScraper = new AxiosMangadexScraper();

export default axiosMangadexScraper;