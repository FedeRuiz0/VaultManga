-- MangaVault Database Schema
-- PostgreSQL 15+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Manga table
CREATE TABLE manga (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    alt_titles TEXT[],
    description TEXT,
    cover_image TEXT,
    source_path TEXT NOT NULL,
    genre JSONB DEFAULT '[]',
    author VARCHAR(255),
    artist VARCHAR(255),
    status VARCHAR(50) DEFAULT 'ongoing', -- ongoing, completed, hiatus, cancelled
    year INTEGER,
    is_favorite BOOLEAN DEFAULT FALSE,
    is_incomplete BOOLEAN DEFAULT FALSE,
    last_read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for manga
CREATE INDEX idx_manga_title ON manga USING gin(title gin_trgm_ops);
CREATE INDEX idx_manga_status ON manga(status);
CREATE INDEX idx_manga_favorite ON manga(is_favorite);
CREATE INDEX idx_manga_incomplete ON manga(is_incomplete);
CREATE INDEX idx_manga_last_read ON manga(last_read_at DESC);

-- Chapters table
CREATE TABLE chapters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    manga_id UUID NOT NULL REFERENCES manga(id) ON DELETE CASCADE,
    chapter_number VARCHAR(20) NOT NULL,
    volume VARCHAR(20),
    title VARCHAR(500),
    source_path TEXT NOT NULL,
    page_count INTEGER DEFAULT 0,
    is_read BOOLEAN DEFAULT FALSE,
    is_downloaded BOOLEAN DEFAULT FALSE,
    read_progress INTEGER DEFAULT 0, -- last page read (0-indexed)
    read_count INTEGER DEFAULT 0,
    first_read_at TIMESTAMP WITH TIME ZONE,
    last_read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(manga_id, chapter_number)
);

-- Indexes for chapters
CREATE INDEX idx_chapters_manga ON chapters(manga_id);
CREATE INDEX idx_chapters_number ON chapters(manga_id, chapter_number::numeric);
CREATE INDEX idx_chapters_read ON chapters(is_read);

-- Pages table
CREATE TABLE pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    image_path TEXT NOT NULL,
    image_url TEXT,
    width INTEGER,
    height INTEGER,
    file_size INTEGER,
    is_cached BOOLEAN DEFAULT FALSE,
    cached_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chapter_id, page_number)
);

-- Indexes for pages
CREATE INDEX idx_pages_chapter ON pages(chapter_id);
CREATE INDEX idx_pages_number ON pages(chapter_id, page_number);

-- Reading sessions table (for analytics)
CREATE TABLE reading_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    manga_id UUID NOT NULL REFERENCES manga(id) ON DELETE CASCADE,
    chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    start_page INTEGER DEFAULT 0,
    end_page INTEGER,
    duration_seconds INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for reading sessions
CREATE INDEX idx_sessions_user ON reading_sessions(user_id);
CREATE INDEX idx_sessions_manga ON reading_sessions(manga_id);
CREATE INDEX idx_sessions_started ON reading_sessions(started_at DESC);

-- Reading history (detailed progress)
CREATE TABLE reading_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    manga_id UUID NOT NULL REFERENCES manga(id) ON DELETE CASCADE,
    chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, chapter_id, page_number)
);

-- Indexes for reading history
CREATE INDEX idx_history_user ON reading_history(user_id);
CREATE INDEX idx_history_manga ON reading_history(manga_id);

-- Bookmarks table
CREATE TABLE bookmarks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    manga_id UUID NOT NULL REFERENCES manga(id) ON DELETE CASCADE,
    chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE,
    page_number INTEGER,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Manga statistics (cached/precomputed)
CREATE TABLE manga_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    manga_id UUID UNIQUE NOT NULL REFERENCES manga(id) ON DELETE CASCADE,
    total_reads INTEGER DEFAULT 0,
    total_read_time_seconds INTEGER DEFAULT 0,
    average_read_time_per_chapter INTEGER DEFAULT 0,
    completion_percentage REAL DEFAULT 0,
    last_calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for manga stats
CREATE INDEX idx_manga_stats_manga ON manga_stats(manga_id);

-- User preferences
CREATE TABLE user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme VARCHAR(20) DEFAULT 'dark',
    reader_mode VARCHAR(20) DEFAULT 'vertical', -- vertical, horizontal, webtoon
    reader_direction VARCHAR(20) DEFAULT 'rtl',
    prefetch_chapters INTEGER DEFAULT 2,
    show_page_number BOOLEAN DEFAULT TRUE,
    auto_advance BOOLEAN DEFAULT TRUE,
    reading_goal INTEGER DEFAULT 0, -- chapters per week
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- AI Recommendations cache
CREATE TABLE recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    manga_id UUID NOT NULL REFERENCES manga(id) ON DELETE CASCADE,
    score REAL DEFAULT 0,
    reason TEXT,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, manga_id)
);

-- Indexes for recommendations
CREATE INDEX idx_recommendations_user ON recommendations(user_id);
CREATE INDEX idx_recommendations_score ON recommendations(user_id, score DESC);

-- Incomplete manga detection log
CREATE TABLE incomplete_manga_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    manga_id UUID NOT NULL REFERENCES manga(id) ON DELETE CASCADE,
    chapter_number VARCHAR(20),
    issue_type VARCHAR(50) NOT NULL, -- missing_chapter, missing_page, corrupted_page
    details JSONB,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for incomplete log
CREATE INDEX idx_incomplete_manga ON incomplete_manga_log(manga_id);
CREATE INDEX idx_incomplete_type ON incomplete_manga_log(issue_type);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_manga_updated_at BEFORE UPDATE ON manga
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chapters_updated_at BEFORE UPDATE ON chapters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views for common queries

-- Manga with reading progress
CREATE OR REPLACE VIEW manga_with_progress AS
SELECT 
    m.*,
    COALESCE(c.total_chapters, 0) as total_chapters,
    COALESCE(c.read_chapters, 0) as read_chapters,
    COALESCE(c.last_chapter, '') as last_chapter_read,
    COALESCE(ms.total_read_time_seconds, 0) as total_read_time
FROM manga m
LEFT JOIN (
    SELECT 
        manga_id,
        COUNT(*) as total_chapters,
        COUNT(*) FILTER (WHERE is_read) as read_chapters,
        MAX(chapter_number) as last_chapter
    FROM chapters
    GROUP BY manga_id
) c ON m.id = c.manga_id
LEFT JOIN manga_stats ms ON m.id = ms.manga_id;

-- Incomplete chapters view
CREATE VIEW incomplete_chapters AS
SELECT 
    m.id as manga_id,
    m.title as manga_title,
    c.chapter_number,
    c.page_count,
    CASE 
        WHEN c.page_count = 0 THEN 'missing_pages'
        WHEN p.missing_pages > 0 THEN 'incomplete_pages'
        ELSE 'unknown'
    END as issue_type
FROM manga m
JOIN chapters c ON m.id = c.manga_id
LEFT JOIN LATERAL (
    SELECT COUNT(*) as missing_pages
    FROM pages p
    WHERE p.chapter_id = c.id AND p.image_path IS NULL
) p ON true
WHERE c.page_count = 0 OR p.missing_pages > 0;

-- Insert default user preferences trigger
CREATE OR REPLACE FUNCTION create_user_preferences()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_preferences (user_id) VALUES (NEW.id);
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER create_user_preferences_after_insert
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION create_user_preferences();

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mangavault;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mangavault;

