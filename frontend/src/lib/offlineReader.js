import { chapterApi, libraryApi, pageApi } from '../services/api';

const STORAGE_KEYS = {
  queue: 'mv_offline_progress_queue_v1',
  chapterMeta: 'mv_offline_chapter_meta_v1',
  chapterPages: 'mv_offline_chapter_pages_v1',
  chapterLists: 'mv_offline_chapter_lists_v1',
};

const CACHE_NAME = 'mangavault-reader-assets-v1';
const MAX_CACHED_ENTRIES = 30;

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[offlineReader] failed to persist ${key}`, error);
  }
}

function pruneByUpdatedAt(store, maxEntries = MAX_CACHED_ENTRIES) {
  const entries = Object.entries(store || {});
  if (entries.length <= maxEntries) return store;

  entries.sort((a, b) => {
    const aTime = a[1]?.updatedAt || 0;
    const bTime = b[1]?.updatedAt || 0;
    return bTime - aTime;
  });

  return Object.fromEntries(entries.slice(0, maxEntries));
}

export function saveOfflineChapterMeta(chapter) {
  if (!chapter?.id) return;

  const store = readJson(STORAGE_KEYS.chapterMeta, {});
  store[chapter.id] = {
    ...chapter,
    updatedAt: Date.now(),
  };

  writeJson(STORAGE_KEYS.chapterMeta, pruneByUpdatedAt(store));
}

export function getOfflineChapterMeta(chapterId) {
  const store = readJson(STORAGE_KEYS.chapterMeta, {});
  return store[chapterId] || null;
}

export function saveOfflineChapterPages(chapterId, pages) {
  if (!chapterId || !Array.isArray(pages)) return;

  const store = readJson(STORAGE_KEYS.chapterPages, {});
  store[chapterId] = {
    pages,
    updatedAt: Date.now(),
  };

  writeJson(STORAGE_KEYS.chapterPages, pruneByUpdatedAt(store));
}

export function getOfflineChapterPages(chapterId) {
  const store = readJson(STORAGE_KEYS.chapterPages, {});
  return store[chapterId]?.pages || [];
}

export function saveOfflineChapterList(mangaId, chapters) {
  if (!mangaId || !Array.isArray(chapters)) return;

  const store = readJson(STORAGE_KEYS.chapterLists, {});
  store[mangaId] = {
    chapters,
    updatedAt: Date.now(),
  };

  writeJson(STORAGE_KEYS.chapterLists, pruneByUpdatedAt(store));
}

export function getOfflineChapterList(mangaId) {
  const store = readJson(STORAGE_KEYS.chapterLists, {});
  return store[mangaId]?.chapters || [];
}

export async function cacheReaderAssets(urls = []) {
  if (!('caches' in window) || !Array.isArray(urls) || urls.length === 0) {
    return;
  }

  const cache = await caches.open(CACHE_NAME);

  await Promise.all(
    urls.map(async (url) => {
      if (!url) return;

      try {
        const existing = await cache.match(url);
        if (existing) return;

        const response = await fetch(url).catch(() => null);
        if (!response) return;

        if (response.ok || response.type === 'opaque') {
          await cache.put(url, response.clone());
        }
      } catch (error) {
        console.warn('[offlineReader] failed to cache asset', url, error);
      }
    })
  );
}

export function queueOfflineProgress(snapshot) {
  if (!snapshot?.mangaId || !snapshot?.chapterId) return;

  const queue = readJson(STORAGE_KEYS.queue, {});
  const key = `${snapshot.mangaId}:${snapshot.chapterId}`;

  const previous = queue[key];

  const nextPage =
    typeof previous?.pageNumber === 'number'
      ? Math.max(previous.pageNumber, snapshot.pageNumber ?? 0)
      : snapshot.pageNumber ?? 0;

  queue[key] = {
    ...previous,
    ...snapshot,
    pageNumber: nextPage,
    completed: Boolean(previous?.completed || snapshot.completed),
    updatedAt: Date.now(),
  };

  writeJson(STORAGE_KEYS.queue, queue);
}

export function getQueuedOfflineProgress() {
  return readJson(STORAGE_KEYS.queue, {});
}

export function clearQueuedOfflineProgress(key) {
  const queue = readJson(STORAGE_KEYS.queue, {});
  delete queue[key];
  writeJson(STORAGE_KEYS.queue, queue);
}

export async function flushOfflineProgressQueue() {
  if (!navigator.onLine) {
    return {
      synced: 0,
      pending: Object.keys(getQueuedOfflineProgress()).length,
    };
  }

  const queue = getQueuedOfflineProgress();
  const items = Object.entries(queue).sort((a, b) => {
    const aTime = a[1]?.updatedAt || 0;
    const bTime = b[1]?.updatedAt || 0;
    return aTime - bTime;
  });

  let synced = 0;

  for (const [key, item] of items) {
    try {
      const startPayload = {
        manga_id: item.mangaId,
        chapter_id: item.chapterId,
        page_number: item.pageNumber || 0,
      };

      const session = await libraryApi.startReading(startPayload);
      await libraryApi.progress(startPayload);

      if (item.completed) {
        await chapterApi.markRead(item.chapterId);
      }

      if (session?.id) {
        await libraryApi.endReading({
          session_id: session.id,
          end_page: item.pageNumber || 0,
          duration_seconds: item.durationSeconds || 0,
        });
      }

      clearQueuedOfflineProgress(key);
      synced += 1;
    } catch (error) {
      console.warn('[offlineReader] sync failed for item', item, error);
    }
  }

  return {
    synced,
    pending: Object.keys(getQueuedOfflineProgress()).length,
  };
}

export function installOfflineSync(onSynced) {
  const runSync = async () => {
    try {
      const result = await flushOfflineProgressQueue();
      if (typeof onSynced === 'function') {
        onSynced(result);
      }
    } catch (error) {
      console.warn('[offlineReader] failed to flush queue', error);
    }
  };

  const handleOnline = () => {
    runSync();
  };

  window.addEventListener('online', handleOnline);

  if (navigator.onLine) {
    runSync();
  }

  return () => {
    window.removeEventListener('online', handleOnline);
  };
}

export async function fetchChapterWithOfflineFallback(chapterId, options = {}) {
  try {
    const chapter = await chapterApi.getById(chapterId, options);
    saveOfflineChapterMeta(chapter);
    return chapter;
  } catch (error) {
    const offlineChapter = getOfflineChapterMeta(chapterId);
    if (offlineChapter) {
      return offlineChapter;
    }
    throw error;
  }
}

export async function fetchPagesWithOfflineFallback(chapterId, options = {}) {
  try {
    const pages = await pageApi.getByChapterId(chapterId, options);
    saveOfflineChapterPages(chapterId, pages);

    await cacheReaderAssets(
      pages
        .map((page) => page.url || page.display_path || page.image_path)
        .filter(Boolean)
    );

    return pages;
  } catch (error) {
    const offlinePages = getOfflineChapterPages(chapterId);
    if (offlinePages.length > 0) {
      return offlinePages;
    }
    throw error;
  }
}

export async function fetchChapterListWithOfflineFallback(
  mangaId,
  params = {},
  options = {}
) {
  try {
    const chapters = await chapterApi.getByMangaId(mangaId, params, options);
    saveOfflineChapterList(mangaId, chapters);
    return chapters;
  } catch (error) {
    const offlineChapters = getOfflineChapterList(mangaId);
    if (offlineChapters.length > 0) {
      return offlineChapters;
    }
    throw error;
  }
}

export async function prefetchChapterForOffline(chapterId) {
  if (!chapterId) return;

  try {
    const chapter = await chapterApi.getById(chapterId);
    saveOfflineChapterMeta(chapter);

    const pages = await pageApi.getByChapterId(chapterId);
    saveOfflineChapterPages(chapterId, pages);

    await cacheReaderAssets(
      pages
        .map((page) => page.url || page.display_path || page.image_path)
        .filter(Boolean)
    );
  } catch (error) {
    console.warn('[offlineReader] prefetch failed', chapterId, error);
  }
}