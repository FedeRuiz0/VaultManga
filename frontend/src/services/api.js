const API_BASE = import.meta.env.VITE_API_BASE || '/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;

  if (!response.ok) {
    const message = data?.error || data?.message || `${response.status} ${response.statusText}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
};

const asObject = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (value.data && typeof value.data === 'object' && !Array.isArray(value.data)) {
      return value.data;
    }
    return value;
  }
  return null;
};

/** Manga Endpoints */
export const mangaApi = {
  async getAll({ page = 1, limit = 24 } = {}) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    const result = await request(`/manga?${params}`);
    return asArray(result);
  },

  async getById(id) {
    const result = await request(`/manga/${id}`);
    return asObject(result);
  },

  async toggleFavorite(id) {
    return request(`/manga/${id}/favorite`, { method: 'PATCH' });
  },
};

/** Chapter Endpoints */
export const chapterApi = {
  async getByManga(mangaId, sort = 'asc') {
    const params = new URLSearchParams({ sort });
    const result = await request(`/chapters/manga/${mangaId}?${params}`);
    return asArray(result);
  },

  async getById(chapterId) {
    const result = await request(`/chapters/${chapterId}`);
    return asObject(result);
  },

  async markRead(chapterId) {
    return request(`/chapters/${chapterId}/read`, { method: 'PATCH' });
  },

  async getNext(chapterId) {
    const result = await request(`/chapters/${chapterId}/next`);
    return asObject(result);
  },

  async getPrev(chapterId) {
    const result = await request(`/chapters/${chapterId}/prev`);
    return asObject(result);
  },
};

/** Page Endpoints */
export const pageApi = {
  async getByChapter(chapterId) {
    const result = await request(`/pages/chapter/${chapterId}`);
    return asArray(result);
  },
};

/** Library Endpoints */
export const libraryApi = {
  async getOverview() {
    return request('/library/overview');
  },

  async startReading({ manga_id, chapter_id, page_number = 0 }) {
    return request('/library/start-reading', {
      method: 'POST',
      body: JSON.stringify({ manga_id, chapter_id, page_number }),
    });
  },

  async endReading({ session_id, chapter_id, end_page, duration_seconds }) {
    return request('/library/end-reading', {
      method: 'POST',
      body: JSON.stringify({ session_id, chapter_id, end_page, duration_seconds }),
    });
  },
};

/** Auth Endpoints */
export const authApi = {
  async login(data) {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async logout() {
    return request('/auth/logout', { method: 'POST' });
  },

  async me() {
    return request('/auth/me');
  },
};

/** Settings Endpoints */
export const settingsApi = {
  async getSettings() {
    return request('/settings');
  },

  async updateSettings(data) {
    return request('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};
