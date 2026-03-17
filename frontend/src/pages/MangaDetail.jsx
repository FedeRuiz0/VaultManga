import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  Heart, 
  BookOpen, 
  Play, 
  MoreVertical,
  ChevronRight,
  Check,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { mangaApi, chapterApi, libraryApi } from '../services/api';
import LoadingScreen from '../components/LoadingScreen';
import clsx from 'clsx';

export default function MangaDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sortOrder, setSortOrder] = useState('asc');

  const { data: mangaData, isLoading: mangaLoading } = useQuery(
    ['manga', id],
    () => mangaApi.getById(id)
  );

  const { data: chaptersData, isLoading: chaptersLoading } = useQuery(
    ['chapters', id, sortOrder],
    () => chapterApi.getByManga(id, sortOrder)
  );

  const manga = mangaData?.data || mangaData; 
  const chapters = chaptersData?.data || chaptersData || [];

  const handleToggleFavorite = async () => {
    await mangaApi.toggleFavorite(id);
    // Refetch would be handled by react-query
  };

  const handleReadChapter = async (chapterId) => {
    // Start reading session
    await libraryApi.startReading({
      manga_id: id,
      chapter_id: chapterId,
    });
    navigate(`/reader/${chapterId}`);
  };

  const handleContinueReading = async () => {
    // Find the first unread chapter or continue from last read
    const nextChapter = chapters.find(c => !c.is_read) || chapters[0];
    if (nextChapter) {
      handleReadChapter(nextChapter.id);
    }
  };

  if (mangaLoading || chaptersLoading) {
    return <LoadingScreen />;
  }

  if (!manga) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold">Manga not found</h2>
        <button 
          onClick={() => navigate('/library')}
          className="mt-4 text-primary-400 hover:text-primary-300"
        >
          Back to Library
        </button>
      </div>
    );
  }

  // Calculate progress
  const readChapters = chapters.filter(c => c.is_read).length;
  const totalChapters = chapters.length;
  const progress = totalChapters > 0 ? Math.round((readChapters / totalChapters) * 100) : 0;

  return (
    <div className="min-h-screen">
      {/* Back button */}
      <button 
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        Back
      </button>

      {/* Hero Section */}
      <div className="relative mb-8">
        {/* Background blur */}
        {manga.cover_image && (
          <div className="absolute inset-0 overflow-hidden rounded-2xl">
            <div className="absolute inset-0 bg-gradient-to-t from-dark-950 via-dark-950/80 to-dark-950/40" />
            <img 
              src={manga.cover_image} 
              alt=""
              className="w-full h-full object-cover blur-3xl opacity-30 scale-110"
            />
          </div>
        )}

        <div className="relative flex flex-col md:flex-row gap-6">
          {/* Cover */}
          <div className="w-48 md:w-64 flex-shrink-0">
            <div className="aspect-[3/4] rounded-xl overflow-hidden bg-dark-800 shadow-2xl">
              {manga.cover_image ? (
                <img 
                  src={manga.cover_image} 
                  alt={manga.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <BookOpen className="w-16 h-16 text-dark-600" />
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 pt-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold font-display mb-2">
                  {manga.title}
                </h1>
                {manga.alt_titles?.length > 0 && (
                  <p className="text-gray-400 mb-4">
                    {manga.alt_titles.slice(0, 3).join(' • ')}
                  </p>
                )}
              </div>
              <button
                onClick={handleToggleFavorite}
                className={clsx(
                  'p-3 rounded-xl transition-all',
                  manga.is_favorite 
                    ? 'bg-accent-500/20 text-accent-400' 
                    : 'bg-dark-800 text-gray-400 hover:bg-dark-700'
                )}
              >
                <Heart className={clsx('w-6 h-6', manga.is_favorite && 'fill-current')} />
              </button>
            </div>

            {/* Meta */}
            <div className="flex flex-wrap gap-4 mb-6 text-sm">
              {manga.author && (
                <span className="text-gray-400">
                  <span className="text-gray-500">Author:</span> {manga.author}
                </span>
              )}
              {manga.artist && (
                <span className="text-gray-400">
                  <span className="text-gray-500">Artist:</span> {manga.artist}
                </span>
              )}
              {manga.year && (
                <span className="text-gray-400">
                  <span className="text-gray-500">Year:</span> {manga.year}
                </span>
              )}
              <span className={clsx(
                'px-2 py-1 rounded-md text-xs font-medium',
                manga.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                manga.status === 'ongoing' ? 'bg-blue-500/20 text-blue-400' :
                'bg-yellow-500/20 text-yellow-400'
              )}>
                {manga.status}
              </span>
              {manga.is_incomplete && (
                <span className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-amber-500/20 text-amber-400">
                  <AlertTriangle className="w-3 h-3" />
                  Incomplete
                </span>
              )}
            </div>

            {/* Genres */}
            {manga.genre?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {manga.genre.map((g) => (
                  <span 
                    key={g} 
                    className="px-3 py-1 bg-dark-800 rounded-full text-sm text-gray-300"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Description */}
            {manga.description && (
              <p className="text-gray-300 mb-6 line-clamp-3">
                {manga.description}
              </p>
            )}

            {/* Progress */}
            <div className="mb-6">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-400">Reading Progress</span>
                <span className="font-medium">{readChapters}/{totalChapters} chapters ({progress}%)</span>
              </div>
              <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary-500 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleContinueReading}
                disabled={chapters.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-medium transition-colors"
              >
                <Play className="w-5 h-5" />
                {readChapters > 0 ? 'Continue Reading' : 'Start Reading'}
              </button>
              <button className="p-3 bg-dark-800 hover:bg-dark-700 rounded-xl transition-colors">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Chapters List */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold font-display">Chapters</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSortOrder('asc')}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-sm',
                sortOrder === 'asc' ? 'bg-dark-800 text-white' : 'text-gray-400'
              )}
            >
              ↑ Oldest
            </button>
            <button
              onClick={() => setSortOrder('desc')}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-sm',
                sortOrder === 'desc' ? 'bg-dark-800 text-white' : 'text-gray-400'
              )}
            >
              ↓ Newest
            </button>
          </div>
        </div>

        {chapters.length > 0 ? (
          <div className="space-y-2">
            {chapters.map((chapter, index) => (
              <motion.div
                key={chapter.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.02 }}
                className={clsx(
                  'flex items-center gap-4 p-4 rounded-xl border transition-all',
                  chapter.is_read 
                    ? 'bg-dark-900/50 border-dark-800' 
                    : 'bg-dark-900 border-dark-800 hover:border-dark-700'
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 text-sm">
                      Ch. {chapter.chapter_number}
                    </span>
                    {chapter.title && (
                      <span className="text-gray-300 truncate">
                        {chapter.title}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                    <span>{chapter.page_count || 0} pages</span>
                    {chapter.first_read_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Read {new Date(chapter.first_read_at).toLocaleDateString()}
                      </span>
                    )}
                    {chapter.read_count > 0 && (
                      <span>Read {chapter.read_count}x</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {chapter.is_read && (
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <Check className="w-4 h-4" />
                    </span>
                  )}
                  <button
                    onClick={() => handleReadChapter(chapter.id)}
                    className="p-2 rounded-lg bg-dark-800 hover:bg-dark-700 transition-colors"
                  >
                    <Play className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-dark-900 rounded-xl">
            <BookOpen className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No chapters found</p>
          </div>
        )}
      </section>
    </div>
  );
}

