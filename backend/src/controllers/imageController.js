import axios from 'axios';
import { queryOne } from '../db/database.js';

function setImageHeaders(res, contentType = 'image/jpeg', cacheSeconds = 3600) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', `public, max-age=${cacheSeconds}`);
}

function normalizeMangaDexUrl(url) {
  if (!url) return null;

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  if (url.startsWith('//')) {
    return `https:${url}`;
  }

  return null;
}

export async function getCoverByMangaId(req, res, next) {
  try {
    const { mangaId } = req.params;

    const manga = await queryOne(
      `
      SELECT id, title, cover_image
      FROM manga
      WHERE id = $1
      `,
      [mangaId]
    );

    if (!manga) {
      return res.status(404).json({ error: 'Manga not found' });
    }

    const imageUrl = normalizeMangaDexUrl(manga.cover_image);

    if (!imageUrl) {
      return res.status(404).json({ error: 'Cover image not available' });
    }

    const response = await axios.get(imageUrl, {
      responseType: 'stream',
      timeout: 15000,
      headers: {
        Referer: 'https://mangadex.org/',
        Origin: 'https://mangadex.org',
        'User-Agent': 'MangaVault/1.0',
      },
      validateStatus: (status) => status >= 200 && status < 400,
    });

    setImageHeaders(
      res,
      response.headers['content-type'] || 'image/jpeg',
      3600
    );

    response.data.pipe(res);
  } catch (error) {
    next(error);
  }
}

export async function getPageByPageId(req, res, next) {
  try {
    const { pageId } = req.params;

    const page = await queryOne(
      `
      SELECT id, image_path, image_url
      FROM pages
      WHERE id = $1
      `,
      [pageId]
    );

    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    const imageUrl = normalizeMangaDexUrl(page.image_url || page.image_path);

    if (!imageUrl) {
      return res.status(404).json({ error: 'Page image not available' });
    }

    const response = await axios.get(imageUrl, {
      responseType: 'stream',
      timeout: 20000,
      headers: {
        Referer: 'https://mangadex.org/',
        Origin: 'https://mangadex.org',
        'User-Agent': 'MangaVault/1.0',
      },
      validateStatus: (status) => status >= 200 && status < 400,
    });

    setImageHeaders(
      res,
      response.headers['content-type'] || 'image/jpeg',
      3600
    );

    response.data.pipe(res);
  } catch (error) {
    next(error);
  }
}