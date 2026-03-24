ALTER TABLE chapters
ADD COLUMN IF NOT EXISTS language VARCHAR(20) NOT NULL DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS idx_chapters_manga_language
ON chapters (manga_id, language);