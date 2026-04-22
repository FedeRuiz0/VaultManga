import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

let createApp;
let initDatabase;
let query;
let queryOne;

let server;
let baseUrl;
let dbReady = false;
let fixtureMangaId;
let fixtureChapterId;

const createdUserIds = new Set();

function randomSuffix() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;

  return {
    status: response.status,
    data,
  };
}

async function registerAndLogin() {
  const suffix = randomSuffix();
  const payload = {
    username: `integration_user_${suffix}`,
    email: `integration_${suffix}@example.com`,
    password: 'Password123!',
  };

  const registerRes = await api('/api/v1/auth/register', {
    method: 'POST',
    body: payload,
  });

  assert.equal(registerRes.status, 201);
  assert.ok(registerRes.data?.token);
  assert.equal(registerRes.data?.user?.email, payload.email);
  createdUserIds.add(registerRes.data.user.id);

  const loginRes = await api('/api/v1/auth/login', {
    method: 'POST',
    body: {
      email: payload.email,
      password: payload.password,
    },
  });

  assert.equal(loginRes.status, 200);
  assert.ok(loginRes.data?.token);

  return {
    user: registerRes.data.user,
    token: loginRes.data.token,
  };
}

async function cleanupData() {
  if (!dbReady) return;

  if (createdUserIds.size > 0) {
    const userIds = [...createdUserIds];
    await query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
  }

  if (fixtureMangaId) {
    await query('DELETE FROM manga WHERE id = $1', [fixtureMangaId]);
  }
}

async function ensureFixtures() {
  const suffix = randomSuffix();

  const manga = await queryOne(
    `
      INSERT INTO manga (title, source_path, status, year, genre)
      VALUES ($1, $2, 'ongoing', 2024, '[]'::jsonb)
      RETURNING id
    `,
    [`Integration Manga ${suffix}`, `integration/source/${suffix}`]
  );

  fixtureMangaId = manga.id;

  const chapter = await queryOne(
    `
      INSERT INTO chapters (manga_id, chapter_number, title, source_path, page_count)
      VALUES ($1, '1', 'Chapter 1', $2, 12)
      RETURNING id
    `,
    [fixtureMangaId, `integration/chapter/${suffix}`]
  );

  fixtureChapterId = chapter.id;
}

test.before(async () => {
  ({ createApp } = await import('../../src/app.js'));
  ({ initDatabase, query, queryOne } = await import('../../src/db/database.js'));

  try {
    await initDatabase();
    dbReady = true;
  } catch (error) {
    console.warn('[integration-test] skipping: database unavailable', error.message);
    dbReady = false;
    return;
  }

  const { app } = createApp({ nodeEnv: 'test' });

  server = app.listen(0);

  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;

  await ensureFixtures();
});

