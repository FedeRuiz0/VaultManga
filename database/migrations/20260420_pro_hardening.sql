-- PRO+ hardening: per-user favorites + query indexes + scoped recommendation feedback

CREATE TABLE IF NOT EXISTS user_favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  manga_id UUID NOT NULL REFERENCES manga(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, manga_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user_manga
  ON user_favorites(user_id, manga_id);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user_created
  ON user_favorites(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_history_user_chapter_page
  ON reading_history(user_id, chapter_id, page_number DESC);

CREATE INDEX IF NOT EXISTS idx_history_user_manga_readat
  ON reading_history(user_id, manga_id, read_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_user_active
  ON reading_sessions(user_id, manga_id, chapter_id, started_at DESC)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_manga_created
  ON bookmarks(user_id, manga_id, created_at DESC);

ALTER TABLE recommendation_feedback
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_reco_feedback_user_created
  ON recommendation_feedback(user_id, created_at DESC);
