// src/services/api.js

const API_BASE = "/api";

/** Manga Endpoints */
export const mangaApi = {
  async getAll({ page = 1, limit = 24 } = {}) {
    const params = new URLSearchParams({ page, limit });
    const res = await fetch(`${API_BASE}/manga?${params}`);
    if (!res.ok) throw new Error("Failed to fetch mangas");
    return res.json();
  },

  async getById(id) {
    const res = await fetch(`${API_BASE}/manga/${id}`);
    if (!res.ok) throw new Error("Failed to fetch manga");
    return res.json();
  }
};

/** Chapter Endpoints */
export const chapterApi = {
  async getByManga(mangaId, sort = 'asc') {
    const params = new URLSearchParams({ sort });
    const res = await fetch(`${API_BASE}/chapters/manga/${mangaId}?${params}`);
    if (!res.ok) throw new Error("Failed to fetch chapters");
    return res.json();
  },

  async getById(chapterId) {
    const res = await fetch(`${API_BASE}/chapters/${chapterId}`);
    if (!res.ok) throw new Error("Failed to fetch chapter");
    return res.json();
  },

  async markRead(chapterId) {
    const res = await fetch(`${API_BASE}/chapters/${chapterId}/read`, {
      method: 'PATCH'
    });
    if (!res.ok) throw new Error("Failed to mark chapter as read");
    return res.json();
  }
};

/** Page Endpoints */
export const pageApi = {
  async getByChapter(chapterId) {
    const res = await fetch(`${API_BASE}/pages/chapter/${chapterId}`);
    if (!res.ok) throw new Error("Failed to fetch pages");
    return res.json();
  }
};

/** Library Endpoints */
export const libraryApi = {
  async getOverview() {
    const res = await fetch(`${API_BASE}/library/overview`);
    if (!res.ok) throw new Error("Failed to fetch library overview");
    return res.json();
  },

  async startReading({ manga_id, chapter_id, page_number = 0 }) {
    const res = await fetch(`${API_BASE}/library/start-reading`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manga_id, chapter_id, page_number })
    });
    return res.json();
  },

  async endReading({ session_id, end_page, duration_seconds }) {
    const res = await fetch(`${API_BASE}/library/end-reading`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id, end_page, duration_seconds })
    });
    return res.json();
  }
};

/** Auth Endpoints */
export const authApi = {
  async login(data) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async logout() {
    const res = await fetch(`${API_BASE}/auth/logout`, { method: "POST" });
    return res.json();
  },

  async me() {
    const res = await fetch(`${API_BASE}/auth/me`);
    return res.json();
  }
};

/** Settings Endpoints */
export const settingsApi = {
  async getSettings() {
    const res = await fetch(`${API_BASE}/settings`);
    return res.json();
  },

  async updateSettings(data) {
    const res = await fetch(`${API_BASE}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return res.json();
  }
};