test.after(async () => {
  await cleanupData();

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('auth: register/login and protected routes', async (t) => {
  if (!dbReady) {
    t.skip('Database not available');
    return;
  }

  const { token, user } = await registerAndLogin();

  const meRes = await api('/api/v1/auth/me', { token });
  assert.equal(meRes.status, 200);
  assert.equal(meRes.data?.id, user.id);

  const protectedRes = await api('/api/v1/library/overview');
  assert.equal(protectedRes.status, 401);

  const logoutRes = await api('/api/v1/auth/logout', {
    method: 'POST',
    token,
  });
  assert.equal(logoutRes.status, 200);
  assert.equal(logoutRes.data?.success, true);
});

test('favorites are strictly per-user across manga list/detail/dashboard', async (t) => {
  if (!dbReady) {
    t.skip('Database not available');
    return;
  }

  const userA = await registerAndLogin();
  const userB = await registerAndLogin();

  const toggleA = await api(`/api/v1/manga/${fixtureMangaId}/favorite`, {
    method: 'PATCH',
    token: userA.token,
  });
  assert.equal(toggleA.status, 200);
  assert.equal(toggleA.data?.is_favorite, true);

  const listA = await api('/api/v1/manga?favorites=true', { token: userA.token });
  const listB = await api('/api/v1/manga?favorites=true', { token: userB.token });
  assert.equal(listA.status, 200);
  assert.equal(listB.status, 200);
  assert.ok((listA.data?.data || []).some((m) => m.id === fixtureMangaId));
  assert.equal((listB.data?.data || []).some((m) => m.id === fixtureMangaId), false);

  const detailA = await api(`/api/v1/manga/${fixtureMangaId}`, { token: userA.token });
  const detailB = await api(`/api/v1/manga/${fixtureMangaId}`, { token: userB.token });
  assert.equal(detailA.status, 200);
  assert.equal(detailB.status, 200);
  assert.equal(detailA.data?.is_favorite, true);
  assert.equal(detailB.data?.is_favorite, false);

  const overviewA = await api('/api/v1/library/overview', { token: userA.token });
  const overviewB = await api('/api/v1/library/overview', { token: userB.token });
  assert.equal(overviewA.status, 200);
  assert.equal(overviewB.status, 200);
  assert.ok((overviewA.data?.favorites || []).some((m) => m.id === fixtureMangaId));
  assert.equal((overviewB.data?.favorites || []).some((m) => m.id === fixtureMangaId), false);
});

test('user isolation: progress/history/settings remain isolated', async (t) => {
  if (!dbReady) {
    t.skip('Database not available');
    return;
  }

  const userA = await registerAndLogin();
  const userB = await registerAndLogin();

  const startA = await api('/api/v1/library/start-reading', {
    method: 'POST',
    token: userA.token,
    body: {
      manga_id: fixtureMangaId,
      chapter_id: fixtureChapterId,
      page_number: 3,
    },
  });

  assert.equal(startA.status, 200);

  const progressA = await api('/api/v1/library/progress', {
    method: 'POST',
    token: userA.token,
    body: {
      manga_id: fixtureMangaId,
      chapter_id: fixtureChapterId,
      page_number: 5,
    },
  });

  assert.equal(progressA.status, 200);

  const historyA = await api('/api/v1/library/history', { token: userA.token });
  const historyB = await api('/api/v1/library/history', { token: userB.token });

  assert.equal(historyA.status, 200);
  assert.equal(historyB.status, 200);
  assert.ok((historyA.data?.data || []).length > 0);
  assert.equal((historyB.data?.data || []).length, 0);

  const overviewA = await api('/api/v1/library/overview', { token: userA.token });
  const overviewB = await api('/api/v1/library/overview', { token: userB.token });

  assert.equal(overviewA.status, 200);
  assert.equal(overviewB.status, 200);
  assert.ok((overviewA.data?.recently_read || []).length >= 1);
  assert.equal((overviewB.data?.recently_read || []).length, 0);

  const settingsA = await api('/api/v1/settings', { token: userA.token });
  const settingsB = await api('/api/v1/settings', { token: userB.token });

  assert.equal(settingsA.status, 200);
  assert.equal(settingsB.status, 200);
  assert.notEqual(settingsA.data?.user_id, settingsB.data?.user_id);
});

test('progress flow: start/progress/end/mark-read and edge-cases', async (t) => {
  if (!dbReady) {
    t.skip('Database not available');
    return;
  }

  const user = await registerAndLogin();

  const start1 = await api('/api/v1/library/start-reading', {
    method: 'POST',
    token: user.token,
    body: {
      manga_id: fixtureMangaId,
      chapter_id: fixtureChapterId,
      page_number: 1,
    },
  });

  assert.equal(start1.status, 200);
  assert.ok(start1.data?.id);

  const start2 = await api('/api/v1/library/start-reading', {
    method: 'POST',
    token: user.token,
    body: {
      manga_id: fixtureMangaId,
      chapter_id: fixtureChapterId,
      page_number: 2,
    },
  });

  assert.equal(start2.status, 200);
  assert.equal(start2.data?.id, start1.data?.id, 'must reuse active session');

  const progressZero = await api('/api/v1/library/progress', {
    method: 'POST',
    token: user.token,
    body: {
      manga_id: fixtureMangaId,
      chapter_id: fixtureChapterId,
      page_number: 0,
    },
  });

  assert.equal(progressZero.status, 200);
  assert.equal(progressZero.data?.page_number, 0);

  const staleMangaPayload = await api('/api/v1/library/progress', {
    method: 'POST',
    token: user.token,
    body: {
      manga_id: '00000000-0000-0000-0000-000000000000',
      chapter_id: fixtureChapterId,
      page_number: 6,
    },
  });

  assert.equal(staleMangaPayload.status, 200);

  const invalidChapter = await api('/api/v1/library/progress', {
    method: 'POST',
    token: user.token,
    body: {
      manga_id: fixtureMangaId,
      chapter_id: '00000000-0000-0000-0000-000000000000',
      page_number: 2,
    },
  });

  assert.equal(invalidChapter.status, 404);

  const markRead = await api(`/api/v1/chapters/${fixtureChapterId}/read`, {
    method: 'PATCH',
    token: user.token,
  });

  assert.equal(markRead.status, 200);

  const end = await api('/api/v1/library/end-reading', {
    method: 'POST',
    token: user.token,
    body: {
      session_id: start1.data.id,
      end_page: 12,
      duration_seconds: 42,
    },
  });

  assert.equal(end.status, 200);
  assert.ok(end.data?.ended_at);

  const chapterAfter = await api(`/api/v1/chapters/${fixtureChapterId}`, {
    token: user.token,
  });

  assert.equal(chapterAfter.status, 200);
  assert.equal(chapterAfter.data?.is_read, true);
  assert.ok(Number(chapterAfter.data?.read_progress || 0) >= 12);

  const history = await api('/api/v1/library/history', { token: user.token });
  assert.equal(history.status, 200);
  assert.ok((history.data?.data || []).length >= 1);

  const overview = await api('/api/v1/library/overview', { token: user.token });
  assert.equal(overview.status, 200);
  assert.ok((overview.data?.stats?.read_chapters || 0) >= 1);
});