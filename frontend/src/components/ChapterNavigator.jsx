import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft, 
  ChevronRight, 
  List, 
  X,
  BookOpen,
  Check,
  Play
} from 'lucide-react';
import clsx from 'clsx';

/**
 * ChapterNavigator - A slide-out panel for chapter navigation
 */
export default function ChapterNavigator({
  isOpen,
  onClose,
  chapters = [],
  currentChapterId,
  onChapterSelect,
  mangaTitle
}) {
  const [filter, setFilter] = useState('all'); // all, unread, read

  const filteredChapters = chapters.filter(ch => {
    if (filter === 'unread') return !ch.is_read;
    if (filter === 'read') return ch.is_read;
    return true;
  });

  // Group chapters by volume
  const groupedChapters = filteredChapters.reduce((acc, chapter) => {
    const volume = chapter.volume || 'Chapters';
    if (!acc[volume]) acc[volume] = [];
    acc[volume].push(chapter);
    return acc;
  }, {});

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-dark-900 border-l border-dark-800 z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-dark-800">
              <div>
                <h2 className="font-semibold">{mangaTitle || 'Chapters'}</h2>
                <p className="text-sm text-gray-400">{chapters.length} chapters</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-dark-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filters */}
            <div className="flex gap-2 p-4 border-b border-dark-800">
              {[
                { value: 'all', label: 'All' },
                { value: 'unread', label: 'Unread' },
                { value: 'read', label: 'Read' }
              ].map(f => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-sm transition-colors',
                    filter === f.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-dark-800 text-gray-400 hover:text-white'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Chapter List */}
            <div className="flex-1 overflow-y-auto p-2">
              {Object.entries(groupedChapters).map(([volume, volChapters]) => (
                <div key={volume} className="mb-4">
                  <h3 className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {volume}
                  </h3>
                  <div className="space-y-1">
                    {volChapters.map((chapter) => (
                      <button
                        key={chapter.id}
                        onClick={() => {
                          onChapterSelect?.(chapter.id);
                          onClose();
                        }}
                        className={clsx(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                          chapter.id === currentChapterId
                            ? 'bg-primary-600/20 text-primary-400'
                            : 'hover:bg-dark-800 text-gray-300'
                        )}
                      >
                        <div className="flex-shrink-0">
                          {chapter.is_read ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <BookOpen className="w-4 h-4 text-gray-600" />
                          )}
                        </div>
                        <div className="flex-1 text-left">
                          <span className="text-sm font-medium">
                            Ch. {chapter.chapter_number}
                          </span>
                          {chapter.title && (
                            <span className="text-xs text-gray-500 ml-2">
                              {chapter.title}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">
                          {chapter.page_count}p
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {filteredChapters.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No chapters found
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * ChapterNavigationButtons - Simple prev/next buttons
 */
export function ChapterNavigationButtons({
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  className
}) {
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <button
        onClick={onPrev}
        disabled={!hasPrev}
        className={clsx(
          'flex items-center gap-1 px-3 py-2 rounded-lg transition-colors',
          hasPrev
            ? 'bg-dark-800 hover:bg-dark-700 text-white'
            : 'bg-dark-900 text-gray-600 cursor-not-allowed'
        )}
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="text-sm">Prev</span>
      </button>

      <button
        onClick={onNext}
        disabled={!hasNext}
        className={clsx(
          'flex items-center gap-1 px-3 py-2 rounded-lg transition-colors',
          hasNext
            ? 'bg-dark-800 hover:bg-dark-700 text-white'
            : 'bg-dark-900 text-gray-600 cursor-not-allowed'
        )}
      >
        <span className="text-sm">Next</span>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

