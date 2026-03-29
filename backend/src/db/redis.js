import { createClient } from 'redis';

let redisClient = null;

export async function initRedis() {
  if (redisClient) return redisClient;

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  redisClient = createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          console.error('Max Redis reconnection attempts reached');
          return new Error('Max reconnection attempts reached');
        }
        return Math.min(retries * 100, 3000);
      }
    }
  });

  redisClient.on('error', (err) => {
    console.error('Redis error:', err);
  });

  redisClient.on('connect', () => {
    console.log('Redis client connected');
  });

  redisClient.on('ready', () => {
    console.log('Redis client ready');
  });

  await redisClient.connect();
  return redisClient;
}

export function getRedis() {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call initRedis() first.');
  }
  return redisClient;
}

// Cache helpers
export async function cacheGet(key) {
  try {
    const data = await getRedis().get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds = 3600) {
  try {
    await getRedis().setEx(key, ttlSeconds, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('Cache set error:', error);
    return false;
  }
}

export async function cacheDelete(key) {
  try {
    await getRedis().del(key);
    return true;
  } catch (error) {
    console.error('Cache delete error:', error);
    return false;
  }
}

export async function cacheDeletePattern(pattern) {
  try {
    const client = getRedis();

    const pipeline = client.multi();

    for await (const key of client.scanIterator({
      MATCH: pattern,
      COUNT: 100,
    })) {
      pipeline.del(key);
    }

    await pipeline.exec();
    return true;
  } catch (error) {
    console.error('Cache delete pattern error:', error);
    return false;
  }
}

// Manga-specific cache helpers
export const mangaCache = {
  async getMangaList(page, limit, filter) {
    const key = `manga:list:${page}:${limit}:${JSON.stringify(filter)}`;
    return cacheGet(key);
  },
  
  async setMangaList(page, limit, filter, data) {
    const key = `manga:list:${page}:${limit}:${JSON.stringify(filter)}`;
    return cacheSet(key, data, 300);
  },
  
  async getManga(id) {
    return cacheGet(`manga:${id}`);
  },
  
  async setManga(id, data) {
    return cacheSet(`manga:${id}`, data, 600);
  },
  
  async invalidateManga(id) {
    await cacheDelete(`manga:${id}`);
    await cacheDeletePattern('manga:list:*');
  },
  
  async getChapters(mangaId) {
    return cacheGet(`chapters:${mangaId}`);
  },
  
  async setChapters(mangaId, data) {
    return cacheSet(`chapters:${mangaId}`, data, 600);
  },
  
  async invalidateChapters(mangaId) {
    await cacheDelete(`chapters:${mangaId}`);
  },
  
  async getPages(chapterId) {
    return cacheGet(`pages:${chapterId}`);
  },
  
  async setPages(chapterId, data) {
    return cacheSet(`pages:${chapterId}`, data, 1800);
  },
  
  async getPrefetch(chapterId, pageNumber) {
    return cacheGet(`prefetch:${chapterId}:${pageNumber}`);
  },
  
  async setPrefetch(chapterId, pageNumber, data) {
    return cacheSet(`prefetch:${chapterId}:${pageNumber}`, data, 300);
  }
};

export default {
  initRedis,
  getRedis,
  cacheGet,
  cacheSet,
  cacheDelete,
  cacheDeletePattern,
  mangaCache
};

