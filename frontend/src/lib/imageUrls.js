const BACKEND_ORIGIN =
  (import.meta.env.VITE_API_BASE_URL ||
    'https://vaultmanga-production.up.railway.app/api/v1')
    .replace('/api/v1', '');

export function getCoverUrl(mangaId) {
  return `${BACKEND_ORIGIN}/api/v1/images/cover/${mangaId}`;
}

export function getPageUrl(pageId) {
  return `${BACKEND_ORIGIN}/api/v1/images/page/${pageId}`;
}

import { getCoverUrl } from '../lib/imageUrls';

<img src={getCoverUrl(manga.id)} alt={manga.title} />