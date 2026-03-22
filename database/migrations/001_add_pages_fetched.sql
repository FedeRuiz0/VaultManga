ALTER TABLE chapters
ADD COLUMN IF NOT EXISTS pages_fetched BOOLEAN DEFAULT FALSE;

UPDATE chapters c
SET pages_fetched = TRUE
WHERE EXISTS (
  SELECT 1
  FROM pages p
  WHERE p.chapter_id = c.id
);
