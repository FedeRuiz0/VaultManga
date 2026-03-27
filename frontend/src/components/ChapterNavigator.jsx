import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  Check,
  ChevronRight,
  ListFilter,
  X,
} from 'lucide-react';
import clsx from 'clsx';

export default function ChapterNavigator({
  isOpen,
  onClose,
  chapters = [],
  currentChapterId,
  onChapterSelect,
  mangaTitle,
}) {
  const [filter, setFilter] = useState('all');

  const filteredChapters = useMemo(() => {
    return chapters.filter((chapter) => {
      if (filter === 'read') return chapter.is_read;
      if (filter === 'unread') return !chapter.is_read;
      return true;
    });
  }, [chapters, filter]);

  const groupedChapters = useMemo(() => {
    return filteredChapters.reduce((acc, chapter) => {
      const volume = chapter.volume || 'Chapters';
      if (!acc[volume]) acc[volume] = [];
      acc[volume].push(chapter);
      return acc;
    }, {});
  }, [filteredChapters]);

  const filterOptions = [
    { value: 'all', label: 'All' },
    { value: 'unread', label: 'Unread' },
    { value: 'read', label: 'Read' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-label="Close chapter navigator backdrop"
          />

          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-[var(--text)]">
                  {mangaTitle || 'Chapters'}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {chapters.length} chapters available
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="icon-chip"
                aria-label="Close chapter navigator"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-[var(--border)] px-5 py-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted">
                <ListFilter className="h-3.5 w-3.5" />
                Filter
              </div>

              <div className="flex gap-2">
                {filterOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFilter(option.value)}
                    className={clsx(
                      'rounded-full px-3 py-2 text-xs font-medium transition',
                      filter === option.value
                        ? 'bg-[var(--primary)] text-white'
                        : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="scrollbar-soft flex-1 overflow-y-auto px-4 py-4">
              {Object.entries(groupedChapters).length === 0 ? (
                <div className="panel-soft p-6 text-center text-sm text-muted">
                  No chapters found for this filter.
                </div>
              ) : (
                <div className="space-y-5">
                  {Object.entries(groupedChapters).map(([volume, volumeChapters]) => (
                    <div key={volume} className="space-y-3">
                      <div className="px-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                        {volume}
                      </div>

                      <div className="space-y-2">
                        {volumeChapters.map((chapter) => {
                          const active = chapter.id === currentChapterId;

                          return (
                            <button
                              key={chapter.id}
                              type="button"
                              onClick={() => onChapterSelect?.(chapter.id)}
                              className={clsx(
                                'flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition',
                                active
                                  ? 'border-[var(--ring)] bg-[var(--primary-soft)]'
                                  : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]'
                              )}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-[var(--text)]">
                                    Ch. {chapter.chapter_number}
                                  </span>
                                  {chapter.is_read ? (
                                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400">
                                      Read
                                    </span>
                                  ) : null}
                                </div>

                                <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                                  <BookOpen className="h-3.5 w-3.5" />
                                  <span className="truncate">
                                    {chapter.title || 'Untitled chapter'}
                                  </span>
                                </div>
                              </div>

                              <div className="ml-4 flex items-center gap-2">
                                {active ? (
                                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--primary)] text-white">
                                    <Check className="h-4 w-4" />
                                  </div>
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted" />
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}