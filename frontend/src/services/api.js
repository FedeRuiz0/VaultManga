const API_BASE = import.meta.env.VITE_API_BASE || '/api';

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null && item !== '') {
          searchParams.append(key, item);
        }
      });
      return;
    }

    searchParams.set(key, value);
  });

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

async function request(path, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    signal,
  } = options;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw = await response.text();
  let data = null;

  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw || null;
  }

  if (!response.ok) {
    const message =
      data?.error ||
      data?.message ||
      `${response.status} ${response.statusText}`;

    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

export const mangaApi = {
  getAll(params = {}, options = {}) {
    return request(`/manga${buildQuery(params)}`, {
      method: 'GET',
      signal: options.signal,
    });
  },

  getById(id, options = {}) {
    return request(`/manga/${id}`, {
      method: 'GET',
      signal: options.signal,
    });
  },

  getLanguages(id, options = {}) {
    return request(`/manga/${id}/languages`, {
      method: 'GET',
      signal: options.signal,
    });
  },

  search(query, limit = 10, options = {}) {
    return request(`/manga/search${buildQuery({ q: query, limit })}`, {
      method: 'GET',
      signal: options.signal,
    });
  },

  importFromMangaDex(mangadexId, options = {}) {
    return request('/manga/import', {
      method: 'POST',
      body: { mangadexId },
      signal: options.signal,
    });
  },

  create(payload, options = {}) {
    return request('/manga', {
      method: 'POST',
      body: payload,
      signal: options.signal,
    });
  },

  update(id, payload, options = {}) {
    return request(`/manga/${id}`, {
      method: 'PUT',
      body: payload,
      signal: options.signal,
    });
  },

  toggleFavorite(id, options = {}) {
    return request(`/manga/${id}/favorite`, {
      method: 'PATCH',
      signal: options.signal,
    });
  },

  delete(id, options = {}) {
    return request(`/manga/${id}`, {
      method: 'DELETE',
      signal: options.signal,
    });
  },

  getGenres(options = {}) {
    return request('/manga/meta/genres', {
      method: 'GET',
      signal: options.signal,
    });
  },
};

export const chapterApi = {
  getByMangaId(mangaId, params = {}, options = {}) {
    return request(`/chapters/manga/${mangaId}${buildQuery(params)}`, {
      method: 'GET',
      signal: options.signal,
    });
  },

  getById(id, options = {}) {
    return request(`/chapters/${id}`, {
      method: 'GET',
      signal: options.signal,
    });
  },

  create(payload, options = {}) {
    return request('/chapters', {
      method: 'POST',
      body: payload,
      signal: options.signal,
    });
  },

  update(id, payload, options = {}) {
    return request(`/chapters/${id}`, {
      method: 'PUT',
      body: payload,
      signal: options.signal,
    });
  },

  markRead(id, options = {}) {
    return request(`/chapters/${id}/read`, {
      method: 'PATCH',
      signal: options.signal,
    });
  },

  markUnread(id, options = {}) {
    return request(`/chapters/${id}/unread`, {
      method: 'PATCH',
      signal: options.signal,
    });
  },

  getNext(id, options = {}) {
    return request(`/chapters/${id}/next`, {
      method: 'GET',
      signal: options.signal,
    });
  },

  getPrev(id, options = {}) {
    return request(`/chapters/${id}/prev`, {
      method: 'GET',
      signal: options.signal,
    });
  },

  delete(id, options = {}) {
    return request(`/chapters/${id}`, {
      method: 'DELETE',
      signal: options.signal,
    });
  },
};

export const pageApi = {
  getByChapterId(chapterId, options = {}) {
    return request(`/pages/chapter/${chapterId}`, {
      method: 'GET',
      signal: options.signal,
    });
  },

  // compatibilidad con Reader viejo
  getByChapter(chapterId, options = {}) {
    return request(`/pages/chapter/${chapterId}`, {
      method: 'GET',
      signal: options.signal,
    });
  },

  getById(id, options = {}) {
    return request(`/pages/${id}`, {
      method: 'GET',
      signal: options.signal,
    });
  },

  create(payload, options = {}) {
    return request('/pages', {
      method: 'POST',
      body: payload,
      signal: options.signal,
    });
  },

  bulkCreate(payload, options = {}) {
    return request('/pages/bulk', {
      method: 'POST',
      body: payload,
      signal: options.signal,
    });
  },

  cachePage(id, options = {}) {
    return request(`/pages/${id}/cache`, {
      method: 'POST',
      signal: options.signal,
    });
  },

  getPrefetched(chapterId, count = 5, options = {}) {
    return request(`/pages/prefetch/${chapterId}${buildQuery({ count })}`, {
      method: 'GET',
      signal: options.signal,
    });
  },

  prefetch(chapterId, pages = [], options = {}) {
    return request(`/pages/prefetch/${chapterId}`, {
      method: 'POST',
      body: { pages },
      signal: options.signal,
    });
  },

  delete(id, options = {}) {
    return request(`/pages/${id}`, {
      method: 'DELETE',
      signal: options.signal,
    });
  },
};

export const libraryApi = {
  getOverview(options = {}) {
    return request('/library/overview', {
      method: 'GET',
      signal: options.signal,
    });
  },

  getRecent(params = {}, options = {}) {
    return request(`/library/recent${buildQuery(params)}`, {
      method: 'GET',
      signal: options.signal,
    });
  },

  getFavorites(params = {}, options = {}) {
    return request(`/library/favorites${buildQuery(params)}`, {
      method: 'GET',
      signal: options.signal,
    });
  },

  getIncomplete(params = {}, options = {}) {
    return request(`/library/incomplete${buildQuery(params)}`, {
      method: 'GET',
      signal: options.signal,
    });
  },

  getHistory(params = {}, options = {}) {
    return request(`/library/history${buildQuery(params)}`, {
      method: 'GET',
      signal: options.signal,
    });
  },

  getGenres(options = {}) {
    return request('/library/genres', {
      method: 'GET',
      signal: options.signal,
    });
  },

  // compatibilidad con Reader viejo
  startReading(payload, options = {}) {
    return request('/library/reading/start', {
      method: 'POST',
      body: payload,
      signal: options.signal,
    });
  },

  endReading(payload, options = {}) {
    return request('/library/reading/end', {
      method: 'POST',
      body: payload,
      signal: options.signal,
    });
  },
};

export const settingsApi = {
  get(options = {}) {
    return request('/settings', {
      method: 'GET',
      signal: options.signal,
    });
  },

  update(payload, options = {}) {
    return request('/settings', {
      method: 'PUT',
      body: payload,
      signal: options.signal,
    });
  },

  // compatibilidad con Settings viejo
  reset(options = {}) {
    return request('/settings/reset', {
      method: 'POST',
      signal: options.signal,
    });
  },
};

export const statsApi = {
  getOverview(options = {}) {
    return request('/stats/overview', {
      method: 'GET',
      signal: options.signal,
    });
  },

  getReadingStats(params = {}, options = {}) {
    return request(`/stats/reading${buildQuery(params)}`, {
      method: 'GET',
      signal: options.signal,
    });
  },

  getMangaStats(id, options = {}) {
    return request(`/stats/manga/${id}`, {
      method: 'GET',
      signal: options.signal,
    });
  },
};

export const authApi = {
  login(payload, options = {}) {
    return request('/auth/login', {
      method: 'POST',
      body: payload,
      signal: options.signal,
    });
  },

  register(payload, options = {}) {
    return request('/auth/register', {
      method: 'POST',
      body: payload,
      signal: options.signal,
    });
  },

  me(options = {}) {
    return request('/auth/me', {
      method: 'GET',
      signal: options.signal,
    });
  },

  logout(options = {}) {
    return request('/auth/logout', {
      method: 'POST',
      signal: options.signal,
    });
  },
};

const api = {
  mangaApi,
  chapterApi,
  pageApi,
  libraryApi,
  settingsApi,
  statsApi,
  authApi,
};

export default api;