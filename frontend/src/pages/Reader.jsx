import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  List,
  Loader2,
} from 'lucide-react';
import clsx from 'clsx';
import { chapterApi, libraryApi, pageApi } from '../services/api';
import ChapterNavigator from '../components/ChapterNavigator';
import LoadingScreen from '../components/LoadingScreen';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function Reader() {
  const { chapterId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [currentPage, setCurrentPage] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [isChangingChapter, setIsChangingChapter] = useState(false);

  const containerRef = useRef(null);
  const pageRefs = useRef([]);
  const hideControlsTimerRef = useRef(null);
  const progressTimerRef = useRef(null);

  const readingSessionIdRef = useRef(null);
  const readingStartedAtRef = useRef(null);
  const currentPageRef = useRef(0);
  const restoredProgressRef = useRef(false);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  const invalidateReadingQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['libraryOverview'] });
    queryClient.invalidateQueries({ queryKey: ['libraryManga'] });
    queryClient.invalidateQueries({ queryKey: ['dashboardRecentRead'] });
    queryClient.invalidateQueries({ queryKey: ['recentReadPage'] });
    queryClient.invalidateQueries({ queryKey: ['history'] });
    queryClient.invalidateQueries({ queryKey: ['manga'] });
    queryClient.invalidateQueries({ queryKey: ['chapters'] });
    queryClient.invalidateQueries({ queryKey: ['chapter', chapterId] });
  }, [chapterId, queryClient]);

  const {
    data: chapter,
    isLoading: chapterLoading,
    isError: chapterError,
    error: chapterQueryError,
  } = useQuery({
    queryKey: ['chapter', chapterId],
    queryFn: ({ signal }) => chapterApi.getById(chapterId, { signal }),
    enabled: Boolean(chapterId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const {
    data: pages = [],
    isLoading: pagesLoading,
    isFetching: pagesFetching,
    isError: pagesError,
    error: pagesQueryError,
  } = useQuery({
    queryKey: ['pages', chapterId],
    queryFn: ({ signal }) => pageApi.getByChapterId(chapterId, { signal }),
    enabled: Boolean(chapterId),
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: chapters = [] } = useQuery({
    queryKey: ['chapters', chapter?.manga_id, 'reader-nav'],
    queryFn: ({ signal }) =>
      chapterApi.getByMangaId(
        chapter.manga_id,
        { sort: 'asc' },
        { signal }
      ),
    enabled: Boolean(chapter?.manga_id),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: nextChapter } = useQuery({
    queryKey: ['chapterNext', chapterId],
    queryFn: ({ signal }) => chapterApi.getNext(chapterId, { signal }),
    enabled: Boolean(chapterId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: prevChapter } = useQuery({
    queryKey: ['chapterPrev', chapterId],
    queryFn: ({ signal }) => chapterApi.getPrev(chapterId, { signal }),
    enabled: Boolean(chapterId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const totalPages = pages.length;
  const progressPercent =
    totalPages > 0 ? Math.round(((currentPage + 1) / totalPages) * 100) : 0;

  const savedPage = useMemo(() => {
    if (!chapter || totalPages === 0) return 0;
    return clamp(Number(chapter.read_progress || 0), 0, Math.max(totalPages - 1, 0));
  }, [chapter, totalPages]);

  const startReadingMutation = useMutation({
    mutationFn: (payload) => libraryApi.startReading(payload),
    onSuccess: (session) => {
      readingSessionIdRef.current = session?.id || null;
      readingStartedAtRef.current = Date.now();
      invalidateReadingQueries();
    },
  });

  const progressMutation = useMutation({
    mutationFn: (payload) => libraryApi.progress(payload),
    onSuccess: () => {
      invalidateReadingQueries();
    },
  });

  const endReadingMutation = useMutation({
    mutationFn: (payload) => libraryApi.endReading(payload),
    onSuccess: () => {
      readingSessionIdRef.current = null;
      readingStartedAtRef.current = null;
      invalidateReadingQueries();
    },
  });

  const markReadMutation = useMutation({
    mutationFn: () => chapterApi.markRead(chapterId),
    onSuccess: () => {
      invalidateReadingQueries();
    },
  });

  const revealControls = useCallback(() => {
  setShowControls(true);

  if (hideControlsTimerRef.current) {
    clearTimeout(hideControlsTimerRef.current);
  }

  hideControlsTimerRef.current = setTimeout(() => {
    setShowControls(false);
  }, 1200);
}, []);

  useEffect(() => {
    revealControls();
    return () => {
      if (hideControlsTimerRef.current) {
        clearTimeout(hideControlsTimerRef.current);
      }
    };
  }, [revealControls]);

  useEffect(() => {
    restoredProgressRef.current = false;
    readingSessionIdRef.current = null;
    readingStartedAtRef.current = null;
    currentPageRef.current = 0;
    pageRefs.current = [];
    setCurrentPage(0);
    setIsImageLoading(true);
    setShowControls(true);
    setNavigatorOpen(false);
  }, [chapterId]);

  const updateCurrentPageFromScroll = useCallback(() => {
    if (!containerRef.current || totalPages === 0) return;

    const scrollTop = containerRef.current.scrollTop;
    const viewportHeight = containerRef.current.clientHeight;

    let detectedPage = 0;

    for (let i = 0; i < pageRefs.current.length; i += 1) {
      const pageEl = pageRefs.current[i];
      if (!pageEl) continue;

      const rect = pageEl.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      const pageTop = rect.top - containerRect.top + scrollTop;

      if (scrollTop >= pageTop - viewportHeight / 2) {
        detectedPage = i;
      }
    }

    setCurrentPage(detectedPage);
  }, [totalPages]);

  useEffect(() => {
  const container = containerRef.current;
  if (!container) return;

  const onScroll = () => {
    updateCurrentPageFromScroll();
  };

  container.addEventListener('scroll', onScroll, { passive: true });
  return () => container.removeEventListener('scroll', onScroll);
}, [updateCurrentPageFromScroll]);

  useEffect(() => {
    if (!chapter?.manga_id || !chapterId) return;

    if (!readingSessionIdRef.current) {
      startReadingMutation.mutate({
        manga_id: chapter.manga_id,
        chapter_id: chapterId,
        page_number: savedPage,
      });
    }

    return () => {
      if (!readingSessionIdRef.current) return;

      const elapsedSeconds = readingStartedAtRef.current
        ? Math.max(0, Math.round((Date.now() - readingStartedAtRef.current) / 1000))
        : 0;

      endReadingMutation.mutate({
        session_id: readingSessionIdRef.current,
        end_page: currentPageRef.current,
        duration_seconds: elapsedSeconds,
      });
    };
  }, [chapter?.manga_id, chapterId, savedPage]);

  useEffect(() => {
    if (!chapter?.manga_id || !chapterId || totalPages === 0) return;

    if (progressTimerRef.current) {
      clearTimeout(progressTimerRef.current);
    }

    progressTimerRef.current = setTimeout(() => {
      progressMutation.mutate({
        manga_id: chapter.manga_id,
        chapter_id: chapterId,
        page_number: currentPage,
      });
    }, 400);

    return () => {
      if (progressTimerRef.current) {
        clearTimeout(progressTimerRef.current);
      }
    };
  }, [chapter?.manga_id, chapterId, currentPage, totalPages]);

  useEffect(() => {
    if (
      totalPages === 0 ||
      !chapterId ||
      currentPage !== totalPages - 1 ||
      markReadMutation.isPending
    ) {
      return;
    }

    if (!chapter?.is_read) {
      markReadMutation.mutate();
    }
  }, [chapter?.is_read, chapterId, currentPage, totalPages, markReadMutation]);

  useEffect(() => {
    if (!pages.length || !containerRef.current || restoredProgressRef.current) return;

    restoredProgressRef.current = true;

    const target = pageRefs.current[savedPage];
    if (target) {
      requestAnimationFrame(() => {
        target.scrollIntoView({ block: 'start' });
        setCurrentPage(savedPage);
        currentPageRef.current = savedPage;
      });
    }
  }, [pages, savedPage]);

  const goToPage = (pageIndex) => {
    const safeIndex = clamp(pageIndex, 0, totalPages - 1);
    const target = pageRefs.current[safeIndex];
    if (!target) return;

    revealControls();
    target.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
    setCurrentPage(safeIndex);
  };

  const changeChapter = async (targetChapterId) => {
    if (!targetChapterId || targetChapterId === chapterId) return;

    setIsChangingChapter(true);
    revealControls();
    navigate(`/reader/${targetChapterId}`);
  };

  useEffect(() => {
    if (!isChangingChapter) return;
    const timer = setTimeout(() => setIsChangingChapter(false), 700);
    return () => clearTimeout(timer);
  }, [isChangingChapter]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (navigatorOpen) {
          setNavigatorOpen(false);
          return;
        }

        if (chapter?.manga_id) {
          navigate(`/manga/${chapter.manga_id}`);
        }
      }

      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        if (currentPage < totalPages - 1) {
          goToPage(currentPage + 1);
        } else if (nextChapter?.id) {
          changeChapter(nextChapter.id);
        }
      }

      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        if (currentPage > 0) {
          goToPage(currentPage - 1);
        } else if (prevChapter?.id) {
          changeChapter(prevChapter.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    chapter?.manga_id,
    currentPage,
    totalPages,
    navigate,
    navigatorOpen,
    nextChapter?.id,
    prevChapter?.id,
  ]);

  if (chapterLoading || pagesLoading) {
    return <LoadingScreen />;
  }

  if (chapterError || pagesError || !chapter) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6">
        <div className="panel-soft max-w-lg p-8 text-center">
          <h2 className="text-xl font-semibold text-[var(--text)]">
            Unable to load chapter
          </h2>
          <p className="mt-2 text-sm text-muted">
            {chapterQueryError?.message ||
              pagesQueryError?.message ||
              'Chapter not found'}
          </p>
          <button
            onClick={() => navigate(-1)}
            className="accent-button mt-5"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (!pages.length) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6">
        <div className="panel-soft max-w-lg p-8 text-center">
          <h2 className="text-xl font-semibold text-[var(--text)]">
            No pages available
          </h2>
          <p className="mt-2 text-sm text-muted">
            This chapter has no pages to display yet.
          </p>
          <button
            onClick={() => navigate(`/manga/${chapter.manga_id}`)}
            className="accent-button mt-5"
          >
            Back to manga
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
  className="relative h-screen overflow-hidden bg-[var(--bg)]"
  onMouseMove={revealControls}
  onPointerDown={revealControls}
>
      <div
        ref={containerRef}
        className="scrollbar-soft h-screen overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-20 sm:px-6">
          <div className="space-y-4">
            {pages.map((page, index) => (
              <div
                key={page.id || `${chapterId}-${index}`}
                ref={(el) => {
                  pageRefs.current[index] = el;
                }}
                className="flex justify-center"
              >
                <img
                  loading={index <= 1 ? 'eager' : 'lazy'}
                  decoding="async"
                  src={page.url || page.display_path || page.image_path}
                  alt={`Page ${index + 1}`}
                  className="h-auto w-full rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-soft)]"
                  onLoad={() => {
                    if (index === 0) {
                      setIsImageLoading(false);
                    }
                  }}
                  onError={() => {
                    if (index === 0) {
                      setIsImageLoading(false);
                    }
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showControls && (
          <>
            <motion.div
              initial={{ opacity: 0, y: -14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              className="pointer-events-none absolute left-0 right-0 top-0 z-20 px-4 pt-4 sm:px-6"
            >
              <div className="glass-panel pointer-events-auto flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => navigate(`/manga/${chapter.manga_id}`)}
                  className="icon-chip"
                  aria-label="Back to manga"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text)]">
                    {chapter.manga_title || 'Manga'}
                  </p>
                  <p className="truncate text-xs text-muted">
                    Chapter {chapter.chapter_number}
                    {chapter.title ? ` • ${chapter.title}` : ''}
                  </p>
                </div>

                <div className="hidden items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-muted sm:flex">
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>
                    Page {currentPage + 1} / {totalPages}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setNavigatorOpen(true)}
                  className="icon-chip"
                  aria-label="Open chapter navigator"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 14 }}
              className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 px-4 pb-4 sm:px-6"
            >
              <div className="glass-panel pointer-events-auto flex flex-col gap-4 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (currentPage > 0) {
                        goToPage(currentPage - 1);
                      } else if (prevChapter?.id) {
                        changeChapter(prevChapter.id);
                      }
                    }}
                    disabled={currentPage === 0 && !prevChapter?.id}
                    className="ghost-button gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center justify-between text-xs text-muted">
                      <span>Reading progress</span>
                      <span>{progressPercent}%</span>
                    </div>

                    <input
                      type="range"
                      min={0}
                      max={Math.max(totalPages - 1, 0)}
                      value={currentPage}
                      onChange={(event) => goToPage(Number(event.target.value))}
                      className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--surface-2)] accent-[var(--primary)]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (currentPage < totalPages - 1) {
                        goToPage(currentPage + 1);
                      } else if (nextChapter?.id) {
                        changeChapter(nextChapter.id);
                      }
                    }}
                    disabled={currentPage === totalPages - 1 && !nextChapter?.id}
                    className="ghost-button gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs text-muted">
                  <span>
                    Page {currentPage + 1} of {totalPages}
                  </span>
                  <span>
                    {chapter.language ? chapter.language.toUpperCase() : 'UNK'}
                  </span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(startReadingMutation.isPending ||
          progressMutation.isPending ||
          endReadingMutation.isPending ||
          pagesFetching ||
          isChangingChapter) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute right-4 top-20 z-30 rounded-2xl bg-black/70 px-3 py-2 text-xs text-white backdrop-blur-md"
          >
            {isChangingChapter
              ? 'Opening chapter...'
              : pagesFetching
              ? 'Refreshing pages...'
              : 'Saving progress...'}
          </motion.div>
        )}

        {isImageLoading && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-[var(--bg)]"
          >
            <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
          </motion.div>
        )}
      </AnimatePresence>

      <ChapterNavigator
        isOpen={navigatorOpen}
        onClose={() => setNavigatorOpen(false)}
        chapters={chapters}
        currentChapterId={chapterId}
        mangaTitle={chapter.manga_title}
        onChapterSelect={(targetChapterId) => {
          setNavigatorOpen(false);
          changeChapter(targetChapterId);
        }}
      />
    </div>
  );
}