const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  'https://vaultmanga-production.up.railway.app/api/v1';

const BACKEND_ORIGIN = API_BASE.replace('/api/v1', '');

export function getCoverUrl(mangaId) {
  if (!mangaId) return '/placeholder-cover.jpg';
  return `${BACKEND_ORIGIN}/api/v1/images/cover/${mangaId}`;
}

export function getPageUrl(pageId) {
  if (!pageId) return '';
  return `${BACKEND_ORIGIN}/api/v1/images/page/${pageId}`;
}