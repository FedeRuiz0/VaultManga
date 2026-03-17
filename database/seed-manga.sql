-- MangaVault Sample Data Seed
-- Run this with: docker compose exec postgres psql -U mangavault -d mangavault -f seed-manga.sql

-- Insert sample manga
INSERT INTO manga (title, alt_titles, description, source_path, genre, author, artist, status, year, cover_image, is_favorite) VALUES
('One Piece', ARRAY['ワンピース'], 'Gol D. Roger, a man referred to as the "Pirate King," has been executed... Join Monkey D. Luffy on his quest to become Pirate King!', '/manga/library/One Piece', ARRAY['Action', 'Adventure', 'Shounen'], 'Eiichiro Oda', 'Eiichiro Oda', 'ongoing', 1997, '/storage/covers/one-piece.jpg', true),
('Naruto', ARRAY['ナルト'], 'Twelve years before the start of the series, the Nine-Tailed Demon Fox attacked the Hidden Leaf Village...', '/manga/library/Naruto', ARRAY['Action', 'Adventure', 'Shounen'], 'Masashi Kishimoto', 'Masashi Kishimoto', 'completed', 1999, '/storage/covers/naruto.jpg', false),
('Attack on Titan', ARRAY['進撃の巨人'], 'Humanity has been devastated by the bizarre, giant humanoids with regenerative abilities known as Titans...', '/manga/library/Attack on Titan', ARRAY['Action', 'Drama', 'Dark Fantasy'], 'Hajime Isayama', 'Hajime Isayama', 'completed', 2009, '/storage/covers/aot.jpg', true),
('Jujutsu Kaisen', ARRAY['呪術廻
