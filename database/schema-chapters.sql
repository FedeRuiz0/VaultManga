CREATE TABLE IF NOT EXISTS chapters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    manga_id UUID NOT NULL REFERENCES manga(id) ON DELETE CASCADE,
    mangadex_id TEXT UNIQUE,
    chapter_number TEXT,
    volume TEXT,
    title TEXT,
    language TEXT,
    pages INT DEFAULT 0,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chapters_manga_id ON chapters(manga_id);
CREATE INDEX IF NOT EXISTS idx_chapters_mangadex ON chapters(mangadex_id);

GRANT ALL PRIVILEGES ON TABLE chapters TO mangavault;

